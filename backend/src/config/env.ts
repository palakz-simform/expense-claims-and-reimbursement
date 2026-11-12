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
  // Browser origins allowed to call the API in production, comma separated (e.g. https://app.example.com).
  // Unset or blank gives an empty list. Only production reads it; dev and tests stay open.
  // How many reverse proxies sit in front of the API (Render: 1). Express then takes the client IP from that many
  // X-Forwarded-For entries, so the rate limiters count per real user. 0 (local, no proxy) trusts no header at all,
  // so a client cannot fake its IP. Concept: reverse proxy and client IP.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  CORS_ORIGIN: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter((origin) => origin.length > 0)),
  // Receipt storage: a private S3-compatible bucket (Neon Object Storage), required in every environment so a
  // missing setting fails at boot, not on the first upload. Neon's own variable names, so its values paste as they are.
  AWS_ENDPOINT_URL_S3: z.url("AWS_ENDPOINT_URL_S3 must be a valid URL"),
  AWS_REGION: z.string().min(1, "AWS_REGION is required"),
  AWS_ACCESS_KEY_ID: z.string().min(1, "AWS_ACCESS_KEY_ID is required"),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, "AWS_SECRET_ACCESS_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
