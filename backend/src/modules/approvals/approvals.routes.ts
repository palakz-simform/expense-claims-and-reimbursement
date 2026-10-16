import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./approvals.controller";
import { approvalIdParamsSchema, listApprovalsQuerySchema } from "./approvals.schemas";

// Approver-only. Order: role check, then validation.
export const approvalsRouter = Router();
approvalsRouter.get("/", requireRole(Role.APPROVER), validate({ query: listApprovalsQuerySchema }), controller.list);
approvalsRouter.post("/:id/approve", requireRole(Role.APPROVER), validate({ params: approvalIdParamsSchema }), controller.approve);
