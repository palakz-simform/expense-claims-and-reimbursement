# Frontend checks (`frontend/`)

Standard: `CLAUDE.md` and the "Frontend" section of `README.md`. The backend is the source of truth; the frontend is only a client. Verify Vue 3, Pinia 4 and Vue Router 5 specifics against the installed packages or the docs before flagging.

- **Authorization stays on the server:** route guards (`meta.roles`) and hidden buttons are convenience only. Flag any code that treats them as protection, any rule implemented only in the UI, or a page that would show data the API did not scope to the user.
- **Auth and token:** the token is read and written only through `src/api/token.ts` (`sessionStorage`); requests go through the shared `http` instance (never a bare `axios` or `fetch`), so the Bearer header, the timeout and `ApiError` handling apply. No token, password or response body in `console` logs.
- **Errors:** failures are `ApiError`s; the UI branches on `code`, never on message text. Every request that can fail has a visible error (`ErrorAlert`), `400 VALIDATION_ERROR` details are shown per field (`fieldErrorsOf`), and the backend codes used exist in the README error table.
- **API contract:** URLs, query names, body fields and response shapes match the backend schemas and `src/types/api.ts` (check `backend/src/modules/*` when a type or call changes). No client-side fields the API would reject (`.strict()` schemas).
- **Money and dates:** amounts stay decimal strings and are only formatted (`formatMoney`); totals come from the API, never summed in the client. Calendar dates are formatted in UTC (`formatDate`); no `new Date('YYYY-MM-DD')` shown in local time.
- **Async state:** loading and empty states exist; buttons are disabled while their request is in flight (no double submit); list pages ignore stale responses (`latestRequestId`); filters and paging live in the URL query and invalid query values fall back safely.
- **Security in templates:** no `v-html` with API or user data (XSS); no secrets in `VITE_*` variables (they are public in the bundle); downloads go through `saveBlob`, never a link that would need the token in the URL; redirects after login stay on this site (`safeRedirect`).
- **Vue style:** `<script setup lang="ts">`, typed `defineProps`/`defineEmits`/`defineModel`, `import type` for types (`verbatimModuleSyntax`), no `any`, no interactive element nested in another (button inside a link), labels tied to inputs, one step per line with named variables, a short purpose comment on each logical block, Tailwind classes rather than new CSS files.
- **Dependencies:** a new package needs a stated purpose and the user's approval (project rule); dev-only tools go in `devDependencies`.
- **Docker and deploy:** `VITE_API_URL` stays a build argument; nginx keeps the SPA fallback, the asset caching and the security headers; the README Frontend and deployment sections match the change.

**Verify** (read-only: do not use `npm run lint` or `npm run format`, they rewrite files):
`cd frontend && npm run type-check && npx oxlint . && npx eslint . && npx prettier --check src && npm run build-only`
