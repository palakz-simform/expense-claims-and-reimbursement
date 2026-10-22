import type { Prisma } from "../generated/prisma/client";
import type { AuditAction } from "../generated/prisma/enums";

// A transaction client, and ONLY that: the plain PrismaClient has $connect (a transaction client does not), so it is
// rejected at compile time. Without this, recordHistory(prisma, ...) would type-check and write outside the transaction.
type InTransaction = Prisma.TransactionClient & { $connect?: never };

// One line of a claim's audit trail
export type HistoryEntry = {
  claimId: string;
  action: AuditAction;
  performedById: string;
  reason?: string; // only for rejections
  metadata?: Prisma.InputJsonValue; // structured details, e.g. old and new totals
};

// The ONLY place that writes ClaimHistory. It accepts only a transaction client, so a history row is always
// saved or rolled back together with the change it describes (never as a separate step afterwards).
// Concept: audit log written in the same transaction.
export async function recordHistory(tx: InTransaction, entry: HistoryEntry): Promise<void> {
  await tx.claimHistory.create({ data: entry });
}

// Several lines at once (for example one per removed receipt), in a single query
export async function recordHistoryMany(tx: InTransaction, entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await tx.claimHistory.createMany({ data: entries });
}
