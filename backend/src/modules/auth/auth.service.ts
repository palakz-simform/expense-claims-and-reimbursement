import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/AppError";
import type { LoginInput } from "./auth.schemas";

// Hash of a throwaway password, compared against when the email does not exist so a wrong
// email takes as long as a wrong password (timing-attack / user-enumeration protection).
// Rounds match the seed.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function login({ email, password }: LoginInput) {
  // --- Look up the user; ALWAYS run one bcrypt compare, found or not ---
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // --- One identical error for "no such email" and "wrong password" ---
  if (!user || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  // --- Sign the token: payload is only the user id; algorithm pinned; expiry from env ---
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, approvalLevel: user.approvalLevel },
  };
}
