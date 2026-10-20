import { z } from "zod";

// Most receipts one line item can have
export const MAX_RECEIPTS_PER_LINE_ITEM = 5;

// /line-items/:id/receipts
export const lineItemIdParamsSchema = z.object({ id: z.uuid() }).strict();

// /receipts/:id
export const receiptIdParamsSchema = z.object({ id: z.uuid() }).strict();
