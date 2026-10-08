import type { Request, Response } from "express";
import { loginSchema } from "./auth.schemas";
import * as authService from "./auth.service";

// POST /auth/login: validate the body, delegate to the service
export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  res.json(await authService.login(input));
}

// GET /auth/me: the user `authenticate` already loaded
export function me(req: Request, res: Response) {
  res.json({ user: req.user });
}
