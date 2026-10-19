import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./claims.controller";
import {
  claimIdParamsSchema,
  createClaimSchema,
  lineItemParamsSchema,
  lineItemSchema,
  listClaimsQuerySchema,
  updateClaimSchema,
  updateLineItemSchema,
} from "./claims.schemas";

// Writes are claimant-only; reads are open to every role and limited by claimScopeFor. Order: role check, then validation.
export const claimsRouter = Router();
claimsRouter.post("/", requireRole(Role.CLAIMANT), validate({ body: createClaimSchema }), controller.create);
claimsRouter.get("/", requireRole(Role.CLAIMANT), validate({ query: listClaimsQuerySchema }), controller.list);
claimsRouter.get(
  "/:id",
  requireRole(Role.CLAIMANT, Role.APPROVER, Role.FINANCE),
  validate({ params: claimIdParamsSchema }),
  controller.getOne,
);

claimsRouter.patch(
  "/:id",
  requireRole(Role.CLAIMANT),
  validate({ params: claimIdParamsSchema, body: updateClaimSchema }),
  controller.updateClaim,
);
claimsRouter.delete("/:id", requireRole(Role.CLAIMANT), validate({ params: claimIdParamsSchema }), controller.deleteClaim);

// Submit for approval: no body, so there is nothing for the client to tamper with
claimsRouter.post("/:id/submit", requireRole(Role.CLAIMANT), validate({ params: claimIdParamsSchema }), controller.submit);
claimsRouter.post("/:id/resubmit", requireRole(Role.CLAIMANT), validate({ params: claimIdParamsSchema }), controller.resubmit);

// Line items: one at a time, so each change is audited and receipts stay attached to their item
claimsRouter.post(
  "/:id/line-items",
  requireRole(Role.CLAIMANT),
  validate({ params: claimIdParamsSchema, body: lineItemSchema }),
  controller.addLineItem,
);
claimsRouter.patch(
  "/:id/line-items/:itemId",
  requireRole(Role.CLAIMANT),
  validate({ params: lineItemParamsSchema, body: updateLineItemSchema }),
  controller.updateLineItem,
);
claimsRouter.delete(
  "/:id/line-items/:itemId",
  requireRole(Role.CLAIMANT),
  validate({ params: lineItemParamsSchema }),
  controller.deleteLineItem,
);
