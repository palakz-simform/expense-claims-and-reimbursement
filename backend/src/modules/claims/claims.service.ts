import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { logger } from "../../lib/logger";
import { lockClaim, lockEditableClaim, type LockedClaim } from "../../lib/claimLock";
import { claimScopeFor } from "../../lib/claimScope";
import { getClaimTotal, getClaimTotals } from "../../lib/claimTotal";
import { Prisma } from "../../generated/prisma/client";
import { ApprovalStatus, ClaimStatus } from "../../generated/prisma/enums";
import type { AuthUser } from "../../types/express";
import { buildChain, resetChain } from "../approvals/approvals.service";
import { receiptSelect } from "../receipts/receipts.service";
import { MAX_LINE_ITEMS } from "./claims.schemas";
import type {
  CreateClaimInput,
  LineItemInput,
  ListClaimsQuery,
  UpdateClaimInput,
  UpdateLineItemInput,
} from "./claims.schemas";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Load a claim together with its line items (and each item's receipts), in a stable order
const withLineItems = {
  lineItems: {
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { receipts: { select: receiptSelect, orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] } },
  },
} satisfies Prisma.ClaimInclude;

// For lists: only the number of line items, not the items themselves
const withItemCount = {
  _count: { select: { lineItems: true } },
} satisfies Prisma.ClaimInclude;

type ClaimWithItems = Prisma.ClaimGetPayload<{ include: typeof withLineItems }>;
type ClaimWithCount = Prisma.ClaimGetPayload<{ include: typeof withItemCount }>;

// API shape of a claim. Money is a string with 2 decimals (never a JS number), dates are plain strings.
function toClaimResponse(claim: ClaimWithItems, total: Prisma.Decimal) {
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    title: claim.title,
    status: claim.status,
    total: total.toFixed(2),
    submittedAt: claim.submittedAt,
    approvedAt: claim.approvedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    lineItems: claim.lineItems.map((item) => ({
      id: item.id,
      date: item.date.toISOString().slice(0, 10),
      category: item.category,
      amount: item.amount.toFixed(2),
      description: item.description,
      receipts: item.receipts,
    })),
  };
}

// API shape of a claim in a list: the same fields without the line items, plus how many there are
function toClaimSummary(claim: ClaimWithCount, total: Prisma.Decimal) {
  return {
    id: claim.id,
    claimNumber: claim.claimNumber,
    title: claim.title,
    status: claim.status,
    total: total.toFixed(2),
    lineItemCount: claim._count.lineItems,
    submittedAt: claim.submittedAt,
    approvedAt: claim.approvedAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  };
}

// Create a DRAFT claim with its line items; the claim, items and history row are saved together or not at all
export async function createClaim(user: AuthUser, input: CreateClaimInput) {
  return prisma.$transaction(async (tx) => {
    const claim = await tx.claim.create({
      data: { claimantId: user.id, title: input.title, lineItems: { create: input.lineItems } },
      include: withLineItems,
    });
    const total = await getClaimTotal(claim.id, tx);

    // Audit trail: written in the same transaction as the change
    await tx.claimHistory.create({
      data: {
        claimId: claim.id,
        action: "CLAIM_CREATED",
        performedById: user.id,
        metadata: { total: total.toFixed(2), lineItemCount: claim.lineItems.length },
      },
    });

    return toClaimResponse(claim, total);
  });
}

