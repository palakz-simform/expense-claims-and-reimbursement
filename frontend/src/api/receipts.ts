import { http } from './http'
import type { Receipt } from '@/types/api'

// Same limits as the backend (receipts.upload.ts); checked here only to give quick feedback
export const RECEIPT_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024
export const RECEIPTS_PER_ITEM = 5

// POST /line-items/:id/receipts: multipart, one file in the "file" field.
// axios sets the multipart Content-Type (with its boundary) itself when given FormData.
export async function uploadReceipt(lineItemId: string, file: File): Promise<Receipt> {
  const form = new FormData()
  form.append('file', file)
  const response = await http.post<Receipt>(`/line-items/${lineItemId}/receipts`, form)
  return response.data
}

// GET /receipts/:id: the file bytes (needs the Bearer header, so no plain link)
export async function downloadReceipt(receiptId: string): Promise<Blob> {
  const response = await http.get<Blob>(`/receipts/${receiptId}`, { responseType: 'blob' })
  return response.data
}

// DELETE /receipts/:id
export async function deleteReceipt(receiptId: string): Promise<void> {
  await http.delete(`/receipts/${receiptId}`)
}
