# Expense Claims & Reimbursement POC

Employees submit itemised expense claims with receipts. Claims route through an approval chain based on amount; finance exports approved claims for a period.
This is a **backend-focused learning POC**: data integrity, authorization, transactions, audit history, performance. The backend is the source of truth; the frontend is only a client.

Detailed backend rules live in `backend/CLAUDE.md`. Domain rules (roles, status flow, approval routing, error codes) live in `README.md`.

## Stack
- Backend: Node.js, Express 5, TypeScript (strict), Zod, Prisma 7 with the `pg` driver adapter
- Database: PostgreSQL on Neon (default branch for dev, a `test` branch for tests)
- Auth: JWT issued by the backend, bcrypt password hashing
- Files: Multer on a Docker volume (metadata in Postgres)
- Frontend: Vue 3 (Vite, TS, Pinia). Deliberately minimal; the backend is the learning goal
- Containers: Docker Compose for frontend and backend (no database container; Neon is hosted)

## Layout
```
backend/    Express API, Prisma schema + migrations, tests, .env files
frontend/   Vue 3 app
docker-compose.yml
STEPS.md    Local build plan (gitignored personal notes). Follow its phase order
```

## How we work (read this first)
- The user is **learning** and writes most code themselves. By default explain, review and suggest; write code when asked.
- **Name the concept** behind any non-trivial choice in one short line (e.g. "Concept: optimistic concurrency via conditional `updateMany`") so the user can look it up.
- Prefer the **industry best practice** over the quick option, and say briefly why.
- **Verify version-specific advice** (Prisma 7, Express 5, Zod 4, Vue 3) against the docs or by running it. The user cannot tell outdated advice from current advice, so do not answer from memory when unsure; say so.
- Add **section/purpose comments** to all code: a short comment for each logical block saying what it does and why.
- Follow the phase order in `STEPS.md`; one phase per commit.
- Where `STEPS.md` or `README.md` disagree with this file or the code (for example `DIRECT_URL`, `directUrl` in the schema), the code and `backend/CLAUDE.md` win. Point out the stale doc.

## Git and safety
- Commit only when asked. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), one logical change each.
- **Never read, print, edit or commit** `backend/.env` or `backend/.env.test`; they hold Neon credentials. Update `backend/.env.example` (names only, no values) whenever a variable is added.
- **Ask before** running migrations, destructive commands (`rm -rf`, `git reset --hard`, dropping data), or anything that writes to the Neon default branch. Run experiments against the `test` branch.
- Keep one root `.gitignore`. Do not add per-folder ones.
- Do not install Neon or Prisma agent skills; they are not needed here.
