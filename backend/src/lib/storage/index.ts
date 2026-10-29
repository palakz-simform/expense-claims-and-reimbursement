import { env } from "../../config/env";
import { createLocalStorage } from "./localStorage";
import { createS3Storage } from "./s3Storage";
import type { ReceiptStorage } from "./receiptStorage";

// The one storage the app uses, chosen by STORAGE_DRIVER at boot (env.ts guarantees the S3 settings exist for "s3")
function chooseStorage(): ReceiptStorage {
  if (env.STORAGE_DRIVER === "s3") {
    return createS3Storage({
      endpoint: env.AWS_ENDPOINT_URL_S3!,
      region: env.AWS_REGION!,
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      bucket: env.S3_BUCKET!,
    });
  }
  return createLocalStorage(env.UPLOAD_DIR);
}

export const receiptStorage: ReceiptStorage = chooseStorage();
export { StoredFileNotFoundError } from "./receiptStorage";
