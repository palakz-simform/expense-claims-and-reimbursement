// Types that mirror the backend's JSON responses (backend/prisma/schema.prisma enums)

export type Role = 'CLAIMANT' | 'APPROVER' | 'FINANCE'

export type ClaimStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'REJECTED' | 'APPROVED'

export type ApprovalStatus = 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'INVALIDATED'

export type Category =
  'TRAVEL' | 'ACCOMMODATION' | 'MEALS' | 'TRANSPORT' | 'OFFICE_SUPPLIES' | 'OTHER'

// The signed-in user (approvalLevel is 1 or 2 for approvers, null otherwise)
export type User = {
  id: string
  email: string
  name: string
  role: Role
  approvalLevel: number | null
}

// POST /auth/login
export type LoginResponse = {
  token: string
  user: User
}

// A receipt file attached to a line item (the stored file name is never sent)
export type Receipt = {
  id: string
  lineItemId: string
  originalName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

// One expense line. date is a calendar date "YYYY-MM-DD"; amount is a decimal string like "125.50"
export type LineItem = {
  id: string
  date: string
  category: Category
  amount: string
  description: string
  receipts: Receipt[]
}

// Fields shared by the list and detail shapes. total is computed by the API, never by the client
type ClaimBase = {
  id: string
  claimNumber: number
  title: string
  status: ClaimStatus
  total: string
  submittedAt: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
}

// GET /claims rows
export type ClaimSummary = ClaimBase & { lineItemCount: number }

// One step of the live approval chain
export type ApprovalStep = {
  level: number
  status: ApprovalStatus
  approverName: string
  decidedAt: string | null
}

// The latest rejection, shown so the claimant knows what to fix
export type LastRejection = {
  reason: string
  level: number
  rejectedAt: string
  rejectedBy: string
}

// GET /claims/:id (and the write endpoints, which may omit the last two fields)
export type ClaimDetail = ClaimBase & {
  lineItems: LineItem[]
  lastRejection?: LastRejection | null
  approvals?: ApprovalStep[]
}

// Audit actions (backend AuditAction enum)
export type AuditAction =
  | 'CLAIM_CREATED'
  | 'CLAIM_UPDATED'
  | 'CLAIM_SUBMITTED'
  | 'APPROVAL_GRANTED'
  | 'CLAIM_APPROVED'
  | 'CLAIM_REJECTED'
  | 'CLAIM_RESUBMITTED'
  | 'APPROVAL_CHAIN_RESET'
  | 'RECEIPT_ADDED'
  | 'RECEIPT_REMOVED'

// GET /claims/:id/history rows (oldest first); metadata differs per action
export type HistoryEntry = {
  id: string
  action: AuditAction
  reason: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
  performedBy: { name: string; role: Role }
}

// Every list endpoint: { data, pagination }
export type Paginated<T> = {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
