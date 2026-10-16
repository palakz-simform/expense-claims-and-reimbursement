import { z } from "zod";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";

// GET /approvals: page number and page size (the shared list pagination)
export const listApprovalsQuerySchema = paginationQuerySchema;

// /approvals/:id
export const approvalIdParamsSchema = z.object({ id: z.uuid() }).strict();

// POST /approvals/:id/reject: the reason is required, so the claimant knows what to fix
export const rejectApprovalSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(500) }).strict();

export type ListApprovalsQuery = PaginationQuery;
export type RejectApprovalInput = z.infer<typeof rejectApprovalSchema>;
