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
