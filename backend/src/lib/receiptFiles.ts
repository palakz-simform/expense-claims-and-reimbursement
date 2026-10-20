import { open, unlink } from "node:fs/promises";
import { AppError } from "./AppError";

// Receipts must be small, and only these formats are accepted
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// The file extension on disk comes from this list, never from the client's filename
export const RECEIPT_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

// First bytes of each allowed format (the "magic bytes")
const SIGNATURES: { mimeType: string; bytes: number[] }[] = [
  { mimeType: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
];

// Which allowed format a file really is, judged by its content (null if none)
function detectMimeType(head: Buffer): string | null {
  const match = SIGNATURES.find((signature) => signature.bytes.every((byte, index) => head[index] === byte));
  return match?.mimeType ?? null;
}

// The client's Content-Type is just a claim: check that the saved file's content is really that format.
// Concept: magic-byte (file signature) validation against unrestricted file upload.
export async function verifyReceiptFile(filePath: string, declaredMimeType: string): Promise<void> {
  const handle = await open(filePath, "r");
  const head = Buffer.alloc(8);
  try {
    await handle.read(head, 0, head.length, 0);
  } finally {
    await handle.close();
  }

  if (detectMimeType(head) !== declaredMimeType) {
    throw new AppError(415, "UNSUPPORTED_FILE_TYPE", "The file content does not match an allowed receipt type (PDF, PNG or JPEG)");
  }
}

// Delete a stored file; a file that is already gone is not an error (cleanup must never throw)
export async function removeStoredFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
