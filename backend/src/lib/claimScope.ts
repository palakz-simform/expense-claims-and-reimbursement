import type { Prisma } from "../generated/prisma/client";
import { ApprovalStatus, Role } from "../generated/prisma/enums";
import type { AuthUser } from "../types/express";

// Approval steps that make a claim visible to its approver: their turn now, or a decision they made.
// WAITING stays hidden (their turn has not come). INVALIDATED is left out too: a step that was only WAITING
// becomes INVALIDATED when a lower level rejects or the chain resets, and it must not reveal the claim then.
const VISIBLE_APPROVAL_STATUSES = [ApprovalStatus.PENDING, ApprovalStatus.APPROVED, ApprovalStatus.REJECTED];

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
