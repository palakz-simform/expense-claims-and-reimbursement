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

- **Claim total is derived.** There is no stored total; it is `SUM(lineItem.amount)`, so it cannot drift from the line items. Amounts use `Decimal(12,2)`. In the API, money (`amount`, `total`) is a **string with 2 decimals** (for example `"125.50"`), never a JSON number, and clients cannot send a `total` (unknown fields are rejected with 400).
- **Receipts are attached per line item, not per claim** (the brief allows either; this is our documented choice). A line item can have zero or more receipts; a receipt is optional and is not required to submit. Why per line item: each receipt proves one specific expense, so approvers and finance can trace an amount to its evidence, and the approved-claim lock triggers apply at the same level as the amounts they protect.
- **Status flow:** `DRAFT -> PENDING_APPROVAL -> APPROVED`, or `PENDING_APPROVAL -> REJECTED -> (edit, resubmit) -> PENDING_APPROVAL`. `APPROVED` is terminal and read-only.
- **Approval routing (N levels):** the number of required levels comes from an ordered list of amount tiers in `lib/approvalPolicy.ts` (currently: from ₹0 level 1; from ₹10,000 levels 1 and 2). Each claimant has a fixed approver per level in `ApproverAssignment` (one row per claimant and level, set up by the seed because there is no admin UI). On submit, the chain is built by looping over `1..requiredLevels` and copying the claimant's assigned approver for each level onto an `Approval` row, so assignment changes later never affect claims already in flight. Adding a level 3 means one new tier in the policy plus assignment rows, with no schema change. If a claimant has no approver at a required level, submit fails with `422 NO_APPROVER_AVAILABLE`.
- **Amount change during approval:** a claim awaiting approval can still be edited (line items or title). If an edit changes the **total**, every decision so far is void: the live approval rows (waiting, pending and already approved) become `INVALIDATED`, `chainVersion` goes up by one, and a new chain is built from level 1 for the new total. The approvers stay the same, because they come from the claimant's fixed assignments, so if Alice approved and Bob was pending, both are reset and Alice is asked again. The number of levels can change if the total crosses a tier (for example ₹9,000 to ₹12,000 adds level 2). An edit that leaves the total unchanged (a description, date, category or title change) does not reset anything, and neither does an edit to a draft or a rejected claim (a rejected claim has no live chain; resubmit builds a new one). Old approval rows are kept for audit, and every edit to a submitted claim is recorded in `ClaimHistory` (`CLAIM_UPDATED`, plus `APPROVAL_CHAIN_RESET` when the chain is rebuilt). A claim awaiting approval must keep at least one line item (`422 NO_LINE_ITEMS`); a draft or rejected claim may be emptied but cannot be submitted again until it has an item. An approved claim cannot be edited at all.
- **Approving and rejecting:** an approver decides only their own step, and only while it is `PENDING` on the live chain (`GET /approvals` is the queue). Approve moves the next level to `PENDING`, or approves the claim when it was the last level. Reject needs a reason (`400` without one): the claim becomes `REJECTED`, earlier approvals stay, and the open steps become `INVALIDATED`. The claim row is locked before deciding, so a decision and a claimant edit never interleave, and a decision on a step voided by an edit is refused (`409 APPROVAL_NOT_PENDING`). Each decision writes `APPROVAL_GRANTED` or `CLAIM_REJECTED` (and `CLAIM_APPROVED` for the last level) in the same transaction.
- **Rejection and resubmission:** a rejected claim goes back to the claimant with the reason (`lastRejection` on `GET /claims/:id`: reason, level, time and who rejected it). It stays editable but has no live chain, so edits never reset anything. `POST /claims/:id/resubmit` (only for a `REJECTED` claim, with at least one line item) starts a **new chain from level 1 with the same approvers** (one `chainVersion` higher) and moves the claim to `PENDING_APPROVAL`. Nothing is lost: the earlier approval rows, the rejection and its reason, the history and the original `submittedAt` all stay, and the resubmit is recorded as `CLAIM_RESUBMITTED`. `lastRejection` is kept after a resubmit and replaced if the claim is rejected again. Approvers come from the claimant's fixed assignments, so reassigning an approver between a rejection and the resubmit is out of scope for this POC.
- **Approved claims are locked** in the service layer and by PostgreSQL triggers on line items and receipts.
- **Audit trail:** every state change writes a `ClaimHistory` row in the same transaction.
- **Visibility is enforced in queries.** `claimScopeFor(user)` (one function in `lib/claimScope.ts`) returns the `where` for every claim read, so an out-of-scope claim is simply not found (`404`, never 403, so its existence is not revealed). A claimant sees their own claims; an approver sees claims where they have a `PENDING`, `APPROVED`, `REJECTED` or `INVALIDATED` step (a `WAITING` step stays hidden until their turn comes); finance sees all claims. Reads (`GET /claims`, `GET /claims/:id`) are open to all three roles within that scope; every write stays claimant-only. `GET /approvals` is the approver's to-do list (only steps they can decide now), while `GET /claims` is the read-only view of every claim they are involved in.
- **Only drafts can be deleted.** A draft was never submitted, so `DELETE /claims/:id` removes it together with its line items and its own history. A submitted claim (pending, rejected or approved) is never deleted: its history and approvals are the audit trail finance may need in a dispute. Only the `title` of a claim can be edited (`PATCH /claims/:id`); the total is derived and the status follows the workflow.
- **Lists are paginated, never loaded whole.** `GET /claims?page=1&pageSize=20` (`pageSize` at most 100) accepts optional filters `status`, `from` and `to` (see below) and returns `{ data, pagination: { page, pageSize, totalItems, totalPages } }`, newest first; list items have the computed `total` and `lineItemCount` but no line items. Totals for a page come from one grouped query.
- **List filters.** `status` is one of `DRAFT`, `PENDING_APPROVAL`, `REJECTED`, `APPROVED`. `from` and `to` (`YYYY-MM-DD`) filter on `submittedAt` and are inclusive UTC calendar days (`to` includes the whole day). A draft has no `submittedAt`, so any date filter leaves drafts out. `from` later than `to`, a bad date, a bad status or an unknown query field is `400`. Filters are combined with the role's scope using `AND`, so a filter can only narrow what a user may see.
- **Dates are calendar dates compared in UTC.** A line item's `date` (`YYYY-MM-DD`) must be a real date and cannot be later than today's date in UTC (server time). A user far west of UTC may therefore be able to enter a date that is still "tomorrow" on their own clock; the rule never rejects a valid past expense.

