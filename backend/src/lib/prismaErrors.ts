import { Prisma } from "../generated/prisma/client";
import { AppError } from "./AppError";

// Turns known database failures into clean API errors so clients never see Prisma internals
// (table and column names). Returns null for anything else, which becomes a generic 500.
export function mapDatabaseError(err: unknown): AppError | null {
  // Unique constraint violated (for example a value that must be unique already exists)
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return new AppError(409, "CONFLICT", "A record with these values already exists");
  }

  // The DB trigger on approved claims raises this exact text (backstop behind the service's own check)
  if (err instanceof Error && err.message.includes("CLAIM_LOCKED")) {
    return new AppError(409, "CLAIM_LOCKED", "This claim is approved and can no longer be changed");
  }

  return null;
}
