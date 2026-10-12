import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { getClaimTotal, getClaimTotals } from "../../lib/claimTotal";
import { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../types/express";
import type { CreateClaimInput, ListClaimsQuery } from "./claims.schemas";

// Load a claim together with its line items, in a stable order
const withLineItems = {
  lineItems: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
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
  const claim = await prisma.claim.findFirst({
    where: { id, claimantId: user.id },
    include: withLineItems,
  });
  if (!claim) {
    throw new AppError(404, "NOT_FOUND", "Claim not found");
  }

  const total = await getClaimTotal(claim.id, prisma);

  return toClaimResponse(claim, total);
}

// List the caller's own claims, newest first, one page at a time (never loads them all).
// Concept: offset pagination (skip/take + count). The ownership filter is IN the query.
export async function listClaims(user: AuthUser, query: ListClaimsQuery) {
  const { page, pageSize } = query;
  const where = { claimantId: user.id };

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
