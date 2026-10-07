import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

// The one shared PrismaClient for the whole app (import this, never create another).
// Prisma 7 needs a driver adapter; the app uses the POOLED Neon URL (PgBouncer), while the
// Prisma CLI (migrations) uses the direct URL from prisma.config.ts.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL_POOLED }),
});