// Read one of the caller's own claims. The ownership filter is IN the query, so someone else's
// claim is simply "not found" (404, not 403: we do not reveal that it exists).
export async function getClaim(user: AuthUser, id: string) {
  return prisma.$transaction(
    async (tx) => {
      // The role's scope is part of the query: a claim outside it is not found (404)
      const claim = await tx.claim.findFirst({
        where: { id, ...claimScopeFor(user) },
        include: withLineItems,
      });
      if (!claim) {
        throw new AppError(404, "NOT_FOUND", "Claim not found");
      }

      const total = await getClaimTotal(claim.id, tx);

      // The latest rejection, kept even after a resubmit (null if the claim was never rejected)
      const rejection = await tx.approval.findFirst({
        where: { claimId: claim.id, status: ApprovalStatus.REJECTED },
        orderBy: { chainVersion: "desc" },
        select: { reason: true, level: true, decidedAt: true, approver: { select: { name: true } } },
      });
      const lastRejection = rejection && {
        reason: rejection.reason,
        level: rejection.level,
        rejectedAt: rejection.decidedAt,
        rejectedBy: rejection.approver.name,
      };

      return { ...toClaimResponse(claim, total), lastRejection };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }, // RepeatableRead ensures all queries in the transaction see the same consistent snapshot, even if other transactions modify the data.
  );
}

// List the claims the caller may see, newest first, one page at a time (never loads them all).
// Concept: offset pagination (skip/take + count). The role's scope is IN the query.
export async function listClaims(user: AuthUser, query: ListClaimsQuery) {
  const { page, pageSize, status, from, to } = query;

  // `to` is an inclusive day, so the range ends before the next day starts
  const dayAfterTo = to && new Date(to.getTime() + MS_PER_DAY);

  // A date filter drops drafts, because a draft has no submittedAt
  const hasDateFilter = Boolean(from || to);
  const submittedAt = hasDateFilter ? { gte: from, lt: dayAfterTo } : undefined;
  const filters: Prisma.ClaimWhereInput = { status, submittedAt };

  // The scope and the filters are combined with AND, so a filter can never widen what the role may see
  const where: Prisma.ClaimWhereInput = { AND: [claimScopeFor(user), filters] };

  // id is a tie-breaker so claims created at the same instant never repeat or vanish between pages
  const [claims, totalItems] = await prisma.$transaction([
    prisma.claim.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: withItemCount,
    }),
    prisma.claim.count({ where }),
  ]);

  // All totals for this page in one query, instead of one query per claim
  const claimIds = claims.map((claim) => claim.id);
  const totals = await getClaimTotals(claimIds, prisma);

  const data = claims.map((claim) => {
    const total = totals.get(claim.id) ?? new Prisma.Decimal(0);
    return toClaimSummary(claim, total);
  });

  const totalPages = Math.ceil(totalItems / pageSize);

  return { data, pagination: { page, pageSize, totalItems, totalPages } };
}

// Change the claim itself. Only the title is editable: the total is derived and the status follows the workflow.
export async function updateClaim(user: AuthUser, claimId: string, changes: UpdateClaimInput) {
  return runClaimEdit(user, claimId, async (tx) => {
    await tx.claim.update({ where: { id: claimId }, data: { title: changes.title } });

    return { change: "title changed" };
  });
}

// Delete a claim. Only a DRAFT can go; a submitted claim is part of the audit trail and is never deleted.
export async function deleteClaim(user: AuthUser, claimId: string) {
  await prisma.$transaction(async (tx) => {
    const { status } = await lockClaim(tx, user, claimId);

    if (status === ClaimStatus.APPROVED) {
      throw new AppError(409, "CLAIM_LOCKED", "This claim is approved and can no longer be changed");
    }
    if (status !== ClaimStatus.DRAFT) {
      throw new AppError(409, "CLAIM_NOT_DELETABLE", "Only a draft claim can be deleted; a submitted claim is part of the audit trail");
    }

    // The history rows point at the claim (Restrict), so they go first; the line items are removed with the claim
    await tx.claimHistory.deleteMany({ where: { claimId } });
    await tx.claim.delete({ where: { id: claimId } });
  });

  // A deleted draft leaves no history row, so record it in the application log
  logger.info({ claimId, userId: user.id }, "Draft claim deleted");
}

