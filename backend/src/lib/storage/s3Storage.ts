import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StoredFileNotFoundError, type ReceiptStorage } from "./receiptStorage";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

// Files in an S3-compatible bucket (Neon Object Storage). The bucket is private: the only way to a file is
// through the API, which checks the claim scope first. Concept: private object storage, access via the backend.
export function createS3Storage(config: S3StorageConfig): ReceiptStorage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true, // required for a custom endpoint (per the Neon docs)
    requestChecksumCalculation: "WHEN_REQUIRED", // newer SDKs add extra checksums that S3-compatible services may refuse
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    async save(key, tempPath, mimeType) {
      // ContentLength is needed because the body is a stream (the SDK cannot measure it)
      const { size } = await stat(tempPath);
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: createReadStream(tempPath), ContentLength: size, ContentType: mimeType }));
    },

    async open(key): Promise<Readable> {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        // In Node the body is a Readable stream
        return result.Body as Readable;
      } catch (error) {
        if (error instanceof NoSuchKey) {
          throw new StoredFileNotFoundError(key);
        }
        throw error;
      }
    },

    async remove(key) {
      // Deleting a key that does not exist succeeds in S3, so this is safe to repeat
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}
