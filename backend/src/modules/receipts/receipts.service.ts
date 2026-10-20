import path from "node:path";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { lockEditableClaim } from "../../lib/claimLock";
import { claimScopeFor } from "../../lib/claimScope";
import { logger } from "../../lib/logger";
import { removeStoredFile, verifyReceiptFile } from "../../lib/receiptFiles";
import { ClaimStatus } from "../../generated/prisma/enums";
import type { AuthUser } from "../../types/express";
import { MAX_RECEIPTS_PER_LINE_ITEM } from "./receipts.schemas";

// API shape of a receipt: never the stored file name or path, which are internal
export const receiptSelect = {
  id: true,
  lineItemId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
} as const;

// The file multer already saved. If anything below fails, the file is deleted so nothing is orphaned.
export async function addReceipt(user: AuthUser, lineItemId: string, file: Express.Multer.File) {
  try {
    // Cheap check first: the content must really be the type the client claimed
    await verifyReceiptFile(file.path, file.mimetype);

    return await prisma.$transaction(async (tx) => {
      // Find which claim the item belongs to. The claim lock below proves it is the caller's own (else 404).
      const item = await tx.lineItem.findUnique({ where: { id: lineItemId }, select: { claimId: true } });
      if (!item) {
        throw new AppError(404, "NOT_FOUND", "Line item not found");
      }
      const claimId = item.claimId;

      // Lock the claim (so the count below cannot race another upload), then check the item still exists
      const locked = await lockEditableClaim(tx, user, claimId);
      const stillThere = await tx.lineItem.findFirst({ where: { id: lineItemId, claimId }, select: { id: true } });
      if (!stillThere) {
        throw new AppError(404, "NOT_FOUND", "Line item not found");
      }

      const receiptCount = await tx.receipt.count({ where: { lineItemId } });
      if (receiptCount >= MAX_RECEIPTS_PER_LINE_ITEM) {
        throw new AppError(422, "RECEIPT_LIMIT_REACHED", `A line item can have at most ${MAX_RECEIPTS_PER_LINE_ITEM} receipts`);
      }

      // The client's file name is stored only to show it back; the file on disk has its own random name
      const receipt = await tx.receipt.create({
        data: {
          lineItemId,
          originalName: file.originalname.slice(0, 255),
          storedName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
        select: receiptSelect,
      });
      await tx.claim.update({ where: { id: claimId }, data: { updatedAt: new Date() } });

      // Audit trail for a claim that was already submitted (a draft has no history yet)
      if (locked.status !== ClaimStatus.DRAFT) {
        await tx.claimHistory.create({
          data: {
            claimId,
            action: "RECEIPT_ADDED",
            performedById: user.id,
            metadata: { itemId: lineItemId, receiptId: receipt.id, mimeType: receipt.mimeType, sizeBytes: receipt.sizeBytes },
          },
        });
      }

      return receipt;
    });
  } catch (error) {
    // Nothing was saved, so the uploaded file must go; a failed cleanup is logged, not allowed to hide the real error
    await removeStoredFile(file.path).catch((cleanupError) => {
      logger.error({ err: cleanupError, file: file.filename }, "Could not delete an uploaded receipt file");
    });
    throw error;
  }
}

// Finds a receipt the caller may see and where its file is. The claim scope is IN the query, so a receipt
// of a claim outside the caller's scope is simply not found (404), exactly like one that does not exist.
export async function getReceiptFile(user: AuthUser, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, lineItem: { claim: claimScopeFor(user) } },
    select: { originalName: true, storedName: true, mimeType: true },
  });
  if (!receipt) {
    throw new AppError(404, "NOT_FOUND", "Receipt not found");
  }

  // basename keeps the path inside UPLOAD_DIR even if a stored name were ever tampered with
  const filePath = path.join(env.UPLOAD_DIR, path.basename(receipt.storedName));

  return { filePath, originalName: receipt.originalName, mimeType: receipt.mimeType };
}
