import type { Request, Response } from "express";
import type { CreateClaimInput } from "./claims.schemas";
import * as claimsService from "./claims.service";

// POST /claims: the body was already validated by validate(); req.user was set by authenticate
export async function create(req: Request, res: Response) {
  const user = req.user!;
  const input: CreateClaimInput = req.body;
  const claim = await claimsService.createClaim(user, input);
  res.status(201).json(claim);
}

// GET /claims/:id
export async function getOne(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const claim = await claimsService.getClaim(user, claimId);
  res.json(claim);
}
