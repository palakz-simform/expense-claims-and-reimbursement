import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { lockEditableClaim } from "../../lib/claimLock";
import { claimScopeFor } from "../../lib/claimScope";
import { logger } from "../../lib/logger";
import { recordHistory, recordHistoryMany } from "../../lib/recordHistory";
import { removeStoredFile, verifyReceiptFile } from "../../lib/receiptFiles";
import { receiptStorage } from "../../lib/storage";
import type { Prisma } from "../../generated/prisma/client";
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

// The file multer saved in the temp folder. It is checked, handed to the storage, then the temp copy is always removed.
// If anything fails after the storage took it, the stored file is deleted too, so nothing is orphaned.
export async function addReceipt(user: AuthUser, lineItemId: string, file: Express.Multer.File) {
  const key = file.filename;
  let storedInStorage = false;

  try {
    // Cheap check first: the content must really be the type the client claimed
    await verifyReceiptFile(file.path, file.mimetype);

    // Authorize before the expensive work: someone else's line item is refused before anything is uploaded.
    // (The transaction below still does the real checks under the claim lock.)
    const owned = await prisma.lineItem.findFirst({
      where: { id: lineItemId, claim: { claimantId: user.id } },
      select: { id: true },
    });
    if (!owned) {
      throw new AppError(404, "NOT_FOUND", "Line item not found");
    }

    // Stored BEFORE the transaction: a slow upload must never hold the claim lock. The cost is that a request refused
    // below (limit reached, claim locked) uploads once and deletes again, which is cleaned up in the catch.
    // The flag is set first: if the upload fails after the bucket accepted it, the catch still tries to remove it.
    storedInStorage = true;
    await receiptStorage.save(key, file.path, file.mimetype);

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
        await recordHistory(tx, {
          claimId,
          action: "RECEIPT_ADDED",
          performedById: user.id,
          metadata: { itemId: lineItemId, receiptId: receipt.id, mimeType: receipt.mimeType, sizeBytes: receipt.sizeBytes },
        });
      }

      return receipt;
    });
  } catch (error) {
    // No receipt row was saved, so the stored file must go; a failed cleanup is logged, not allowed to hide the real error
    if (storedInStorage) {
      await receiptStorage.remove(key).catch((cleanupError) => {
        logger.error({ err: cleanupError, key }, "Could not delete an uploaded receipt file");
      });
    }
    throw error;
  } finally {
    // The temp copy is never needed after this request, whatever the outcome
    await removeStoredFile(file.path).catch((cleanupError) => {
      logger.error({ err: cleanupError, file: file.filename }, "Could not delete a temporary upload");
    });
  }
}

// Finds a receipt the caller may see and opens its file. The claim scope is IN the query, so a receipt
// of a claim outside the caller's scope is simply not found (404), exactly like one that does not exist.
export async function getReceiptFile(user: AuthUser, receiptId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, lineItem: { claim: claimScopeFor(user) } },
    select: { originalName: true, storedName: true, mimeType: true },
  });
  if (!receipt) {
    throw new AppError(404, "NOT_FOUND", "Receipt not found");
  }

  // Throws StoredFileNotFoundError when the row exists but the file does not (the controller answers 404)
  const stream = await receiptStorage.open(receipt.storedName);

  return { stream, originalName: receipt.originalName, mimeType: receipt.mimeType };
}

// Remove a receipt: the row, the history, then (after the commit) the file.
// Same rules as adding one: only the owner, and not on an approved claim.
export async function deleteReceipt(user: AuthUser, receiptId: string): Promise<void> {
  const storedName = await prisma.$transaction(async (tx) => {
    // Which claim the receipt is under; the claim lock below proves it is the caller's own (else 404)
    const receipt = await tx.receipt.findUnique({
      where: { id: receiptId },
      select: { storedName: true, originalName: true, lineItemId: true, lineItem: { select: { claimId: true } } },
    });
    if (!receipt) {
      throw new AppError(404, "NOT_FOUND", "Receipt not found");
    }
    const claimId = receipt.lineItem.claimId;

    const locked = await lockEditableClaim(tx, user, claimId);

    // Conditional delete: if a concurrent request already removed it, count is 0 and this one is a 404
    const deleted = await tx.receipt.deleteMany({ where: { id: receiptId } });
    if (deleted.count === 0) {
      throw new AppError(404, "NOT_FOUND", "Receipt not found");
    }
    await tx.claim.update({ where: { id: claimId }, data: { updatedAt: new Date() } });

    // Audit trail for a claim that was already submitted (a draft has no history yet)
    if (locked.status !== ClaimStatus.DRAFT) {
      await recordHistory(tx, {
        claimId,
        action: "RECEIPT_REMOVED",
        performedById: user.id,
        metadata: { itemId: receipt.lineItemId, receiptId, originalName: receipt.originalName },
      });
    }

    return receipt.storedName;
  });

  // Only after the commit: if the delete had failed, the file must still be there. A failure here leaves an orphan file, so it is logged.
  await receiptStorage.remove(storedName).catch((error) => {
    logger.error({ err: error, receiptId }, "Receipt row deleted but its file could not be removed");
  });
}

// Used when a line item or a draft claim is deleted: removes the receipt rows it owns, inside the caller's transaction.
// The receipt foreign key is Restrict, so these rows must go first. Returns the stored names so the files can be removed after the commit.
export async function removeReceiptRows(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  claimId: string,
  claimStatus: ClaimStatus,
  where: Prisma.ReceiptWhereInput,
): Promise<string[]> {
  const receipts = await tx.receipt.findMany({
    where,
    select: { id: true, lineItemId: true, originalName: true, storedName: true },
  });
  if (receipts.length === 0) {
    return [];
  }

  await tx.receipt.deleteMany({ where: { id: { in: receipts.map((receipt) => receipt.id) } } });

  // A draft has no history yet; a submitted claim records each removed receipt
  if (claimStatus !== ClaimStatus.DRAFT) {
    await recordHistoryMany(
      tx,
      receipts.map((receipt) => ({
        claimId,
        action: "RECEIPT_REMOVED" as const,
        performedById: user.id,
        metadata: { itemId: receipt.lineItemId, receiptId: receipt.id, originalName: receipt.originalName },
      })),
    );
  }

  return receipts.map((receipt) => receipt.storedName);
}

// Delete the files of receipts whose rows are already gone. Call it only AFTER the transaction committed.
export async function removeReceiptFiles(storedNames: string[]): Promise<void> {
  await Promise.all(
    storedNames.map((storedName) =>
      receiptStorage.remove(storedName).catch((error) => {
        logger.error({ err: error, storedName }, "Receipt row deleted but its file could not be removed");
      }),
    ),
  );
}
