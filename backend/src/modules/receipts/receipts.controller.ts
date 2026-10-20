import type { Request, Response } from "express";
import { AppError } from "../../lib/AppError";
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
