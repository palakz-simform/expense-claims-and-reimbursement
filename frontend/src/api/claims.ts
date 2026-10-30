import { http } from './http'
import type { ClaimDetail, ClaimStatus, ClaimSummary, Paginated } from '@/types/api'

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
