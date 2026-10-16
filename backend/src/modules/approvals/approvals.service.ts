import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { requiredLevels } from "../../lib/approvalPolicy";
import { lockClaimById } from "../../lib/claimLock";
import { getClaimTotal, getClaimTotals } from "../../lib/claimTotal";
import { Prisma } from "../../generated/prisma/client";
import { ApprovalStatus, ClaimStatus, Role } from "../../generated/prisma/enums";
import type { AuthUser } from "../../types/express";
import type { ListApprovalsQuery } from "./approvals.schemas";

// Builds a claim's approval chain: one Approval row per required level (used by submit, reset and resubmit).
// Runs inside the caller's transaction, so a level without a valid approver rolls everything back.
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

// Voids the live chain and starts a new one from level 1, because the total changed under the approvers.
// The same approvers return (they come from the claimant's fixed assignments). Needs the claim locked.
export async function resetChain(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  claimId: string,
  previousVersion: number,
  oldTotal: Prisma.Decimal,
  newTotal: Prisma.Decimal,
) {
  // Void the live chain. The rows stay for the audit trail; they are just no longer decisions that count.
  //updateMany because 2 approval llevel creates 2 records in the Approval table
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

// The approver's queue: only steps waiting for MY decision now, oldest submission first (approverId is in the query).
export async function listPendingApprovals(user: AuthUser, query: ListApprovalsQuery) {
  const { page, pageSize } = query;
  const where = { approverId: user.id, status: ApprovalStatus.PENDING };

  // id is a tie-breaker so approvals of claims submitted at the same instant never repeat or vanish between pages
  const [approvals, totalItems] = await prisma.$transaction([
    prisma.approval.findMany({
      where,
      orderBy: [{ claim: { submittedAt: "asc" } }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        level: true,
        status: true,
        claim: {
          select: {
            id: true,
            claimNumber: true,
            title: true,
            submittedAt: true,
            claimant: { select: { name: true } },
          },
        },
      },
    }),
    prisma.approval.count({ where }),
  ]);

  // All totals for this page in one query (the total is always the database's SUM of the line items)
  const claimIds = approvals.map((approval) => approval.claim.id);
  const totals = await getClaimTotals(claimIds, prisma);

  const data = approvals.map((approval) => {
    const total = totals.get(approval.claim.id) ?? new Prisma.Decimal(0);
    return {
      id: approval.id,
      level: approval.level,
      status: approval.status,
      claim: {
        id: approval.claim.id,
        claimNumber: approval.claim.claimNumber,
        title: approval.claim.title,
        total: total.toFixed(2),
        submittedAt: approval.claim.submittedAt,
        claimantName: approval.claim.claimant.name,
      },
    };
  });

  const totalPages = Math.ceil(totalItems / pageSize);

  return { data, pagination: { page, pageSize, totalItems, totalPages } };
}

// Shared by approve and reject: finds MY approval, locks its claim, checks the step can still be decided.
async function lockDecidableApproval(tx: Prisma.TransactionClient, user: AuthUser, approvalId: string) {
  // Someone else's approval looks exactly like a missing one (404)
  const mine = await tx.approval.findFirst({ where: { id: approvalId, approverId: user.id }, select: { claimId: true } });
  if (!mine) {
    throw new AppError(404, "NOT_FOUND", "Approval not found");
  }

  // Lock first (claim id comes from my own approval), then re-read: the step may have changed while we waited
  const claim = await lockClaimById(tx, mine.claimId);
  const approval = await tx.approval.findUniqueOrThrow({ where: { id: approvalId } });

  // It must be my turn, on the live chain of a claim that is still awaiting approval
  const isLive = claim.status === ClaimStatus.PENDING_APPROVAL && approval.chainVersion === claim.currentApprovalVersion;
  if (approval.status !== ApprovalStatus.PENDING || !isLive) {
    throw new AppError(409, "APPROVAL_NOT_PENDING", "This approval is no longer waiting for your decision");
  }

  return { approval, claimId: mine.claimId };
}

// Approve my step: the next level's turn starts, or the claim is approved when this was the last level.
export async function approveApproval(user: AuthUser, approvalId: string) {
  return prisma.$transaction(async (tx) => {
    const { approval, claimId } = await lockDecidableApproval(tx, user, approvalId);

    // Double-click guard: only a step that is still PENDING can be decided
    const decidedAt = new Date();
    const decided = await tx.approval.updateMany({
      where: { id: approvalId, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.APPROVED, decidedAt },
    });
    if (decided.count === 0) {
      throw new AppError(409, "APPROVAL_NOT_PENDING", "This approval is no longer waiting for your decision");
    }

    // Audit trail: written in the same transaction as the change
    await tx.claimHistory.create({
      data: {
        claimId,
        action: "APPROVAL_GRANTED",
        performedById: user.id,
        metadata: { level: approval.level, chainVersion: approval.chainVersion },
      },
    });

    // The next level of this chain, or null if this was the last
    const next = await tx.approval.findFirst({
      where: { claimId, chainVersion: approval.chainVersion, level: approval.level + 1 },
      select: { id: true },
    });

    if (next) {
      await tx.approval.updateMany({ where: { id: next.id, status: ApprovalStatus.WAITING }, data: { status: ApprovalStatus.PENDING } });
    } else {
      // Last level approved: the claim is approved and locked from here on
      await tx.claim.update({ where: { id: claimId }, data: { status: ClaimStatus.APPROVED, approvedAt: decidedAt } });
      const total = await getClaimTotal(claimId, tx);
      await tx.claimHistory.create({
        data: {
          claimId,
          action: "CLAIM_APPROVED",
          performedById: user.id,
          metadata: { total: total.toFixed(2), levels: approval.level, chainVersion: approval.chainVersion },
        },
      });
    }

    return {
      id: approvalId,
      level: approval.level,
      status: ApprovalStatus.APPROVED,
      decidedAt,
      claim: next
        ? { id: claimId, status: ClaimStatus.PENDING_APPROVAL, approvedAt: null }
        : { id: claimId, status: ClaimStatus.APPROVED, approvedAt: decidedAt },
    };
  });
}

// Reject my step: the claim goes back to the claimant with the reason, and the rest of the chain is voided.
export async function rejectApproval(user: AuthUser, approvalId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const { approval, claimId } = await lockDecidableApproval(tx, user, approvalId);

    // Double-click guard: only a step that is still PENDING can be decided
    const decidedAt = new Date();
    const decided = await tx.approval.updateMany({
      where: { id: approvalId, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.REJECTED, decidedAt, reason },
    });
    if (decided.count === 0) {
      throw new AppError(409, "APPROVAL_NOT_PENDING", "This approval is no longer waiting for your decision");
    }

    // The other open steps of this chain no longer matter (earlier approvals stay as they were)
    await tx.approval.updateMany({
      where: {
        claimId,
        chainVersion: approval.chainVersion,
        status: { in: [ApprovalStatus.WAITING, ApprovalStatus.PENDING] },
      },
      data: { status: ApprovalStatus.INVALIDATED },
    });

    await tx.claim.update({ where: { id: claimId }, data: { status: ClaimStatus.REJECTED } });

    // Audit trail: written in the same transaction as the change
    await tx.claimHistory.create({
      data: {
        claimId,
        action: "CLAIM_REJECTED",
        performedById: user.id,
        reason,
        metadata: { level: approval.level, chainVersion: approval.chainVersion },
      },
    });

    return {
      id: approvalId,
      level: approval.level,
      status: ApprovalStatus.REJECTED,
      decidedAt,
      reason,
      claim: { id: claimId, status: ClaimStatus.REJECTED },
    };
  });
}
