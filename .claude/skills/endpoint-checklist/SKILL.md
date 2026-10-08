---
name: endpoint-checklist
description: Review a new or changed API endpoint against this project's security, authorization and data-integrity checklist. Use after writing or before merging any route.
argument-hint: <file or route>
---

Review `$ARGUMENTS` (or the endpoints changed in the current diff) against this checklist. Report each item as OK, FAIL or N/A with `file:line`, and fix nothing unless asked. Rules come from `backend/CLAUDE.md`.

**Authentication and authorization**
- Mounted below `app.use(authenticate)` (deny by default).
- `requireRole(...)` for the roles that may call it.
- Reads of a claim are scoped in the query (`claimScopeFor(user)` with `findFirst({ where: { id, ...scope } })`); out of scope returns 404, not 403.
- Ownership/state checks live in the service (`NOT_YOUR_APPROVAL` 403, state-machine guards 409).

**Input**
- Zod schema with `.strict()`; params, query and body all validated; no `req.body` spread into Prisma.
- List endpoints paginated (`pageSize` capped at 100) and filterable without loading everything.

**Data integrity**
- Multi-step changes in one `prisma.$transaction`, including the `ClaimHistory` row.
- State transitions use a conditional `updateMany` (check `count`) or `SELECT ... FOR UPDATE`.
- Money uses `Decimal`, never JS `number`; the claim total is never stored or accepted from the client.
- Approved claims rejected with 409 `CLAIM_LOCKED` in the service (the DB triggers are the backstop).

**Errors and output**
- Throws `AppError`; the code is in the `README.md` error table.
- No stack traces, Prisma errors, password hashes or tokens in responses or logs.
- Select only the columns needed (no N+1, no `passwordHash`).

**API docs**
- Path, request body (reuse the Zod schema) and every response code registered in `backend/src/docs/openapi.ts` (`registry.registerPath`). Docs are hand-written and do not update themselves.

**Tests**
- Note which test covers it; the two mandatory ones are approver-by-ID isolation and total-cannot-desync.
