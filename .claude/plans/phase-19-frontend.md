# Phase 19: Vue 3 frontend

## Context
The backend is finished, deployed on Render (https://expense-claims-and-reimbursement.onrender.com) and tested. Phase 19 adds a small Vue 3 client.

**Pages**
- Login
- Claimant: my claims, the claim editor (line items and receipts), and the claim detail with its history
- Approver: the approval queue, where each claim is approved or rejected
- Finance: all claims, plus the CSV export

**How we work**
- Claude writes the code and explains each file and how the pieces fit together. The user reviews and says "commit" when ready.
- Everything happens on branch `feat/frontend`, with one conventional commit per sub-phase.
- Open a PR into `dev` after F4, and again at the end.
- Update the status column below as each sub-phase finishes.

## Rules for every sub-phase

**Libraries**
- Only Tailwind, axios and Heroicons.
- Before adding any other library, ask once and say what it's for.

**Code style**
- Purpose comments are short, one line each.
- Follow Prettier: no semicolons, single quotes.
- Give intermediate values names instead of chaining calls.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is on).

**Check before building**
- Check the Pinia 4 and Vue Router 5 APIs against the installed types or the docs.
- Confirm each endpoint in `backend/src/modules/*` before building its page.

**Money**
- Keep the API's string as it is (`"125.50"`).
- Format it with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
- Never add up amounts on the client. The total always comes from the API.

**Errors**
- Show the backend's `{ error: { code, message } }`.
- Decide what to do based on `code`, never on the message text.
- Hidden buttons are only a convenience. The backend enforces every rule.

**Done check**
1. `npm run type-check`, `npm run lint`, `npx prettier --check src`
2. `npm run build`
3. Check it in the browser with a seed user.

## Sub-phases

| # | Status | Commit |
|---|---|---|
| F1 | DONE (`b603e70`) | `chore: scaffold Vue 3 frontend with Tailwind` |
| F2 | Written, awaiting commit | `feat: add axios API client with JWT interceptor` |
| F3 | Next | `feat: add login page, auth store and app layout` |
| F4 | | `feat: add role-based route guards` |
| F5 | | `feat: add shared UI components and formatters` |
| F6 | | `feat: add claimant claim list and create claim` |
| F7 | | `feat: add claim editor with line items and receipts` |
| F8 | | `feat: add claim detail page with status and history` |
| F9 | | `feat: add approver queue and approve/reject` |
| F10 | | `feat: add finance claims table and CSV export` |
| F11 | | `chore: add frontend Dockerfile and compose service` |
| F12 | | `chore: deploy frontend as Render static site` |
| F13 | | `docs: document frontend setup and deployment` |

### What each sub-phase contains

**F1: scaffold**
- create-vue 3.24 with TypeScript, Router, Pinia, ESLint + Oxlint, and Prettier.
- Tailwind 4 through `@tailwindcss/vite` (a devDependency), plus axios and Heroicons.
- `frontend/.env.example` with `VITE_API_URL`.
- The scaffold's own `.gitignore` merged into the root one.

**F2: API client**
- `env.d.ts`: the `ImportMetaEnv` type.
- `src/api/token.ts`: keeps the token in sessionStorage.
- `src/api/errors.ts`: the `ApiError` class (`status`, `code`, `requestId`, `details`).
- `src/api/http.ts`:
  - one axios instance with a 60s timeout
  - a Bearer token on every request
  - every failure turned into an `ApiError` (`NETWORK_ERROR` when nothing comes back)
  - on a 401: `clearToken` and `onUnauthorized`, except for `/auth/login`

**F3: login and layout**
- `src/types/api.ts`: `User`, `Role`, `ClaimStatus`, `ApprovalStatus`, `Category`, `Paginated<T>`.
- `src/stores/auth.ts`, a Pinia setup store:
  - `user` and `isAuthenticated`
  - `login()`, which stores the token
  - `logout()`
  - `loadMe()` via `GET /auth/me`
  - `hasRole()`
- `LoginView.vue`: a centred card that shows errors from `ApiError`.
- `AppLayout.vue`: navbar with links for the user's role, the user's name and role, and logout.
- `App.vue` becomes `<RouterView />`.

