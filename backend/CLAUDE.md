# Backend rules (Express + TypeScript + Prisma 7 + Neon)

Run commands from `backend/`.

## Commands
- `npm run dev` (tsx watch), `npm run build` (tsc), `npm start` (node dist)
- `npx tsc --noEmit` type-check; `npx prisma validate` / `npx prisma format` check the schema
- `npx prisma migrate dev --name <name>` (use `--create-only` when hand-editing SQL), `npx prisma generate`
- Test script (Vitest + Supertest) is added later; tests run against the Neon `test` branch only

## Environment and database
- `DATABASE_URL`: **direct** Neon connection (no `-pooler`). Read only by the Prisma CLI in `prisma.config.ts` (migrations).
- `DATABASE_URL_POOLED`: **pooled** connection (`-pooler`). Used by the running app through `@prisma/adapter-pg`.
- `backend/.env` = dev (default branch). `backend/.env.test` = `test` branch, same variable names. Load `.env.test` explicitly when `NODE_ENV=test`.
- All env access goes through `src/config/env.ts` (Zod-validated, crashes on boot if invalid). Never read `process.env` elsewhere.
- Prisma 7: URL lives in `prisma.config.ts`, not in `schema.prisma`; a driver adapter is required when constructing `PrismaClient`; the client is generated to `src/generated/prisma` (gitignored; import from there, not `@prisma/client`). Verify the exact generator, adapter, import paths and `prisma.config.ts` options against the current Prisma 7 docs before implementing.
- Dependencies: anything imported at runtime (including `dotenv`) goes in `dependencies`; CLI/build/type packages go in `devDependencies`.

## Architecture (see STEPS.md Phase 1 for the tree)
- `modules/<feature>/` each with routes, controller, service.
- **Controllers** parse/validate input and call services. **Services** hold all business rules and own transactions. **Routes never touch Prisma.**
- One shared `PrismaClient` (`src/db/prisma.ts`). `app.ts` exports the app (for Supertest); `server.ts` listens.
- Errors: throw `AppError(status, code, message)`; one error handler returns `{ error: { code, message } }`. Never leak stack traces or Prisma errors to clients.
- **Graceful shutdown** in `server.ts`: on `SIGINT`/`SIGTERM`, stop accepting new requests (`server.close`), let in-flight requests finish where practical, disconnect Prisma (`$disconnect`), then exit; force-exit after a timeout. Concept: *graceful shutdown* (matters for Docker stop and deploys).

