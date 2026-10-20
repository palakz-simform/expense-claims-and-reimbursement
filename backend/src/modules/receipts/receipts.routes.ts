import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./receipts.controller";
import { receiptUpload } from "./receipts.upload";
import { lineItemIdParamsSchema, receiptIdParamsSchema } from "./receipts.schemas";

// Mounted at the root because receipts live under two prefixes (/line-items/... and /receipts/...).
// Order: role check and params first, so a bad request is refused BEFORE a file is written to disk.
export const receiptsRouter = Router();
receiptsRouter.post(
  "/line-items/:id/receipts",
  requireRole(Role.CLAIMANT),
  validate({ params: lineItemIdParamsSchema }),
  receiptUpload,
  controller.upload,
);

// Any role may ask; what they can actually get is limited by the claim scope inside the query
receiptsRouter.get(
  "/receipts/:id",
  requireRole(Role.CLAIMANT, Role.APPROVER, Role.FINANCE),
  validate({ params: receiptIdParamsSchema }),
  controller.download,
);

// Removing follows the same rule as adding: claimant only, and the claim must not be approved
receiptsRouter.delete("/receipts/:id", requireRole(Role.CLAIMANT), validate({ params: receiptIdParamsSchema }), controller.remove);
