import { http } from './http'
import type { ApprovalDecision, ApprovalQueueItem, Paginated } from '@/types/api'

// GET /approvals filters (from/to are inclusive YYYY-MM-DD on the claim's submittedAt)
export type ApprovalListQuery = {
  page?: number
  from?: string
  to?: string
}

// GET /approvals: only the steps waiting for this approver, oldest submission first
export async function listApprovals(
  params: ApprovalListQuery,
): Promise<Paginated<ApprovalQueueItem>> {
  const response = await http.get<Paginated<ApprovalQueueItem>>('/approvals', { params })
  return response.data
}

// POST /approvals/:id/approve: no body, the server decides the next step
export async function approveApproval(id: string): Promise<ApprovalDecision> {
  const response = await http.post<ApprovalDecision>(`/approvals/${id}/approve`)
  return response.data
}

// POST /approvals/:id/reject: a reason of 1-500 characters is required
export async function rejectApproval(id: string, reason: string): Promise<ApprovalDecision> {
  const body = { reason }
  const response = await http.post<ApprovalDecision>(`/approvals/${id}/reject`, body)
  return response.data
}
