import { copyFile, open, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { StoredFileNotFoundError, type ReceiptStorage } from "./receiptStorage";

// Files in a folder on disk (UPLOAD_DIR: a Docker volume in containers). Used in development and tests.
// basename keeps every path inside the folder even if a key were ever tampered with.
export function createLocalStorage(directory: string): ReceiptStorage {
  const pathOf = (key: string) => path.join(directory, path.basename(key));

  return {
    // Copy (not rename): the temp folder and the volume can be different file systems
    async save(key, tempPath) {
      await copyFile(tempPath, pathOf(key));
    },

    async open(key): Promise<Readable> {
      try {
        // Opening first makes a missing file fail here, before any response header is sent
        const handle = await open(pathOf(key), "r");
        return handle.createReadStream();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new StoredFileNotFoundError(key);
        }
        throw error;
      }
    },

    async remove(key) {
      try {
        await unlink(pathOf(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}
