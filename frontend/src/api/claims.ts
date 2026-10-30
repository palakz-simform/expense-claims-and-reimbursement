import { http } from './http'
import type { Category, ClaimDetail, ClaimStatus, ClaimSummary, Paginated } from '@/types/api'

// GET /claims filters (from/to are inclusive YYYY-MM-DD on submittedAt)
export type ClaimListQuery = {
  page?: number
  pageSize?: number
  status?: ClaimStatus
  from?: string
  to?: string
}

// GET /claims: the backend scopes the list to what this user may see
export async function listClaims(query: ClaimListQuery): Promise<Paginated<ClaimSummary>> {
  const response = await http.get<Paginated<ClaimSummary>>('/claims', { params: query })
  return response.data
}

// GET /claims/:id
export async function getClaim(id: string): Promise<ClaimDetail> {
  const response = await http.get<ClaimDetail>(`/claims/${id}`)
  return response.data
}

// POST /claims: a new draft with just a title (line items are added in the editor)
export async function createClaim(title: string): Promise<ClaimDetail> {
  const response = await http.post<ClaimDetail>('/claims', { title })
  return response.data
}

// Body for adding or editing a line item (amount stays a string, never a float)
export type LineItemInput = {
  date: string
  category: Category
  amount: string
  description: string
}

// PATCH /claims/:id: only the title can change
export async function updateClaimTitle(id: string, title: string): Promise<ClaimDetail> {
  const response = await http.patch<ClaimDetail>(`/claims/${id}`, { title })
  return response.data
}

// DELETE /claims/:id: drafts only (409 CLAIM_NOT_DELETABLE otherwise)
export async function deleteClaim(id: string): Promise<void> {
  await http.delete(`/claims/${id}`)
}

// POST /claims/:id/submit: DRAFT → PENDING_APPROVAL (builds the approval chain)
export async function submitClaim(id: string): Promise<ClaimDetail> {
  const response = await http.post<ClaimDetail>(`/claims/${id}/submit`)
  return response.data
}

// POST /claims/:id/resubmit: REJECTED → PENDING_APPROVAL (new chain from level 1)
export async function resubmitClaim(id: string): Promise<ClaimDetail> {
  const response = await http.post<ClaimDetail>(`/claims/${id}/resubmit`)
  return response.data
}

// Line item writes return the whole claim, so the page shows the server's new total
export async function addLineItem(claimId: string, item: LineItemInput): Promise<ClaimDetail> {
  const response = await http.post<ClaimDetail>(`/claims/${claimId}/line-items`, item)
  return response.data
}

export async function updateLineItem(
  claimId: string,
  itemId: string,
  changes: Partial<LineItemInput>,
): Promise<ClaimDetail> {
  const url = `/claims/${claimId}/line-items/${itemId}`
  const response = await http.patch<ClaimDetail>(url, changes)
  return response.data
}

export async function deleteLineItem(claimId: string, itemId: string): Promise<ClaimDetail> {
  const response = await http.delete<ClaimDetail>(`/claims/${claimId}/line-items/${itemId}`)
  return response.data
}
