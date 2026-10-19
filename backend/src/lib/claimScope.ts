import type { Prisma } from "../generated/prisma/client";
import { ApprovalStatus, Role } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";

// Approval steps that make a claim visible to its approver (WAITING stays hidden: their turn has not come)
const VISIBLE_APPROVAL_STATUSES = [
  ApprovalStatus.PENDING,
  ApprovalStatus.APPROVED,
  ApprovalStatus.REJECTED,
  ApprovalStatus.INVALIDATED,
];

// The one place that says which claims a user may read. Spread it into the query's `where`,
// so an out-of-scope claim is simply not found (404). Concept: centralised policy, object-level authorization.
export function claimScopeFor(user: AuthUser): Prisma.ClaimWhereInput {
  switch (user.role) {
    case Role.CLAIMANT:
      return { claimantId: user.id };
    case Role.APPROVER:
      return { approvals: { some: { approverId: user.id, status: { in: VISIBLE_APPROVAL_STATUSES } } } };
    case Role.FINANCE:
      return {};
    default: {
      // Fail closed: an unknown role must never fall through to "no filter" (which would show every claim)
      const unknownRole: never = user.role;
      throw new Error(`No claim scope for role ${String(unknownRole)}`);
    }
  }
}
