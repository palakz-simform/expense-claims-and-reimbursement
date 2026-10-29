import type { RequestHandler } from "express";
import { AppError } from "../lib/AppError";
import type { Role } from "../generated/prisma/enums";

// Coarse role gate for a route: requireRole(Role.FINANCE). Runs after `authenticate`.
// Object-level checks (is this MY claim?) are done separately by query scoping and the services.
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to do this");
    }
    next();
  };
