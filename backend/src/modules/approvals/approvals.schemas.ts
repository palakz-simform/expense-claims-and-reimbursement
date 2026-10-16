import { z } from "zod";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";

// GET /approvals: page number and page size (the shared list pagination)
export const listApprovalsQuerySchema = paginationQuerySchema;

// /approvals/:id
export const approvalIdParamsSchema = z.object({ id: z.uuid() }).strict();

export type ListApprovalsQuery = PaginationQuery;
