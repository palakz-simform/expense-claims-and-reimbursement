import { AppError } from "../../lib/AppError";
import { requiredLevels } from "../../lib/approvalPolicy";
import type { Prisma } from "../../generated/prisma/client";
import { ApprovalStatus, Role } from "../../generated/prisma/enums";
import type { AuthUser } from "../../types/express";

// Builds the approval chain for a claim: one Approval row per required level.
// ONE function for submit, resubmit and chain reset, so the routing rule exists in a single place.
// Must run inside the caller's transaction: if any level has no valid approver, the error rolls
// back the whole submit, so a claim is never left half-submitted.
export async function buildChain(
  tx: Prisma.TransactionClient,
  claimId: string,
  claimantId: string,
  total: Prisma.Decimal,
  chainVersion: number,
) {
  // How many levels this total needs (from the policy table, never hardcoded here)
  const levels = requiredLevels(total);

  // A claim with no approval levels would be submitted with nobody able to approve it. That means the
  // policy table is misconfigured (a server bug, not a client mistake), so fail loudly and roll back.
  if (levels < 1) {
    throw new Error(`Approval policy returned ${levels} levels for a total of ${total.toFixed(2)}`);
  }

  // The claimant's fixed approver for every needed level, in ONE query (not one per level).
  // Only the two approver columns that are checked below are loaded (never the password hash).
  const assignments = await tx.approverAssignment.findMany({
    where: { claimantId, level: { lte: levels } },
    include: { approver: { select: { role: true, approvalLevel: true } } },
  });
  const assignmentByLevel = new Map<number, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    assignmentByLevel.set(assignment.level, assignment);
  }

  // One Approval row per level. Concept: snapshot; the approver id is copied onto the row, so a
  // later change to ApproverAssignment never touches a claim that is already in flight.
  const approvals: Prisma.ApprovalCreateManyInput[] = [];
  for (let level = 1; level <= levels; level++) {
    const assignment = assignmentByLevel.get(level);

    // The approver must still exist, still be an APPROVER, and still sit at this level
    const approver = assignment?.approver;
    const isValidApprover = approver !== undefined && approver.role === Role.APPROVER && approver.approvalLevel === level;
    if (!assignment || !isValidApprover) {
      throw new AppError(422, "NO_APPROVER_AVAILABLE", `No approver is available for level ${level}`);
    }

    // Level 1 is the approver's turn now; higher levels wait until the level below approves
    const status = level === 1 ? ApprovalStatus.PENDING : ApprovalStatus.WAITING;
    approvals.push({ claimId, chainVersion, level, approverId: assignment.approverId, status });
  }

  // One insert for the whole chain
  await tx.approval.createMany({ data: approvals });

  return approvals;
}

// Throws away the live approval chain and starts a new one from level 1. Used when an edit changes
// the total of a claim that is awaiting approval: approvers decided on a different amount, so every
// decision (even an already granted one) is void. The same approvers come back, because buildChain
// reads the claimant's fixed assignments (Alice approved, Bob pending: both reset, Alice is asked again).
// Must run inside the caller's transaction, with the claim row locked.
export async function resetChain(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  claimId: string,
  previousVersion: number,
  oldTotal: Prisma.Decimal,
  newTotal: Prisma.Decimal,
) {
  // Void the live chain. The rows stay for the audit trail; they are just no longer decisions that count.
  await tx.approval.updateMany({
    where: {
      claimId,
      chainVersion: previousVersion,
      status: { in: [ApprovalStatus.WAITING, ApprovalStatus.PENDING, ApprovalStatus.APPROVED] },
    },
    data: { status: ApprovalStatus.INVALIDATED },
  });

  // A new chain for the new total (it may have more or fewer levels), then point the claim at it
  const newVersion = previousVersion + 1;
  await buildChain(tx, claimId, user.id, newTotal, newVersion);
  await tx.claim.update({ where: { id: claimId }, data: { currentApprovalVersion: newVersion } });

  // Audit trail: written in the same transaction as the change
  await tx.claimHistory.create({
    data: {
      claimId,
      action: "APPROVAL_CHAIN_RESET",
      performedById: user.id,
      metadata: {
        oldTotal: oldTotal.toFixed(2),
        newTotal: newTotal.toFixed(2),
        previousApprovalVersion: previousVersion,
        newApprovalVersion: newVersion,
      },
    },
  });
}
