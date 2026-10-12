import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./claims.controller";
import { claimIdParamsSchema, createClaimSchema } from "./claims.schemas";

// Claimant-only for now; other roles get read access in Phase 13. Order: role check, then validation.
export const claimsRouter = Router();
claimsRouter.post("/", requireRole(Role.CLAIMANT), validate({ body: createClaimSchema }), controller.create);
claimsRouter.get("/:id", requireRole(Role.CLAIMANT), validate({ params: claimIdParamsSchema }), controller.getOne);
