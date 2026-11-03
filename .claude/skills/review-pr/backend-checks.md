# Backend checks (`backend/`)

Standard: `CLAUDE.md`, `backend/CLAUDE.md` and `README.md`, plus the `/endpoint-checklist` items for any route.

- **Correctness:** logic bugs, wrong status codes, unhandled edge cases, race conditions, missing `await`, off-by-one in date ranges (inclusive ranges, UTC).
- **Security:** authentication mounted by default, role and object-level authorization in the query (404 for out of scope), strict Zod validation, no mass assignment, no secrets/tokens/hashes in code, responses or logs, SQL only via Prisma or tagged `$queryRaw`, upload and CSV rules.
- **Data integrity:** transactions with the history row, conditional updates or row locks for state changes, `Decimal` for money, no stored claim total, migrations (never edited after applying, CHECKs/triggers commented, `.env.example` updated for new variables).
- **Performance:** indexes for the queries actually added, pagination and filters, N+1, streaming for exports, selecting only needed columns.
- **Architecture and style:** module layout, thin controllers, services own Prisma and transactions, `AppError` with a code that is in the README error table, TypeScript strict with no `any`, a short purpose comment on each logical block, no dead code or duplicated logic.
- **API docs:** every new or changed endpoint is updated in `backend/src/docs/openapi.ts` and in the Postman collection in `backend/postman/`.
- **Tests:** is the new behaviour covered, including the failure paths? Are the two mandatory tests (approver-by-ID isolation, total cannot desync) still in place?

**Verify:** `cd backend && npx tsc --noEmit`, then `npm test` when the change touches behaviour (it runs against the Neon `test` branch and takes minutes; say so if skipped).
