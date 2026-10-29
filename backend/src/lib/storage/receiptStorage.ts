import type { Readable } from "node:stream";

// Where receipt files live. The rest of the app only knows this interface, so moving from the local disk to
// cloud storage (or back) is a setting, not a code change. Concept: storage abstraction (ports and adapters).
export interface ReceiptStorage {
  // Store the already verified file at `tempPath` under `key`. The caller removes the temp file afterwards.
  save(key: string, tempPath: string, mimeType: string): Promise<void>;
  // A stream of the stored file. Throws StoredFileNotFoundError when it is missing.
  open(key: string): Promise<Readable>;
  // Delete the stored file; a file that is already gone is not an error (cleanup must never throw for that)
  remove(key: string): Promise<void>;
}

// The row exists but the file does not: callers answer 404 and log it
export class StoredFileNotFoundError extends Error {
  constructor(key: string) {
    super(`Stored receipt file not found: ${key}`);
    this.name = "StoredFileNotFoundError";
  }
}
