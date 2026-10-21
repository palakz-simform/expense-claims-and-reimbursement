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

// "2026-01-01" from a UTC midnight date, for the file name
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
