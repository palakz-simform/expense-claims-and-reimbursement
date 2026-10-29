import { Router } from "express";
import { Role } from "../../generated/prisma/enums";
import { requireRole } from "../../middleware/requireRole";
import { validate } from "../../middleware/validate";
import * as controller from "./finance.controller";
import { exportQuerySchema } from "./finance.schemas";

// Finance only, for the whole module: a route added here later is protected without remembering a guard
export const financeRouter = Router();
financeRouter.use(requireRole(Role.FINANCE));

financeRouter.get("/export", validate({ query: exportQuerySchema }), controller.exportClaims);