**F4: route guards**
- Each route has `meta: { public?, roles? }`.
- `router.beforeEach`:
  - restores the session once, via `loadMe`
  - sends a logged-out user to `/login?redirect=`
  - sends a user with the wrong role to their own home page: claimant → `/claims`, approver → `/approvals`, finance → `/finance`
- A 404 page.
- `main.ts` calls `setUnauthorizedHandler(() => router.push({ name: 'login' }))`.

**F5: shared pieces**
- Components: `BaseButton`, `StatusBadge`, `PaginationBar`, `EmptyState`, `ErrorAlert`, `PageHeader`.
- `src/utils/format.ts`: money, and dates in UTC.
- A blob-download helper that takes the filename from `Content-Disposition`.

**F6: claimant list**
- `src/api/claims.ts`.
- "My claims": paginated, with a status filter.
- "New claim": `POST /claims` with a title, then open the editor.

**F7: claim editor**
- Line items on `/claims/:id/line-items[/:itemId]`: add (POST), edit (PATCH), delete (DELETE).
  - Fields: date (no later than today), category, amount, description.
- Receipts per item:
  - upload as multipart field `file`: PDF, PNG or JPEG, up to 5 MB, at most 5 per item
  - download as a blob
  - delete
- The total comes from the API.
- Submit, resubmit, delete a draft, edit the title.
- Field errors come from `details`. Show `CLAIM_LOCKED`, `NO_LINE_ITEMS` and the other codes next to the action.

**F8: claim detail (all roles)**
- Line items and their receipts.
- The approval chain (`approvals`) and `lastRejection`.
- The history timeline from `GET /claims/:id/history`.

**F9: approver**
- The queue: `GET /approvals`, paginated.
- Approve: `POST /approvals/:id/approve`.
- Reject: a modal with a required reason of 1–500 characters (`POST /approvals/:id/reject`).
- Buttons are disabled while a request is running.
- Explain `APPROVAL_NOT_PENDING` clearly.

**F10: finance**
- A table of all claims: `GET /claims` with `status`, `from`, `to` and pagination.
- The export form: `GET /finance/export?from&to`, filtered on `approvedAt`, downloaded as a CSV blob.

**F11: Docker**
- `frontend/Dockerfile`: build with Vite, serve with nginx, with an SPA fallback.
- A compose service that passes `VITE_API_URL` as a build argument.

**F12: deploy**
- A Render Static Site:
  - root `frontend`
  - build `npm ci && npm run build`
  - publish `dist`
  - rewrite `/*` → `/index.html`
  - `VITE_API_URL` set
- Set the backend's `CORS_ORIGIN` to the site's URL.
- Optionally, a `render.yaml`.

**F13: docs**
- A frontend section in the README.
- `frontend-checks.md` for `/review-pr`.
- Mark Phase 19 as done in STEPS.md.

## API facts from the backend

**Lists**
- Shape: `{ data, pagination: { page, pageSize, totalItems, totalPages } }`.
- `pageSize` is at most 100.

**Login**
- Login returns `{ token, user: { id, email, name, role, approvalLevel } }`.
- `/auth/me` returns `{ user }`.

**Errors**
- Shape: `{ error: { code, message, details?, requestId } }`.
- `details` is `[{ in, path, message }]`, and only comes with a 400.
- The rate limit answers with 429 `RATE_LIMITED`.

**Downloads**
- Receipts (`GET /receipts/:id`) and the CSV both need the Bearer header.
- So fetch them as blobs. A plain `<a href>` link won't work.

**Seed users** (all `@example.com`)
- Claimants: asha, bilal
- Level 1 approvers: ravi, sana
- Level 2 approvers: meera, kabir
- Finance: farah
- A total of ₹10,000 or more needs both levels.

## Verification (end to end)

**Local setup**
- Backend on port 4000, frontend on port 5173.
- `frontend/.env` contains `VITE_API_URL=http://localhost:4000`.

**Main flow**
1. A claimant creates a claim, adds line items and a receipt, and submits it.
2. Level 1 approves (and level 2 when needed), or rejects.
3. The claimant sees the history and resubmits.
4. Finance exports the CSV.

**Negative checks**
- Opening a URL for another role redirects.
- An expired token logs you out.
- With the backend stopped, you see `NETWORK_ERROR`.

**Production**
- Logging in works with no CORS errors.
- A deep link survives a page refresh.
