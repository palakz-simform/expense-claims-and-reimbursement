import type { Request, Response } from "express";
import type { ListApprovalsQuery, RejectApprovalInput } from "./approvals.schemas";
import * as approvalsService from "./approvals.service";

// GET /approvals?page=&pageSize=: the approver's queue; req.user was set by authenticate
export async function list(req: Request, res: Response) {
  const user = req.user!;
  const query = req.query as unknown as ListApprovalsQuery; // already validated and converted to numbers by validate()
  const result = await approvalsService.listPendingApprovals(user, query);
  res.json(result);
}

// POST /approvals/:id/approve: no body, the server decides everything
export async function approve(req: Request, res: Response) {
  const user = req.user!;
  const approvalId = req.params.id as string;
  const result = await approvalsService.approveApproval(user, approvalId);
  res.json(result);
}

// POST /approvals/:id/reject: the reason comes from the validated body
export async function reject(req: Request, res: Response) {
  const user = req.user!;
  const approvalId = req.params.id as string;
  const input: RejectApprovalInput = req.body;
  const result = await approvalsService.rejectApproval(user, approvalId, input.reason);
  res.json(result);
}
