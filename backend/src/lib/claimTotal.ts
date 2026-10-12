import { Prisma } from "../generated/prisma/client";

// The claim total is NEVER stored: it is always the database's SUM of the line items, so it
// cannot drift from them. Pass the transaction client to read it inside a transaction.
export async function getClaimTotal(claimId: string, db: Prisma.TransactionClient): Promise<Prisma.Decimal> {
  const result = await db.lineItem.aggregate({ where: { claimId }, _sum: { amount: true } });
  return result._sum.amount ?? new Prisma.Decimal(0); // a claim with no items totals 0
}
