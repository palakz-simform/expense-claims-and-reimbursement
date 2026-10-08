---
name: new-module
description: Scaffold a new backend feature module (routes, controller, service, schemas) in the project's folder structure and wire it into app.ts. Use when adding a feature such as claims, approvals, receipts or finance.
argument-hint: <module-name>
---

Create a feature module named `$ARGUMENTS` (lowercase, singular or plural matching the URL, e.g. `claims`).

## Folder structure (package by feature)
```
backend/src/
  modules/<name>/
    <name>.routes.ts       # URL + middleware wiring only; never touches Prisma
    <name>.controller.ts   # parse/validate input (Zod), call the service, send the response
    <name>.service.ts      # all business rules and transactions; the only layer that uses Prisma
    <name>.schemas.ts      # Zod schemas (.strict()) and inferred input types
  middleware/              # shared: authenticate, requireRole, rateLimit, errorHandler
  lib/                     # shared helpers: AppError, approvalPolicy, claimScopeFor
  db/prisma.ts             # the one shared PrismaClient
  config/env.ts            # the only place that reads process.env
```
Shared by two or more modules goes in `lib/` or `middleware/`; used by one module stays in that module.

## Rules for the files
- Match the style of `modules/auth/` (read it first). Add a short comment per logical block saying what and why.
- Schemas use `.strict()`; never spread `req.body` into Prisma calls.
- Controllers are thin and `async`; Express 5 forwards thrown errors to the error handler, so no try/catch.
- Throw `AppError(status, 'CODE', 'message')`; add any new code to the error table in `README.md`.
- Services take a typed user/input, not `req`/`res`.
- Routes: export one `Router`; add `requireRole(...)` per route as needed.

## Wiring
- Mount the router in `src/app.ts` **below** `app.use(authenticate)` so it is protected by default.
- Run `npx tsc --noEmit` from `backend/` and fix any errors.
