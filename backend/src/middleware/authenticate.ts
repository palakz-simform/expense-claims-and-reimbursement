import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { AppError } from "../lib/AppError";

// Same response for every failure (missing, malformed, expired, unknown user): reveals nothing
const unauthenticated = () => new AppError(401, "UNAUTHENTICATED", "Authentication required");

// Verifies the bearer token, then RELOADS the user from the database so a deleted user or a
// changed role takes effect immediately (we never trust role data inside the token).
export const authenticate: RequestHandler = async (req, _res, next) => {
  // --- Read "Authorization: Bearer <token>" ---
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) {
    throw unauthenticated();
  }

  // --- Verify signature and expiry; pin the algorithm so a forged "alg" cannot be used ---
  let userId: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw unauthenticated();
    }
    userId = payload.sub;
  } catch {
    throw unauthenticated();
  }

  // --- Load the current user (select only what the app needs, never passwordHash) ---
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, approvalLevel: true },
  });
  if (!user) {
    throw unauthenticated();
  }

  req.user = user;
  next();
};