## Logging and request IDs

- Logs are structured JSON via `pino` (readable colours in development). `LOG_LEVEL` sets the minimum level (default `info`). Passwords, tokens and the `Authorization` header are redacted.
- Every request gets a generated ID, returned in the `X-Request-Id` response header.
- One log line per request when it finishes: method, URL, status, duration and request ID. Level follows the outcome: `info` (2xx/3xx), `warn` (4xx), `error` (5xx). `/health` is not logged.
- Every error response has the same shape, `{ "error": { "code", "message", "requestId" } }`. `requestId` equals the `X-Request-Id` header, so a user can quote it and you can find that request's log line.
- Invalid input (`400 VALIDATION_ERROR`) also has `details`: one `{ in, path, message }` per bad field (`in` is `body`, `query` or `params`), so a form can mark the right input. Schemas are `.strict()`, so unknown fields are rejected too.
- Expected errors (our rules, 4xx) return their own code. Unexpected errors (bugs) always return a generic `500 INTERNAL_ERROR`; the message and stack trace appear only on that request's log line, never in the response.
- On `SIGTERM` or `SIGINT` the server stops taking new requests, lets running ones finish, closes the database connection and exits (forced after 10 seconds). An unhandled rejection or uncaught exception is logged as `fatal`, then the process shuts down with exit code 1.

## Error codes (so far)

| Case | Response |
|---|---|
| Claim outside my visibility (or missing) | 404 `NOT_FOUND` |
| Invalid list filter (bad `status` or date, `from` after `to`, unknown query field) | 400 `VALIDATION_ERROR` |
| Approve/reject an approval that is not mine (or does not exist) | 404 `NOT_FOUND` (not 403, so its existence is not revealed) |
| Approval no longer pending | 409 `APPROVAL_NOT_PENDING` |
| Editing an approved claim | 409 `CLAIM_LOCKED` (also raised by the database trigger as a backstop) |
| Adding a line item to a claim that already has 100 | 422 `LINE_ITEM_LIMIT_REACHED` |
| Deleting a claim that was already submitted (pending or rejected) | 409 `CLAIM_NOT_DELETABLE` (an approved one is 409 `CLAIM_LOCKED`) |
| Submitting a claim that is not a draft | 409 `CLAIM_NOT_SUBMITTABLE` (an approved one is 409 `CLAIM_LOCKED`) |
| Resubmitting a claim that is not rejected | 409 `CLAIM_NOT_RESUBMITTABLE` (an approved one is 409 `CLAIM_LOCKED`) |
| A value that must be unique already exists | 409 `CONFLICT` |
| Submitting or resubmitting with no line items, or removing the last line item of a claim awaiting approval | 422 `NO_LINE_ITEMS` |
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
