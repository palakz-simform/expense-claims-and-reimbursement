import { z } from "zod";

// Page number and page size for every list endpoint (page size capped at 100).
// Query strings arrive as text, so they are coerced to numbers. Unknown query fields are rejected.
export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
