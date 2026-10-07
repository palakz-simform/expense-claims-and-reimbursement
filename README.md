# Expense Claims & Reimbursement (POC)

Employees submit itemised expense claims with receipts. Claims route through an approval chain based on amount, and finance exports approved claims for a period.

The focus is backend correctness: data integrity, authorization, approval workflow, transactions and audit history. The backend is the source of truth; the frontend is only a client.

> Status: work in progress. This README is the starting point and will be updated as the project is built. See [STEPS.md](STEPS.md) for the build plan.

## Stack

- Frontend: Vue 3
- Backend: Node.js, Express, TypeScript
- ORM / DB: Prisma, PostgreSQL (hosted on Neon)
- Auth: JWT issued by the Express backend, bcrypt password hashing
- Files: Multer, stored on a Docker volume (metadata in PostgreSQL)
- Containers: Docker + Docker Compose (frontend and backend; no database container)

## Roles

| Role | Can do |
|---|---|
| CLAIMANT | Create, edit, submit and resubmit own claims; view own claims |
| APPROVER | View claims in their queue and ones they decided; approve or reject with a reason |
| FINANCE | View all claims (read-only); export approved claims for a period |

Each user has one role. Approvers also have an `approvalLevel` (1 or 2).

## Key design decisions

- **Claim total is derived.** There is no stored total; it is `SUM(lineItem.amount)`, so it cannot drift from the line items. Amounts use `Decimal(12,2)`.
- **Receipts are attached per line item, not per claim** (the brief allows either; this is our documented choice). A line item can have zero or more receipts; a receipt is optional and is not required to submit. Why per line item: each receipt proves one specific expense, so approvers and finance can trace an amount to its evidence, and the approved-claim lock triggers apply at the same level as the amounts they protect.
- **Status flow:** `DRAFT -> PENDING_APPROVAL -> APPROVED`, or `PENDING_APPROVAL -> REJECTED -> (edit, resubmit) -> PENDING_APPROVAL`. `APPROVED` is terminal and read-only.
- **Approval routing (N levels):** the number of required levels comes from an ordered list of amount tiers in `lib/approvalPolicy.ts` (currently: from ₹0 level 1; from ₹10,000 levels 1 and 2). Each claimant has a fixed approver per level in `ApproverAssignment` (one row per claimant and level, set up by the seed because there is no admin UI). On submit, the chain is built by looping over `1..requiredLevels` and copying the claimant's assigned approver for each level onto an `Approval` row, so assignment changes later never affect claims already in flight. Adding a level 3 means one new tier in the policy plus assignment rows, with no schema change. If a claimant has no approver at a required level, submit fails with `422 NO_APPROVER_AVAILABLE`.
- **Amount change during approval:** any change to the total invalidates the current chain, increments `chainVersion`, and builds a new chain. The same approver is kept per level where possible. Old approval records are kept for audit.
- **Approved claims are locked** in the service layer and by PostgreSQL triggers on line items and receipts.
- **Audit trail:** every state change writes a `ClaimHistory` row in the same transaction.
- **Visibility is enforced in queries.** An approver requesting a claim outside their queue gets `404`.

## Error codes (so far)

| Case | Response |
|---|---|
| Claim outside my visibility | 404 |
| Approve/reject outside my queue | 403 `NOT_YOUR_APPROVAL` |
| Approval no longer pending | 409 `APPROVAL_NOT_PENDING` |
| Editing an approved claim | 409 `CLAIM_LOCKED` |
| Submitting with no line items | 422 `NO_LINE_ITEMS` |
| Claimant has no approver at a required level | 422 `NO_APPROVER_AVAILABLE` |

## Project layout

```
backend/    Express API, Prisma schema, tests
frontend/   Vue 3 app
docker-compose.yml
.env.example
STEPS.md    Build plan
```

## Setup (to be completed)

1. Copy `.env.example` to `.env` and fill in the values (Neon `DATABASE_URL` and `DIRECT_URL`, `JWT_SECRET`, etc.).
2. `docker compose up`

Seeded logins, how to run tests, the finance export date definition and the full API reference will be added later.

## Out of scope

Registration, password reset, email verification, OCR, organisational hierarchy, realtime notifications.
