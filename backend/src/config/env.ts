import "dotenv/config";
import { z } from "zod";

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
