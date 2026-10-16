import { paginationQuerySchema, type PaginationQuery } from "../../lib/pagination";

// GET /approvals: page number and page size (the shared list pagination)
export const listApprovalsQuerySchema = paginationQuerySchema;

export type ListApprovalsQuery = PaginationQuery;
