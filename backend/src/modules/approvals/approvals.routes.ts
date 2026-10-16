import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./approvals.controller";
import { listApprovalsQuerySchema } from "./approvals.schemas";

// Approver-only. Order: role check, then validation.
export const approvalsRouter = Router();
approvalsRouter.get("/", requireRole(Role.APPROVER), validate({ query: listApprovalsQuerySchema }), controller.list);
