import { z } from "zod";
import { paginationQuerySchema } from "../../lib/pagination";
import { queryDateSchema } from "../../lib/queryDate";
import { Prisma } from "../../generated/prisma/client";
import { Category, ClaimStatus } from "../../generated/prisma/enums";

// Most line items one claim can have (also enforced when adding a single item)
export const MAX_LINE_ITEMS = 100;

// One expense line. .strict() rejects unknown keys such as `total` or `claimId` (mass-assignment protection).
export const lineItemSchema = z
  .object({
    // A real calendar date (YYYY-MM-DD), not in the future (compared in UTC)
    date: z.iso
      .date()
      .refine((value) => value <= new Date().toISOString().slice(0, 10), "Date cannot be in the future")
      .transform((value) => new Date(`${value}T00:00:00.000Z`)),

    category: z.enum(Category),

    // Positive, at most 2 decimals. Checked as TEXT then turned into a Decimal, so no floating-point error.
    amount: z
      .union([z.number(), z.string()])
      .transform((value) => String(value).trim())
      .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Amount must be a number with at most 2 decimal places"))
      .refine((value) => Number(value) > 0, "Amount must be greater than zero")
      .transform((value) => new Prisma.Decimal(value)),

    description: z.string().trim().min(1, "Description is required").max(500),
  })
  .strict();

// A claim's title
const titleSchema = z.string().trim().min(1, "Title is required").max(200);

// POST /claims: a title and 0..100 line items. There is deliberately no total field.
export const createClaimSchema = z
  .object({
    title: titleSchema,
    lineItems: z.array(lineItemSchema).max(MAX_LINE_ITEMS).default([]),
  })
  .strict();

// PATCH /claims/:id: only the title can be edited (the total is derived, the status follows the workflow)
export const updateClaimSchema = z.object({ title: titleSchema }).strict();

// PATCH /claims/:id/line-items/:itemId: only the fields that change, at least one
export const updateLineItemSchema = lineItemSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "At least one field is required");

// /claims/:id
export const claimIdParamsSchema = z.object({ id: z.uuid() }).strict();

// /claims/:id/line-items/:itemId
export const lineItemParamsSchema = z.object({ id: z.uuid(), itemId: z.uuid() }).strict();

// GET /claims: shared pagination plus optional filters. from/to are inclusive days of submittedAt (UTC).
export const listClaimsQuerySchema = paginationQuerySchema
  .extend({
    status: z.enum(ClaimStatus).optional(),
    from: queryDateSchema.optional(),
    to: queryDateSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "from cannot be later than to",
    path: ["from"],
  });

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
// GET /claims/:id/history: the shared page number and page size
export const claimHistoryQuerySchema = paginationQuerySchema;

export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
export type ClaimHistoryQuery = z.infer<typeof claimHistoryQuerySchema>;
export type LineItemInput = z.infer<typeof lineItemSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type UpdateLineItemInput = z.infer<typeof updateLineItemSchema>;
