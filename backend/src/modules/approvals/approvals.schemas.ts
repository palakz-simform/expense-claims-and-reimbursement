import { z } from "zod";
import { paginationQuerySchema } from "../../lib/pagination";
import { queryDateSchema } from "../../lib/queryDate";

// GET /approvals: shared pagination plus an optional date range. from/to are inclusive days of the claim's submittedAt (UTC).
export const listApprovalsQuerySchema = paginationQuerySchema
  .extend({
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from cannot be later than to",
    path: ["from"],
  });

// /approvals/:id
export const approvalIdParamsSchema = z.object({ id: z.uuid() }).strict();

// POST /approvals/:id/reject: the reason is required, so the claimant knows what to fix
export const rejectApprovalSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(500) }).strict();

export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;
export type RejectApprovalInput = z.infer<typeof rejectApprovalSchema>;
