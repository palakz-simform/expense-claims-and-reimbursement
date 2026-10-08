import { Router } from "express";
import { loginLimiter } from "../../middleware/rateLimit";
import * as controller from "./auth.controller";

// Public: the only route that works without a token
export const authPublicRouter = Router();
authPublicRouter.post("/login", loginLimiter, controller.login);

// Protected: mounted after `authenticate`
export const authProtectedRouter = Router();
authProtectedRouter.get("/me", controller.me);
