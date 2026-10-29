import { Router } from "express";
import { loginLimiter } from "../../middleware/rateLimit";
import { validate } from "../../middleware/validate";
import * as controller from "./auth.controller";
import { loginSchema } from "./auth.schemas";

// Public: the only route that works without a token
export const authPublicRouter = Router();
authPublicRouter.post("/login", loginLimiter, validate({ body: loginSchema }), controller.login);

// Protected: mounted after `authenticate`
export const authProtectedRouter = Router();
authProtectedRouter.get("/me", controller.me);
