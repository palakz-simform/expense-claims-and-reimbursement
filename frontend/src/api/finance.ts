import { http } from './http'

// GET /finance/export?from=&to=: approved claims as CSV. The period is the FINAL approval date (approvedAt),
// both days inclusive. Fetched as a blob because the request needs the Bearer header.
export async function exportApprovedClaims(from: string, to: string): Promise<Blob> {
  const params = { from, to }
  const response = await http.get<Blob>('/finance/export', { params, responseType: 'blob' })
  return response.data
}

// The same name the server puts in Content-Disposition (CORS hides that header from the browser)
export function exportFileName(from: string, to: string): string {
  return `approved-claims_${from}_${to}.csv`
}
