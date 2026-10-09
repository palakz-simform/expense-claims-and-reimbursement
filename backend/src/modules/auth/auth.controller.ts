import type { Request, Response } from "express";
import type { LoginInput } from "./auth.schemas";
import * as authService from "./auth.service";

// POST /auth/login: the body was already validated and cleaned by validate({ body: loginSchema })
export async function login(req: Request, res: Response) {
  const input: LoginInput = req.body;
  res.json(await authService.login(input));
}

// GET /auth/me: the user `authenticate` already loaded
export function me(req: Request, res: Response) {
  res.json({ user: req.user });
}
