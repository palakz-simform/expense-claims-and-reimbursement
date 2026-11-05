# Expense Claims & Reimbursement (POC)

Employees submit itemised expense claims with receipts. Claims route through an approval chain based on amount, and finance exports approved claims for a period.

The focus is backend correctness: data integrity, authorization, approval workflow, transactions and audit history. The backend is the source of truth; the frontend is only a client.

**Live:** app https://expense-claims-and-reimbursement-fe.onrender.com · API https://expense-claims-and-reimbursement.onrender.com (free tier: the first request after 15 idle minutes takes about a minute).

## Stack

- Frontend: Vue 3 (Vite, TypeScript, Pinia, Vue Router), Tailwind CSS, axios, Heroicons
- Backend: Node.js 24, Express 5, TypeScript (strict), Zod 4 validation
- ORM / DB: Prisma 7 with the `pg` driver adapter, PostgreSQL (hosted on Neon)
- Auth: JWT issued by the Express backend, bcrypt password hashing
- Files: Multer, then a private S3-compatible bucket, Neon Object Storage (metadata in PostgreSQL)
- Containers: Docker + Docker Compose (frontend and backend; no database container)

## Roles

| Role | Can do |
|---|---|
| CLAIMANT | Create, edit, submit and resubmit own claims; upload and delete receipts; view own claims |
| APPROVER | View claims they have a step on and download their receipts; approve or reject with a reason |
| FINANCE | View all claims and download receipts (read-only); export approved claims for a period |

Each user has one role. Approvers also have an `approvalLevel` (1 or 2).

### Seeded logins

There is no registration; users come from `backend/prisma/seed.ts`. All share one password, taken from `SEED_PASSWORD` at seed time (never committed).

| Email | Role | Approves |
|---|---|---|
| `asha.claimant@example.com` | CLAIMANT | |
| `bilal.claimant@example.com` | CLAIMANT | |
| `ravi.l1@example.com` | APPROVER, level 1 | Asha |
| `sana.l1@example.com` | APPROVER, level 1 | Bilal |
| `meera.l2@example.com` | APPROVER, level 2 | Asha |
| `kabir.l2@example.com` | APPROVER, level 2 | Bilal |
| `farah.finance@example.com` | FINANCE | |

The two claimants have different approvers at every level, so an approver can be shown not to see the other claimant's claims. A claim under ₹10,000 needs level 1 only; ₹10,000 or more needs level 1 and then level 2.

## Key design decisions