// Shared by submit and resubmit: builds the next approval chain and moves the claim into approval.
// Must run in the caller's transaction with the claim locked. submittedAt is set once, on the first submit.
async function startApproval(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  claimId: string,
  currentApprovalVersion: number,
  action: "CLAIM_SUBMITTED" | "CLAIM_RESUBMITTED",
) {
  // A claim with nothing to approve cannot be sent (a total of 0 is not the same as no items)
  const itemCount = await tx.lineItem.count({ where: { claimId } });
  if (itemCount === 0) {
    throw new AppError(422, "NO_LINE_ITEMS", "A claim needs at least one line item before it can be submitted");
  }

  // The chain is built for the new version; the total comes from the database, never from the client
  const total = await getClaimTotal(claimId, tx);
  const chainVersion = currentApprovalVersion + 1;
  const approvals = await buildChain(tx, claimId, user.id, total, chainVersion);

  // Move the claim into the approval flow and point it at the new chain
  const firstSubmit = action === "CLAIM_SUBMITTED";
  await tx.claim.update({
    where: { id: claimId },
    data: {
      status: ClaimStatus.PENDING_APPROVAL,
      currentApprovalVersion: chainVersion,
      ...(firstSubmit && { submittedAt: new Date() }),
    },
  });

  // Audit trail: written in the same transaction as the change
  await tx.claimHistory.create({
    data: {
      claimId,
      action,
      performedById: user.id,
      metadata: { total: total.toFixed(2), levels: approvals.length, chainVersion },
    },
  });
}

// Submit a DRAFT claim for approval, in ONE transaction (status, approval chain and history together).
export async function submitClaim(user: AuthUser, claimId: string) {
  return prisma.$transaction(async (tx) => {
    // Lock first, so a double click or a concurrent edit waits and then sees the new status
    const { status, currentApprovalVersion } = await lockClaim(tx, user, claimId);

    // Only a draft can be submitted (a rejected claim goes through resubmit)
    if (status === ClaimStatus.APPROVED) {
      throw new AppError(409, "CLAIM_LOCKED", "This claim is approved and can no longer be changed");
    }
    if (status !== ClaimStatus.DRAFT) {
      throw new AppError(409, "CLAIM_NOT_SUBMITTABLE", "Only a draft claim can be submitted");
    }

    await startApproval(tx, user, claimId, currentApprovalVersion, "CLAIM_SUBMITTED");

    return loadClaimResponse(tx, claimId);
  });
}

// Send a REJECTED claim back to approval: a new chain starts from level 1 (old rows and history stay).
export async function resubmitClaim(user: AuthUser, claimId: string) {
  return prisma.$transaction(async (tx) => {
    const { status, currentApprovalVersion } = await lockClaim(tx, user, claimId);

    if (status === ClaimStatus.APPROVED) {
      throw new AppError(409, "CLAIM_LOCKED", "This claim is approved and can no longer be changed");
    }
    if (status !== ClaimStatus.REJECTED) {
      throw new AppError(409, "CLAIM_NOT_RESUBMITTABLE", "Only a rejected claim can be resubmitted");
    }

    await startApproval(tx, user, claimId, currentApprovalVersion, "CLAIM_RESUBMITTED");

    return loadClaimResponse(tx, claimId);
  });
}

// ---------------------------------------------------------------------------
// Editing line items
// ---------------------------------------------------------------------------

// What an edit reports back, so the history row can say what changed
type ClaimEditResult = { change: string; itemId?: string };

// The one flow every claim edit goes through: lock, apply the edit, record it, reset the chain if needed.
// Concept: higher-order function (the edit itself is passed in).
async function runClaimEdit(
  user: AuthUser,
  claimId: string,
  edit: (tx: Prisma.TransactionClient, locked: LockedClaim) => Promise<ClaimEditResult>,
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockEditableClaim(tx, user, claimId);

    // A draft has no history yet, so it skips the extra queries below
    if (locked.status === ClaimStatus.DRAFT) {
      await edit(tx, locked);
      return loadClaimResponse(tx, claimId);
    }

    // Totals before and after the edit (the history row shows how the amount moved)
    const oldTotal = await getClaimTotal(claimId, tx);
    const result = await edit(tx, locked);
    const newTotal = await getClaimTotal(claimId, tx);

    // Audit trail: edits to a claim that was already submitted are recorded, in the same transaction
    await tx.claimHistory.create({
      data: {
        claimId,
        action: "CLAIM_UPDATED",
        performedById: user.id,
        metadata: {
          change: result.change,
          itemId: result.itemId ?? null,
          oldTotal: oldTotal.toFixed(2),
          newTotal: newTotal.toFixed(2),
        },
      },
    });

    // A new total voids every decision so far, so the chain restarts (a rejected claim has no live chain)
    const isPending = locked.status === ClaimStatus.PENDING_APPROVAL;
    if (isPending && !oldTotal.equals(newTotal)) {
      await resetChain(tx, user, claimId, locked.currentApprovalVersion, oldTotal, newTotal);
    }

    return loadClaimResponse(tx, claimId);
  });
}

