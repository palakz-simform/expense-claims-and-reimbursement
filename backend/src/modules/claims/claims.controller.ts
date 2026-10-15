import type { Request, Response } from "express";
import type {
  CreateClaimInput,
  LineItemInput,
  ListClaimsQuery,
  UpdateClaimInput,
  UpdateLineItemInput,
} from "./claims.schemas";
import * as claimsService from "./claims.service";

// POST /claims: the body was already validated by validate(); req.user was set by authenticate
export async function create(req: Request, res: Response) {
  const user = req.user!;
  const input: CreateClaimInput = req.body;
  const claim = await claimsService.createClaim(user, input);
  res.status(201).json(claim);
}

// GET /claims?page=&pageSize=
export async function list(req: Request, res: Response) {
  const user = req.user!;
  const query = req.query as unknown as ListClaimsQuery; // already validated and converted to numbers by validate()
  const result = await claimsService.listClaims(user, query);
  res.json(result);
}

// GET /claims/:id
export async function getOne(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const claim = await claimsService.getClaim(user, claimId);
  res.json(claim);
}

// PATCH /claims/:id: change the claim's own fields (the title)
export async function updateClaim(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const changes: UpdateClaimInput = req.body;
  const claim = await claimsService.updateClaim(user, claimId, changes);
  res.json(claim);
}

// DELETE /claims/:id: delete a draft claim (204: success, nothing to return)
export async function deleteClaim(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  await claimsService.deleteClaim(user, claimId);
  res.status(204).send();
}

// POST /claims/:id/submit: send a draft for approval (no body: the server decides everything)
export async function submit(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const claim = await claimsService.submitClaim(user, claimId);
  res.json(claim);
}

// POST /claims/:id/line-items: add one line item
export async function addLineItem(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const item: LineItemInput = req.body;
  const claim = await claimsService.addLineItem(user, claimId, item);
  res.status(201).json(claim);
}

// PATCH /claims/:id/line-items/:itemId: change some fields of one line item
export async function updateLineItem(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const itemId = req.params.itemId as string;
  const changes: UpdateLineItemInput = req.body;
  const claim = await claimsService.updateLineItem(user, claimId, itemId, changes);
  res.json(claim);
}

// DELETE /claims/:id/line-items/:itemId: remove one line item
export async function deleteLineItem(req: Request, res: Response) {
  const user = req.user!;
  const claimId = req.params.id as string;
  const itemId = req.params.itemId as string;
  const claim = await claimsService.deleteLineItem(user, claimId, itemId);
  res.json(claim);
}
