import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { z } from "zod";

// NODE_ENV=test reads .env.test (the Neon `test` branch). In test mode the file overrides variables already set
// in the shell, so a leftover dev DATABASE_URL_POOLED can never point the tests at the dev data.
const isTest = process.env.NODE_ENV === "test";
loadEnvFile({ path: isTest ? ".env.test" : ".env", override: isTest });

// A blank value (as copied from .env.example) means "not set", so an unused optional setting can stay empty
const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("1h"),
  // Minimum level the logger writes ("silent" turns logging off, e.g. in tests)
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Pooled Neon connection used by the running app (Prisma pg adapter).
  // DATABASE_URL (direct) is only read by the Prisma CLI, so it is not validated here.
  DATABASE_URL_POOLED: z.url("DATABASE_URL_POOLED must be a valid connection URL"),
  // Password given to every seeded user. Only the seed script needs it, so it is optional here
  // (the app must still boot in production, where it is not set).
  SEED_PASSWORD: z.string().min(8, "SEED_PASSWORD must be at least 8 characters").optional(),
  // Browser origins allowed to call the API in production, comma separated (e.g. https://app.example.com).
  // Unset or blank gives an empty list. Only production reads it; dev and tests stay open.
  CORS_ORIGIN: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0)),
  // Folder for uploaded receipts (a Docker volume in containers). Resolved to an absolute path.
  UPLOAD_DIR: z
    .string()
    .min(1)
    .default("uploads")
    .transform((dir) => path.resolve(dir)),
  // Where receipt files are kept: "local" = the UPLOAD_DIR folder, "s3" = an S3-compatible bucket (Neon Object Storage)
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  // Only needed when STORAGE_DRIVER=s3 (checked below). Neon's own variable names, so its values can be pasted as they are.
  AWS_ENDPOINT_URL_S3: z.preprocess(blankIsUnset, z.url().optional()),
  AWS_REGION: z.preprocess(blankIsUnset, z.string().min(1).optional()),
  AWS_ACCESS_KEY_ID: z.preprocess(blankIsUnset, z.string().min(1).optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(blankIsUnset, z.string().min(1).optional()),
  S3_BUCKET: z.preprocess(blankIsUnset, z.string().min(1).optional()),
}).superRefine((values, context) => {
  // Fail at boot, not on the first upload, when "s3" is chosen but a setting is missing
  if (values.STORAGE_DRIVER !== "s3") return;
  const required = ["AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"] as const;
  for (const name of required) {
    if (!values[name]) {
      context.addIssue({ code: "custom", path: [name], message: `${name} is required when STORAGE_DRIVER=s3` });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
