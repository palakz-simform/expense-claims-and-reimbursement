import { Prisma } from "../generated/prisma/client";

// The claim total is NEVER stored: it is always the database's SUM of the line items, so it
// cannot drift from them. Pass the transaction client to read it inside a transaction.
export async function getClaimTotal(claimId: string, db: Prisma.TransactionClient): Promise<Prisma.Decimal> {
  const result = await db.lineItem.aggregate({ where: { claimId }, _sum: { amount: true } });
  return result._sum.amount ?? new Prisma.Decimal(0); // a claim with no items totals 0
}

// Totals for many claims in ONE grouped query (not one query per claim).
// Claims without line items are not in the result, so callers treat a missing id as 0.
export async function getClaimTotals(
  claimIds: string[],
  db: Prisma.TransactionClient,
): Promise<Map<string, Prisma.Decimal>> {
  const groups = await db.lineItem.groupBy({
    by: ["claimId"],
    where: { claimId: { in: claimIds } },
    _sum: { amount: true },
  });

  const totals = new Map<string, Prisma.Decimal>();
  for (const group of groups) {
    const total = group._sum.amount ?? new Prisma.Decimal(0);
    totals.set(group.claimId, total);
  }
  return totals;
}
