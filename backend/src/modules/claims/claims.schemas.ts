import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { Category } from "../../generated/prisma/enums";

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

// POST /claims: a title and 0..100 line items. There is deliberately no total field.
export const createClaimSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    lineItems: z.array(lineItemSchema).max(100).default([]),
  })
  .strict();

// /claims/:id
export const claimIdParamsSchema = z.object({ id: z.uuid() }).strict();

export type CreateClaimInput = z.infer<typeof createClaimSchema>;
