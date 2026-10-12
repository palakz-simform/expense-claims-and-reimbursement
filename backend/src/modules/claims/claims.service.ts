import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import { getClaimTotal } from "../../lib/claimTotal";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../types/express";
import type { CreateClaimInput } from "./claims.schemas";

// Load a claim together with its line items, in a stable order
const withLineItems = {
  lineItems: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ClaimInclude;

type ClaimWithItems = Prisma.ClaimGetPayload<{ include: typeof withLineItems }>;

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
