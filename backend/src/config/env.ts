import path from "node:path";
import { config as loadEnvFile } from "dotenv";
import { z } from "zod";

// NODE_ENV=test reads .env.test (the Neon `test` branch). In test mode the file overrides variables already set
// in the shell, so a leftover dev DATABASE_URL_POOLED can never point the tests at the dev data.
const isTest = process.env.NODE_ENV === "test";
loadEnvFile({ path: isTest ? ".env.test" : ".env", override: isTest });

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
  // Folder for uploaded receipts (a Docker volume in containers). Resolved to an absolute path.
  UPLOAD_DIR: z
    .string()
    .min(1)
    .default("uploads")
    .transform((dir) => path.resolve(dir)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
