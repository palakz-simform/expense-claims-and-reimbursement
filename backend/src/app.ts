import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalLimiter } from "./middleware/rateLimit";
import { authenticate } from "./middleware/authenticate";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authProtectedRouter, authPublicRouter } from "./modules/auth/auth.routes";

const app = express();

// Middleware
app.use(helmet()); // sets secure HTTP headers
app.use(cors()); // allows cross-origin requests from the frontend
app.use(globalLimiter); // loose per-IP safety net for every route
app.use(express.json({ limit: "100kb" })); // parses JSON request bodies into req.body (size capped)

// Public routes (the ONLY ones that work without a token)
// Health check: lets Docker/monitoring confirm the API is up
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/auth", authPublicRouter); // POST /auth/login

// Everything registered below this line requires a valid user (deny by default),
// so a new route cannot be left unprotected by forgetting a middleware.
app.use(authenticate);

// Protected routes
app.use("/auth", authProtectedRouter); // GET /auth/me

// 404 for unknown routes, then the central error handler (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