- **Claim total is derived.** There is no stored total; it is `SUM(lineItem.amount)`, so it cannot drift from the line items. Amounts use `Decimal(12,2)`. In the API, money (`amount`, `total`) is a **string with 2 decimals** (for example `"125.50"`), never a JSON number, and clients cannot send a `total` (unknown fields are rejected with 400).
- **Receipts are attached per line item, not per claim** (the brief allows either; this is our documented choice). A line item can have zero or more receipts; a receipt is optional and is not required to submit. Why per line item: each receipt proves one specific expense, so approvers and finance can trace an amount to its evidence, and the approved-claim lock triggers apply at the same level as the amounts they protect.
- **Receipt rules.** `POST /line-items/:id/receipts` takes one file (PDF, PNG or JPEG, at most 5 MB) in the multipart field `file`; a line item holds at most 5 receipts (`422 RECEIPT_LIMIT_REACHED`). The client's Content-Type is not trusted: the file's first bytes are checked too (`415 UNSUPPORTED_FILE_TYPE`), and a file over the limit is `413 FILE_TOO_LARGE`. The file is saved under a random name (never the client's file name, so no path traversal) in the bucket, and the API never returns the stored name or path; the original name is kept only to show and to name the download. Receipts can be added or deleted while the claim is a draft, awaiting approval or rejected (approved is `409 CLAIM_LOCKED`, with a database trigger as backstop), by the claimant who owns the item, with the claim row locked so the 5-receipt cap holds under concurrent uploads. A receipt does not change the total, so it never resets the approval chain, and approvals already given stay valid. On a submitted claim every add and remove is recorded in `ClaimHistory` (`RECEIPT_ADDED`, `RECEIPT_REMOVED`); a draft has no history. `GET /receipts/:id` streams the file to the claimant, approvers and finance within the same claim scope as `GET /claims/:id` (out of scope is `404`), as a private attachment. Deleting a line item or a draft deletes its receipts: the rows go in the same transaction and the files are removed only after it commits, so a failed delete never loses a file. A receipt whose file is missing from the storage downloads as `404`. **Where files live:** a private S3-compatible bucket (Neon Object Storage) in every environment, with a separate bucket and credential for dev, test and production. There is no local-disk option: hosts like Render wipe local disks, and one code path everywhere means dev and tests exercise what production runs. The services only see the `ReceiptStorage` interface (`lib/storage/`), so the bucket provider can change without touching them. The bucket is never public: files are only reachable through `GET /receipts/:id`, after the claim-scope check. Every upload lands in a temp folder first for the type and size checks, is then uploaded to the bucket, and the temp copy is always removed. Receipts are listed on each line item of a claim response (`receipts`).
- **Finance export.** `GET /finance/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (finance only) downloads a CSV of approved claims. **The period is the final approval date (`approvedAt`), both days included, in UTC**; `from` and `to` are both required (so a forgotten `to` cannot export everything), and `from` later than `to` or a bad date is `400`. Only `APPROVED` claims are exported, never drafts, pending or rejected ones. One row per claim, oldest approval first: `claimNumber, claimId, title, claimantName, claimantEmail, submittedAt, approvedAt` (UTC ISO), `total` (the database `SUM` of the line items, 2 decimals) and `lineItemCount`. It never loads the period into memory: claims are read in batches of 1000 with keyset pagination (`WHERE (approvedAt, id) > cursor ORDER BY approvedAt, id LIMIT 1000`, served by the `Claim(status, approvedAt)` index), each batch picks its claims first and sums only those, and the rows are streamed to the client with backpressure (a slow client slows the reading, a client that leaves stops it). The CSV is encoded by `csv-stringify`: cells with commas, quotes or line breaks are quoted, a text cell starting with `=`, `+`, `-` or `@` gets a leading `'` so a spreadsheet cannot run it as a formula (CSV injection), and the file has a UTF-8 BOM and CRLF line ends so Excel opens it correctly. A failure after the download has started cuts the connection, so a short file is never mistaken for a complete one. Finance has read access only: every approve, reject, edit, submit and receipt route answers `403` to it.
- **Status flow:** `DRAFT -> PENDING_APPROVAL -> APPROVED`, or `PENDING_APPROVAL -> REJECTED -> (edit, resubmit) -> PENDING_APPROVAL`. `APPROVED` is terminal and read-only.
- **Approval routing (N levels):** the number of required levels comes from an ordered list of amount tiers in `lib/approvalPolicy.ts` (currently: from ₹0 level 1; from ₹10,000 levels 1 and 2). Each claimant has a fixed approver per level in `ApproverAssignment` (one row per claimant and level, set up by the seed because there is no admin UI). On submit, the chain is built by looping over `1..requiredLevels` and copying the claimant's assigned approver for each level onto an `Approval` row, so assignment changes later never affect claims already in flight. Adding a level 3 means one new tier in the policy plus assignment rows, with no schema change. If a claimant has no approver at a required level, submit fails with `422 NO_APPROVER_AVAILABLE`.
- **Amount change during approval:** a claim awaiting approval can still be edited (line items or title). If an edit changes the **total**, every decision so far is void: the live approval rows (waiting, pending and already approved) become `INVALIDATED`, `chainVersion` goes up by one, and a new chain is built from level 1 for the new total. The approvers stay the same, because they come from the claimant's fixed assignments, so if Alice approved and Bob was pending, both are reset and Alice is asked again. The number of levels can change if the total crosses a tier (for example ₹9,000 to ₹12,000 adds level 2). An edit that leaves the total unchanged (a description, date, category or title change) does not reset anything, and neither does an edit to a draft or a rejected claim (a rejected claim has no live chain; resubmit builds a new one). Old approval rows are kept for audit, and every edit to a submitted claim is recorded in `ClaimHistory` (`CLAIM_UPDATED`, plus `APPROVAL_CHAIN_RESET` when the chain is rebuilt). A claim awaiting approval must keep at least one line item (`422 NO_LINE_ITEMS`); a draft or rejected claim may be emptied but cannot be submitted again until it has an item. An approved claim cannot be edited at all.
- **Approving and rejecting:** an approver decides only their own step, and only while it is `PENDING` on the live chain (`GET /approvals` is the queue). Approve moves the next level to `PENDING`, or approves the claim when it was the last level. Reject needs a reason (`400` without one): the claim becomes `REJECTED`, earlier approvals stay, and the open steps become `INVALIDATED`. The claim row is locked before deciding, so a decision and a claimant edit never interleave, and a decision on a step voided by an edit is refused (`409 APPROVAL_NOT_PENDING`). Each decision writes `APPROVAL_GRANTED` or `CLAIM_REJECTED` (and `CLAIM_APPROVED` for the last level) in the same transaction.
- **Rejection and resubmission:** a rejected claim goes back to the claimant with the reason (`lastRejection` on `GET /claims/:id`: reason, level, time and who rejected it). It stays editable but has no live chain, so edits never reset anything. `POST /claims/:id/resubmit` (only for a `REJECTED` claim, with at least one line item) starts a **new chain from level 1 with the same approvers** (one `chainVersion` higher) and moves the claim to `PENDING_APPROVAL`. Nothing is lost: the earlier approval rows, the rejection and its reason, the history and the original `submittedAt` all stay, and the resubmit is recorded as `CLAIM_RESUBMITTED`. `lastRejection` is kept after a resubmit and replaced if the claim is rejected again. Approvers come from the claimant's fixed assignments, so reassigning an approver between a rejection and the resubmit is out of scope for this POC.
- **Approved claims are locked, in two layers** (defence in depth):
  - **Service:** every edit (title, line items, receipts) and every delete, submit or resubmit first locks the claim row with `SELECT ... FOR UPDATE` (`lib/claimLock.ts`) and answers `409 CLAIM_LOCKED` if it is `APPROVED`. The row lock also stops an approval from committing halfway through an edit.
  - **Database:** `BEFORE` triggers on `LineItem` and `Receipt` refuse any insert, update or delete under an approved claim, and a trigger on `Claim` refuses updating or deleting an approved claim row (so it cannot be reopened, for example by setting the status back to `DRAFT`). The triggers read the claim with `FOR SHARE`, so a concurrent approval waits for the edit instead of slipping in between the check and the write. They hold even for code that skips the service or SQL run by hand; their error is mapped to the same `409 CLAIM_LOCKED`. Migrations: `claim_lock_triggers` and `claim_lock_hardening`.
- **Audit trail.** Every change to a submitted claim writes a `ClaimHistory` row in the same transaction as the change, so the row and the change are saved or rolled back together, and a refused change leaves no row. All writes go through one helper, `recordHistory(tx, ...)` in `lib/recordHistory.ts`, which the compiler only lets you call with a transaction client; nothing else writes to the table. Actions: `CLAIM_CREATED`, `CLAIM_SUBMITTED`, `CLAIM_RESUBMITTED`, `CLAIM_UPDATED` (with the old and new total), `APPROVAL_CHAIN_RESET`, `APPROVAL_GRANTED`, `CLAIM_APPROVED`, `CLAIM_REJECTED` (with the reason), `RECEIPT_ADDED` and `RECEIPT_REMOVED`. The only exceptions: edits to a draft (it was never submitted) and deleting a draft (its history goes with it; the deletion is only logged). `GET /claims/:id/history?page=&pageSize=` returns the trail oldest first, paginated, to anyone who may see the claim (same scope as `GET /claims/:id`; otherwise `404`), with the actor as a name and role only, never the email. `GET /claims/:id` also shows `approvals`: the live approval chain, one entry per level with its status, the approver's name and the decision time, so you can see who is holding the claim now. Chains voided by an edit or a rejection are not shown there; the full story, including earlier rounds, is in the history.
- **Visibility is enforced in queries.** `claimScopeFor(user)` (one function in `lib/claimScope.ts`) returns the `where` for every claim read, so an out-of-scope claim is simply not found (`404`, never 403, so its existence is not revealed). A claimant sees their own claims; an approver sees claims where they have a `PENDING`, `APPROVED` or `REJECTED` step, that is, their turn now or a decision they made (a `WAITING` step stays hidden until their turn comes, and an `INVALIDATED` step does not count, so a step voided before its turn never reveals the claim); finance sees all claims. Reads (`GET /claims`, `GET /claims/:id`) are open to all three roles within that scope; every write stays claimant-only. `GET /approvals` is the approver's to-do list (only steps they can decide now), while `GET /claims` is the read-only view of every claim they are involved in.
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

## Error codes

| Case | Response |
|---|---|
| Body is not valid JSON | 400 `INVALID_JSON` |
| Invalid input (body, query or params; unknown fields included) | 400 `VALIDATION_ERROR` with `details` |
| Wrong email or password on login | 401 `INVALID_CREDENTIALS` |
| No token, or an invalid or expired one | 401 `UNAUTHENTICATED` |
| Role not allowed on this route (e.g. finance approving, a claimant exporting) | 403 `FORBIDDEN` |
| Unknown route | 404 `NOT_FOUND` |
| Too many requests (300 a minute per client; 10 failed logins per 15 minutes) | 429 `RATE_LIMITED` |
| Unexpected server error (details only in the log) | 500 `INTERNAL_ERROR` |
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
| Uploading a 6th receipt to a line item | 422 `RECEIPT_LIMIT_REACHED` |
| Receipt over 5 MB | 413 `FILE_TOO_LARGE` |
| Receipt that is not a PDF, PNG or JPEG (by Content-Type or by content) | 415 `UNSUPPORTED_FILE_TYPE` |
| Receipt upload with no file, a wrong field name or several files | 400 `VALIDATION_ERROR` |
| Finance export without `from` or `to`, with `from` after `to`, a bad date or an unknown query field | 400 `VALIDATION_ERROR` |
| Finance export by anyone but finance | 403 `FORBIDDEN` |
| Claimant has no approver at a required level | 422 `NO_APPROVER_AVAILABLE` |

## Project layout

```
backend/    Express API, Prisma schema and migrations, seed, tests, Postman collection
frontend/   Vue 3 app
docker-compose.yml
.github/workflows/ci.yml   CI (type-check and tests on pull requests)
```

## Setup

Needs Node 24, Docker (optional) and a Neon project with `dev` and `test` branches and a storage bucket for each.

1. Copy `backend/.env.example` to `backend/.env` and fill in the values (Neon `DATABASE_URL` (direct) and `DATABASE_URL_POOLED`, `JWT_SECRET`, etc.). Write values without quotes: `docker run --env-file` keeps quotes as part of the value. Receipts need a bucket in every environment: `S3_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are required, and the API refuses to start without them. Use a separate bucket and credential for dev, test and production, each with the `storage:read` and `storage:write` scopes in Neon (read alone or write alone is not enough). Scripts and tests run with `NODE_ENV=test` read `.env.test` instead (the Neon `test` branch).
2. For running the frontend outside Docker: copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL=http://localhost:4000` (no quotes, no trailing slash). Docker does not need this file.
3. Either `docker compose up --build` (see "Run with Docker" below), or run the backend directly:

   ```
   cd backend
   npm install
   npx prisma generate          # the client is generated into src/generated, not committed
   npx prisma migrate deploy    # creates the tables on the branch in backend/.env
   npx prisma db seed           # the demo users (once; refuses to run in production)
   npm run dev                  # http://localhost:4000
   ```

   With the API running outside production, the interactive API reference is at http://localhost:4000/docs (Swagger UI; the spec is `/openapi.json`). It is turned off in production.

## Run with Docker

Two services. The backend image is built from `backend/Dockerfile` (multi-stage, runs as the unprivileged `node` user); the frontend image from `frontend/Dockerfile` (Vite build, then unprivileged nginx serving the static files). The database is Neon, so there is no database container.

```
docker compose up --build                       # web on http://localhost:8080, API on http://localhost:4000
API_PORT=4001 VITE_API_URL=http://localhost:4001 docker compose up --build   # API on another host port
WEB_PORT=8081 docker compose up --build         # web on another host port if 8080 is taken
```

- On every start the container runs `prisma migrate deploy` (applies only migrations not yet applied, never seeds) and then starts the API. A failed migration stops the start.
- **First run on an empty database:** the container creates the tables, but users come from the seed, which is not run by the container. Run `npx prisma db seed` from `backend/` once (dev/test branches only; it refuses to run in production).
- Settings come from `backend/.env` at run time and are never baked into the image (`.dockerignore` keeps `.env*` out of the build).
- The container reports `healthy` in `docker compose ps` once `/health` answers.
- Receipts go to the bucket in `backend/.env`, so the containers keep no state: `docker compose down` loses nothing.
- **Frontend:** `VITE_API_URL` is the URL the *browser* uses to reach the API. Vite writes it into the JS bundle at build time, so it is a build argument (default `http://localhost:4000`) and a change needs `--build`; the build fails if it is empty.
- The compose backend runs with `NODE_ENV=production`, so CORS allows only `CORS_ORIGIN`. Compose sets it to `http://localhost:${WEB_PORT}` for this local stack (overriding `backend/.env`), so the web container can call the API.
- nginx serves `index.html` for any unknown path (SPA fallback, so a refresh on `/claims/123` works), caches the hashed `/assets/*` files for a year and `index.html` never, and adds `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy`. The frontend container is `healthy` once nginx serves `index.html`.

## Frontend

A deliberately small Vue 3 client; every rule lives in the API.

```
cd frontend
npm install
npm run dev          # http://localhost:5173 (needs frontend/.env and the API on :4000)
npm run type-check   # vue-tsc
npm run lint         # oxlint + eslint
npm run build        # type-check + production build into dist/
```

| Role | Pages |
|---|---|
| CLAIMANT | My claims (status tabs), claim editor (line items, receipts, submit / resubmit, delete draft), claim detail |
| APPROVER | Approval queue (approve, reject with reason), Reviewed (every claim that reached them), claim detail |
| FINANCE | Approved claims (status and submitted-date filters), CSV export by approval date, claim detail |

- **Layout:** `src/api/` (one axios instance and one module per resource), `src/stores/auth.ts` (Pinia), `src/router/` (routes and the role guard), `src/views/` per role, `src/components/` (shared UI), `src/utils/` (money and date formatting, downloads), `src/types/api.ts` (response shapes).
- **Auth:** the JWT from `POST /auth/login` is kept in `sessionStorage` (gone when the tab closes) and sent as `Authorization: Bearer` by an axios interceptor. On page load the session is restored once with `GET /auth/me`. Any `401` (except on login) clears the token and returns to the login page with "session expired".
- **The UI is a convenience, not security.** Route guards and hidden buttons only keep users away from pages they cannot use. Editing the role in the browser, changing the token or calling the API directly is still refused by the backend (`401`, `403`, or `404` for claims outside the user's scope).
- **Errors:** every failure becomes an `ApiError` with the backend's `code`, `message` and `requestId` (shown as "Reference" so a log line can be found). The UI decides on `code`, never on message text. `400 VALIDATION_ERROR` details are shown under the matching form field. No response at all is `NETWORK_ERROR`.
- **Money and totals:** amounts stay the API's decimal strings (`"125.50"`) and are only formatted (`Intl`, INR). The claim total shown is always the one the API returned; the client never adds amounts up.
- **Dates:** calendar dates (`YYYY-MM-DD`) are formatted in UTC so they never shift a day in a browser west of UTC.
- **Filters live in the URL** (`?status=&page=&from=&to=`), so refresh, back and shared links keep them. A slower older response never overwrites a newer one.
- **Downloads** (receipts, the CSV) need the Bearer header, so they are fetched as blobs and saved through a temporary object URL. The file name comes from the client because CORS hides `Content-Disposition`.

## Running tests

Vitest + Supertest against the Neon `test` branch (never dev or production). Needs Node 20+ (Node 24 is used in CI and Docker) and a `backend/.env.test` with the test branch settings and the test bucket.

```
cd backend
npm test
```

- `NODE_ENV=test` is set by the Vitest config, so `.env.test` is read instead of `.env`.
- A guard in `tests/globalSetup.ts` refuses to run unless the database looks like the test branch, so a wrong connection string fails before any test touches data.
- Every query is a round trip to Neon: about 6 minutes from a laptop, about 1 minute in CI.

## CI and deployment

```
pull request into dev/main --> GitHub Actions: npm ci, prisma generate, tsc --noEmit, npm test
merge into main            --> Render builds backend/Dockerfile and deploys it
                               Render builds frontend/ as a static site and deploys it
container start            --> prisma migrate deploy, then the API
```

- **CI** (`.github/workflows/ci.yml`) runs on every pull request into `dev` or `main`. The tests use the Neon `test` branch and the test bucket through the repository secrets `TEST_DATABASE_URL_POOLED`, `TEST_JWT_SECRET`, `TEST_SEED_PASSWORD`, `TEST_AWS_ENDPOINT_URL_S3`, `TEST_AWS_REGION`, `TEST_AWS_ACCESS_KEY_ID`, `TEST_AWS_SECRET_ACCESS_KEY` and `TEST_S3_BUCKET`.
- **Hosting:** Render web service (free tier) built from `backend/Dockerfile`, root directory `backend`, branch `main`, health check `/health`. Live API: https://expense-claims-and-reimbursement.onrender.com
- **Production settings** are entered in Render's environment settings, never in a file: `DATABASE_URL`, `DATABASE_URL_POOLED`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, and `CORS_ORIGIN` once the frontend has a URL. `NODE_ENV=production` is set in the image and Render sets `PORT`.
- **Databases:** separate Neon branches per environment. `production` (the default branch) for the live app, `dev` for local work, `test` for the tests. The production bucket is private and has its own credential.
- **Migrations** run on every container start (`prisma migrate deploy`), so a merged migration reaches production with the next deploy.
- **Free tier caveat:** the service sleeps after 15 minutes without traffic; the first request after that takes about a minute.
- **Frontend hosting:** Render Static Site (CDN, no server and no nginx), set up in the dashboard:

  | Setting | Value |
  |---|---|
  | Branch / root directory | `main` / `frontend` |
  | Build command | `npm ci && npm run build` |
  | Publish directory | `dist` |
  | Environment | `VITE_API_URL` = the API URL, no trailing slash (not a secret: it ends up in the bundle) |
  | Redirects/Rewrites | `/*` to `/index.html`, action **Rewrite** (SPA fallback; real files such as `/assets/*` are served first) |
  | Headers | `/*`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; `/assets/*`: `Cache-Control: public, max-age=31536000, immutable` |

  Then set the backend's `CORS_ORIGIN` to the site's exact URL (no trailing slash); saving it redeploys the API. Check: log in, refresh on a claim page (the rewrite), and no CORS errors in the browser console.

### One-time production seed

The container never seeds. The demo users are added once from a laptop, writing straight to the production branch. The seed refuses to run with `NODE_ENV=production`, and on a laptop `NODE_ENV` is not set, so the database it writes to is decided only by the connection string given. Run from `backend/`, **one line at a time** (pasting several lines at once feeds the later lines into the hidden prompts):

```
read -rs -p "PRODUCTION pooled URL: " DATABASE_URL_POOLED; echo
read -rs -p "Seed password: " SEED_PASSWORD; echo
export DATABASE_URL_POOLED SEED_PASSWORD JWT_SECRET="seed-only-not-used-by-the-seed-1234"
npx tsx prisma/seed.ts
unset DATABASE_URL_POOLED SEED_PASSWORD JWT_SECRET
```

The seed upserts by email, so running it again changes nothing. `JWT_SECRET` is only there because the settings are validated on import; the seed does not use it. The same goes for the S3 settings, which are read from `backend/.env` when not exported (values in the shell always win).

### Postman

The collection in `backend/postman/` has two environments: `Expense Claims - local` (`http://localhost:4000`) and `Expense Claims - production` (the Render URL). Set `password` in the environment you use; it is never committed. `baseUrl` must not end with `/`: `//auth/login` does not match the public login route and returns 401 `UNAUTHENTICATED`.

## Out of scope

Registration, password reset, email verification, OCR, organisational hierarchy, realtime notifications.
