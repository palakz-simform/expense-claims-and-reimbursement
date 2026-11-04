import { env } from "../../config/env";
import { createS3Storage } from "./s3Storage";
import type { ReceiptStorage } from "./receiptStorage";

// The one storage the app uses: a private S3-compatible bucket (Neon Object Storage). env.ts guarantees every
// setting exists at boot. Services only see the ReceiptStorage interface, so tests can swap in a fake.
export const receiptStorage: ReceiptStorage = createS3Storage({
  endpoint: env.AWS_ENDPOINT_URL_S3,
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET,
});
export { StoredFileNotFoundError } from "./receiptStorage";