## Security checklist (apply to every endpoint)
- **AuthN:** `authenticate` mounted globally except `/auth/login` (deny by default, so a new route cannot be forgotten). Reload the user from the DB on each request (so a deleted user is rejected); do not trust role claims in the JWT. Concept: *deny by default*.
- **JWT:** payload is `{ sub: userId }` only. Pin the algorithm (HS256) when signing **and** verifying; expiry from `JWT_EXPIRES_IN`. Concept: *algorithm confusion attacks*.
- **Token delivery:** `Authorization: Bearer <token>` header, not cookies, so there is no CSRF surface. Concept: *CSRF*.
- **Scope of auth:** no registration (users come from the seed), no refresh tokens, no logout endpoint (client discards the token; it expires). Endpoints: `POST /auth/login`, `GET /auth/me`.
- **Constant-time login:** when the email does not exist, still run `bcrypt.compare` against a dummy hash so response time does not reveal whether the account exists. Concept: *timing attacks*.
- **AuthZ (layered, see below):** `requireRole` for coarse access, query scoping for visibility, service checks for ownership and state. Concept: *RBAC + object-level authorization*.
- **Authorization layers:** (1) `requireRole` on the route; (2) `claimScopeFor(user)` applied in the query so out-of-scope rows are 404; (3) service-level checks (`approval.approverId === user.id` -> 403 `NOT_YOUR_APPROVAL`, status/state-machine guards -> 409); (4) DB triggers/CHECKs as the final backstop. Keep the policy in one place (`claimScopeFor`, role constants), never repeated inline in controllers. Concept: *centralised policy, defence in depth*.
- **IDOR / BOLA:** scope every read with `claimScopeFor(user)` and `findFirst({ where: { id, ...scope } })`; out of scope returns **404**, not 403 (does not reveal existence). Concept: *Broken Object Level Authorization (OWASP API #1)*.
- **Mass assignment:** Zod schemas use `.strict()` so unknown keys (e.g. `total`, `role`, `status`) are rejected with 400. Never spread request bodies into Prisma calls.
- **Login:** bcrypt compare, identical error for wrong email and wrong password, rate-limit the endpoint (add `express-rate-limit`). Concept: *user-enumeration and brute-force protection*.
- **Headers/CORS:** `helmet()`; restrict `cors()` to the known frontend origin once it exists (currently open). Set a body size limit on `express.json`.
- **SQL:** Prisma is parameterized. For `$queryRaw` use tagged templates only, never string-concatenate. Concept: *SQL injection*.
- **Uploads:** random stored name (never the client filename), MIME allowlist, size cap, check magic bytes if practical, stream downloads after the same scope check, delete the file if the DB insert fails. Concept: *unrestricted file upload*.
- **CSV export:** escape quotes/commas/newlines and prefix `= + - @` cells. Concept: *CSV/formula injection*.
- **Secrets:** `JWT_SECRET` at least 16 chars (aim for 32+ random); never log tokens, passwords or connection strings.

## API docs (Swagger)
- Swagger UI at `/docs`, spec at `/openapi.json`, built in `src/docs/openapi.ts`; disabled in production.
- **Every new or changed endpoint must also be registered/updated in `src/docs/openapi.ts`** (`registry.registerPath`): reuse the Zod schema for the request, list each response code. Response docs are hand-written and do not update themselves.

## Data integrity
- **Money:** `Decimal(12,2)` in the DB, Prisma `Decimal` in code; never JS `number` for amounts. Concept: *floating-point error*.
- **Derived total:** no stored total; compute with SQL aggregate (`_sum`). Concept: *single source of truth / no denormalisation*.
- **Transactions:** every multi-step state change runs in one `prisma.$transaction`, including its `ClaimHistory` row. Concept: *atomicity*.
- **Concurrency:** use a conditional `updateMany({ where: { id, status: PENDING } })` and check `count` for simple state transitions (double-click safe). Use `SELECT ... FOR UPDATE` via `$queryRaw` when a transaction must re-read a row and stop concurrent transactions modifying it before the decision is made. Concepts: *optimistic concurrency*, *pessimistic locking*, *idempotency*.
- **DB-level guards:** CHECK constraints (`amount > 0`, etc.) and triggers that lock approved claims, added by hand in `--create-only` migrations. Concept: *defence in depth: enforce invariants in the service and the database*.
- **Audit:** append-only `ClaimHistory`, written inside the same transaction as the change. Concept: *audit log*.
- **Timestamps:** store and compare in UTC; document inclusive date ranges.

## Performance and indexing
- Index for the queries you actually run: foreign keys used in joins, plus composite indexes for filter+sort combos (see STEPS.md Phase 3 and 15, e.g. `Approval(approverId, status)`, `Claim(status, approvedAt)`). Concept: *composite indexes and column order (equality first, range/sort last)*.
- Prove it with `EXPLAIN ANALYZE` on realistic data volumes, before and after each indexing change; do not add indexes by guesswork (each one slows writes). Concept: *query plans*.
- Paginate every list (`skip/take` + `count`, `pageSize` capped at 100); use **keyset pagination** for large exports. Concept: *offset vs keyset pagination*.
- Avoid N+1: use `include`/`select` deliberately, select only needed columns. Concept: *N+1 queries*.
- Stream big responses (CSV) in batches; never build them in memory.
- Pooled connection (`-pooler`) for the app; direct connection for migrations. Concept: *connection pooling (PgBouncer)*.

## Testing
- Vitest + Supertest against the Neon `test` branch; reset/seed before each test file.
- The two mandatory tests (approver requesting another's claim by ID is refused; total cannot desynchronise from line items) are written as soon as their feature exists; the rest of the checklist is in STEPS.md Phase 17.
- Every route without a token must return 401 (looped over registered routes).

## Code style
- `strict` TypeScript, no `any`; Zod-infer request types. Small functions with a section comment per logical block.
- Error codes are part of the API: add new ones to the table in `README.md`.
