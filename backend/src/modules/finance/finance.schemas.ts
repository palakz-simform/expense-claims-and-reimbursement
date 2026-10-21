import { z } from "zod";
import { queryDateSchema } from "../../lib/queryDate";

// GET /finance/export: the period is the claims' FINAL APPROVAL date (approvedAt), inclusive, in UTC.
// Both days are required, so a forgotten `to` can never turn into "everything ever approved".
export const exportQuerySchema = z
  .object({ from: queryDateSchema, to: queryDateSchema })
  .strict()
  .refine((query) => query.from <= query.to, { message: "from cannot be later than to", path: ["from"] });

export type ExportQuery = z.infer<typeof exportQuerySchema>;
