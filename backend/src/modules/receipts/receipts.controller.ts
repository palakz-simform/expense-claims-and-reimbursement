import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../lib/AppError";
import { logger } from "../../lib/logger";
import * as receiptsService from "./receipts.service";

// POST /line-items/:id/receipts: the file was already saved by the upload middleware
export async function upload(req: Request, res: Response) {
  const user = req.user!;
  const lineItemId = req.params.id as string;

  const file = req.file;
  if (!file) {
    throw new AppError(400, "VALIDATION_ERROR", 'Send the receipt as one file in the "file" field', [
      { in: "body", path: "file", message: "A file is required" },
    ]);
  }

  const receipt = await receiptsService.addReceipt(user, lineItemId, file);
  res.status(201).json(receipt);
}

// GET /receipts/:id: stream the file as a download after the service proved the caller may see it
export async function download(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  const receiptId = req.params.id as string;

  const { filePath, originalName, mimeType } = await receiptsService.getReceiptFile(user, receiptId);

  // The type comes from what we verified at upload, never from the file name; attachment stops browsers rendering it in place
  res.attachment(originalName);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, no-store");

  res.sendFile(filePath, { cacheControl: false }, (error) => {
    if (!error) return;

    // The row exists but the file is gone: a server-side problem, so log it and answer like a missing receipt
    logger.error({ err: error, receiptId }, "Receipt file could not be sent");
    if (!res.headersSent) {
      res.removeHeader("Content-Disposition");
      next(new AppError(404, "NOT_FOUND", "Receipt file not found"));
    }
  });
}
