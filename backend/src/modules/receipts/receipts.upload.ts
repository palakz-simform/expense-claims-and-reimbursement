import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../../config/env";
import { AppError } from "../../lib/AppError";
import { MAX_RECEIPT_BYTES, RECEIPT_EXTENSIONS } from "../../lib/receiptFiles";

// Where and under what name a file is saved. The name is random, so the client's filename can
// never choose a path (path traversal) or overwrite another receipt.
const storage = multer.diskStorage({
  destination: env.UPLOAD_DIR,
  filename: (_req, file, callback) => {
    const extension = RECEIPT_EXTENSIONS[file.mimetype];
    callback(null, `${randomUUID()}${extension}`);
  },
});

// First gate: only the allowed Content-Types are saved at all (the content itself is checked after saving)
const multerUpload = multer({
  storage,
  defParamCharset: "utf8", // browsers send file names as UTF-8; multer's default (latin1) garbles "é" into "Ã©"
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    // hasOwn, not `in`: `in` also matches inherited names such as "toString" or "constructor"
    if (!Object.hasOwn(RECEIPT_EXTENSIONS, file.mimetype)) {
      callback(new AppError(415, "UNSUPPORTED_FILE_TYPE", "Only PDF, PNG and JPEG receipts are accepted"));
      return;
    }
    callback(null, true);
  },
}).single("file");

// Runs multer and turns its own errors into our AppError, so every upload failure has the usual error shape
export const receiptUpload: RequestHandler = (req, res, next) => {
  multerUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new AppError(413, "FILE_TOO_LARGE", "A receipt can be at most 5 MB"));
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, "VALIDATION_ERROR", `Send exactly one file in the "file" field (${error.code})`));
      return;
    }
    next(error);
  });
};
