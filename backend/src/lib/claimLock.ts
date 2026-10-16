import { AppError } from "./AppError";
import { Prisma } from "../generated/prisma/client";
import type { ClaimStatus } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";

// What a caller learns about a claim it has locked
export type LockedClaim = { status: ClaimStatus; currentApprovalVersion: number };

// Locks one claim row until the transaction ends, so edits and approvals on it queue up.
// Concept: pessimistic locking (SELECT ... FOR UPDATE). `where` comes only from the two functions below.
async function lockClaimRow(tx: Prisma.TransactionClient, where: Prisma.Sql): Promise<LockedClaim> {
  const rows = await tx.$queryRaw<LockedClaim[]>`
    SELECT "status", "currentApprovalVersion" FROM "Claim"
    WHERE ${where}
    FOR UPDATE`;
  const claim = rows[0];

  // Missing or not visible: the same 404 either way
  if (!claim) {
    throw new AppError(404, "NOT_FOUND", "Claim not found");
  }

  return claim;
}

// Claimant locking their own claim (someone else's claim is a 404)
export async function lockClaim(tx: Prisma.TransactionClient, user: AuthUser, claimId: string): Promise<LockedClaim> {
  return lockClaimRow(tx, Prisma.sql`"id" = ${claimId}::uuid AND "claimantId" = ${user.id}::uuid`);
}

// Locks any claim by id, with no owner filter: the caller must already have proved the right to act
// (e.g. by loading its own approval) and pass the claim id from that approval, never from the request.
export async function lockClaimById(tx: Prisma.TransactionClient, claimId: string): Promise<LockedClaim> {
  return lockClaimRow(tx, Prisma.sql`"id" = ${claimId}::uuid`);
}
