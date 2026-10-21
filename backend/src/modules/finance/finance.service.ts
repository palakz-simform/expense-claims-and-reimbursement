import { prisma } from "../../db/prisma";
import { Prisma } from "../../generated/prisma/client";

// Columns of the export, one row per approved claim
export const EXPORT_HEADER = [
  "claimNumber",
  "claimId",
  "title",
  "claimantName",
  "claimantEmail",
  "submittedAt",
  "approvedAt",
  "total",
  "lineItemCount",
];

// Claims read from the database per query (the file is built from these batches, never all at once)
export const EXPORT_BATCH_SIZE = 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "2026-01-01" from a UTC midnight date, for the file name
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// One exported claim as the database returns it. total is the SUM as text, so it keeps exactly 2 decimals.
export type ExportRow = {
  id: string;
  claimNumber: number;
  title: string;
  claimantName: string;
  claimantEmail: string;
  submittedAt: Date | null;
  approvedAt: Date;
  total: string;
  lineItemCount: number;
};

// Where the previous batch ended: the next batch starts after this (approvedAt, id) pair
type Cursor = { approvedAt: Date; id: string };

// One batch of approved claims whose FINAL approval day is within [from, to] (UTC, both days included).
// Concept: keyset (cursor) pagination. Instead of OFFSET, which re-reads every skipped row, each batch continues
// after the last (approvedAt, id) seen, so every batch costs the same and no row is repeated or missed.
async function readBatch(from: Date, to: Date, cursor: Cursor | null, limit: number): Promise<ExportRow[]> {
  // `to` is an inclusive day, so the range ends before the next day starts
  const endExclusive = new Date(to.getTime() + MS_PER_DAY);

  const afterCursor = cursor
    ? Prisma.sql`AND (c."approvedAt", c."id") > (${cursor.approvedAt}::timestamp, ${cursor.id}::uuid)`
    : Prisma.empty;

  // First pick the page of claims (cheap: it follows the status/approvedAt index), THEN join and sum only those rows,
  // so each batch costs the same however long the period is. The total is the database's SUM (never stored).
  return prisma.$queryRaw<ExportRow[]>`
    WITH page AS (
      SELECT c."id", c."claimNumber", c."title", c."claimantId", c."submittedAt", c."approvedAt"
      FROM "Claim" c
      WHERE c."status" = 'APPROVED'
        AND c."approvedAt" >= ${from}::timestamp
        AND c."approvedAt" < ${endExclusive}::timestamp
        ${afterCursor}
      ORDER BY c."approvedAt" ASC, c."id" ASC
      LIMIT ${limit}
    )
    SELECT page."id", page."claimNumber", page."title", page."submittedAt", page."approvedAt",
           u."name" AS "claimantName", u."email" AS "claimantEmail",
           sums."total", sums."lineItemCount"
    FROM page
    JOIN "User" u ON u."id" = page."claimantId"
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(li."amount"), 0)::numeric(14, 2)::text AS "total", COUNT(li."id")::int AS "lineItemCount"
      FROM "LineItem" li
      WHERE li."claimId" = page."id"
    ) sums
    ORDER BY page."approvedAt" ASC, page."id" ASC`;
}

// All approved claims of the period, one batch at a time. The caller writes each batch out before asking for the next,
// so memory use stays the size of one batch whatever the period.
export async function* approvedClaimBatches(from: Date, to: Date, batchSize: number = EXPORT_BATCH_SIZE) {
  let cursor: Cursor | null = null;

  while (true) {
    const rows: ExportRow[] = await readBatch(from, to, cursor, batchSize);
    if (rows.length === 0) {
      return;
    }
    yield rows;

    // A short batch was the last one: no need for one more query that would come back empty
    if (rows.length < batchSize) {
      return;
    }
    const last = rows[rows.length - 1];
    cursor = { approvedAt: last.approvedAt, id: last.id };
  }
}

// One exported claim as the cells of its CSV row, in the order of EXPORT_HEADER
export function toCsvFields(row: ExportRow): (string | number)[] {
  return [
    row.claimNumber,
    row.id,
    row.title,
    row.claimantName,
    row.claimantEmail,
    row.submittedAt ? row.submittedAt.toISOString() : "",
    row.approvedAt.toISOString(),
    row.total,
    row.lineItemCount,
  ];
}
