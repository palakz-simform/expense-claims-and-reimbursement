import { Prisma } from "../generated/prisma/client";

// Approval tiers, ordered by level. A claim needs EVERY level whose `from` is <= its total.
// Amounts are in rupees and are Decimals (never JS numbers) so comparisons have no floating-point error.
// Adding a level 3 is one more entry here (plus ApproverAssignment rows); no schema change.
export const APPROVAL_TIERS = [
  { level: 1, from: new Prisma.Decimal(0) },
  { level: 2, from: new Prisma.Decimal(10000) },
];

// How many approval levels a claim with this total needs.
// Concept: policy as data. The rule lives in one table, so routing never needs an `if (levels === 2)`.
export function requiredLevels(total: Prisma.Decimal): number {
  const applicableTiers = APPROVAL_TIERS.filter((tier) => total.gte(tier.from));
  return applicableTiers.length;
}