// Explicit field mapping (never spread a request body into a Prisma call)
function toLineItemData(claimId: string, item: LineItemInput) {
  return {
    claimId,
    date: item.date,
    category: item.category,
    amount: item.amount,
    description: item.description,
  };
}

// Finds a line item of THIS claim; an item that belongs to another claim is the same 404
async function findLineItem(tx: Prisma.TransactionClient, claimId: string, itemId: string) {
  const item = await tx.lineItem.findFirst({ where: { id: itemId, claimId } });
  if (!item) {
    throw new AppError(404, "NOT_FOUND", "Line item not found");
  }
  return item;
}

// A line item edit changes the claim too (its total), so bump the claim's updatedAt
async function touchClaim(tx: Prisma.TransactionClient, claimId: string) {
  await tx.claim.update({ where: { id: claimId }, data: { updatedAt: new Date() } });
}

// The claim as the API returns it, read inside the transaction so the total matches the items just saved
async function loadClaimResponse(tx: Prisma.TransactionClient, claimId: string) {
  const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId }, include: withLineItems });
  const total = await getClaimTotal(claimId, tx);

  return toClaimResponse(claim, total);
}

// Add ONE line item to a claim
export async function addLineItem(user: AuthUser, claimId: string, item: LineItemInput) {
  return runClaimEdit(user, claimId, async (tx) => {
    const existingCount = await tx.lineItem.count({ where: { claimId } });
    if (existingCount >= MAX_LINE_ITEMS) {
      throw new AppError(422, "LINE_ITEM_LIMIT_REACHED", `A claim can have at most ${MAX_LINE_ITEMS} line items`);
    }

    const created = await tx.lineItem.create({ data: toLineItemData(claimId, item) });
    await touchClaim(tx, claimId);

    return { change: "line item added", itemId: created.id };
  });
}

// Change some fields of ONE line item (only the fields that are sent)
export async function updateLineItem(user: AuthUser, claimId: string, itemId: string, changes: UpdateLineItemInput) {
  return runClaimEdit(user, claimId, async (tx) => {
    await findLineItem(tx, claimId, itemId);

    // Prisma leaves out fields that are undefined, so only the fields that were sent are updated
    await tx.lineItem.update({
      where: { id: itemId },
      data: {
        date: changes.date,
        category: changes.category,
        amount: changes.amount,
        description: changes.description,
      },
    });
    await touchClaim(tx, claimId);

    return { change: "line item changed", itemId };
  });
}

// Remove ONE line item from a claim
export async function deleteLineItem(user: AuthUser, claimId: string, itemId: string) {
  return runClaimEdit(user, claimId, async (tx, locked) => {
    await findLineItem(tx, claimId, itemId);

    // A claim awaiting approval must keep at least one item (drafts and rejected claims may be emptied)
    if (locked.status === ClaimStatus.PENDING_APPROVAL) {
      const existingCount = await tx.lineItem.count({ where: { claimId } });
      if (existingCount <= 1) {
        throw new AppError(422, "NO_LINE_ITEMS", "A claim awaiting approval must keep at least one line item");
      }
    }

    await tx.lineItem.delete({ where: { id: itemId } });
    await touchClaim(tx, claimId);

    return { change: "line item removed", itemId };
  });
}
