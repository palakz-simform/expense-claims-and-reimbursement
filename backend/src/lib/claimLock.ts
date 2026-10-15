import { AppError } from "./AppError";
import type { Prisma } from "../generated/prisma/client";
import type { ClaimStatus } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";

// What a caller needs to know about a claim it has just locked
export type LockedClaim = { status: ClaimStatus; currentApprovalVersion: number };

// Locks the caller's claim row for the rest of the transaction and returns its status and chain version.
// Concept: pessimistic locking (SELECT ... FOR UPDATE). Two edits, or an edit and an approval,
// can never interleave on the same claim: the second one waits, then sees the new status.
// Shared by modules (lib/) so claims and approvals can both lock without importing each other.
export async function lockClaim(tx: Prisma.TransactionClient, user: AuthUser, claimId: string): Promise<LockedClaim> {
  const rows = await tx.$queryRaw<LockedClaim[]>`
    SELECT "status", "currentApprovalVersion" FROM "Claim"
    WHERE "id" = ${claimId}::uuid AND "claimantId" = ${user.id}::uuid
    FOR UPDATE`;
  const claim = rows[0];

  // Not found, or someone else's claim: the same 404 either way
  if (!claim) {
    throw new AppError(404, "NOT_FOUND", "Claim not found");
  }

  return claim;
}
