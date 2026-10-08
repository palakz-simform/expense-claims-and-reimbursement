---
name: review-pr
description: Review a pull request (or the current branch against dev) for correctness, security, data integrity, project conventions and best practices. Read-only by default; reports findings and teaches the concept behind each. With --fix it also applies the fixes to the working tree. Use when the user hands over a PR to review.
argument-hint: <PR number, PR URL, or branch> [--fix | --fix=all]
disable-model-invocation: true
---

Review `$ARGUMENTS` (if empty, the current branch against `dev`). Report to the user in the terminal.

## Flags
- **No flag (default): read-only.** Do not edit files, commit, push, comment on the PR, approve or merge.
- **`--fix`:** after reporting, apply fixes for the **Blocking** and **Should fix** findings to the **local working tree only** (see section 5). Nothing is pushed: no `git push`, no `gh` call that changes the PR, no updating of the remote branch. The user pushes when they choose.
- **`--fix=all`:** same, and also the **Nice to have** findings.
- Strip the flag from `$ARGUMENTS` before reading the PR number or branch. Whatever the flag, never comment on the PR, approve, merge, push or create a commit.

## 1. Get the diff (works without the GitHub CLI)
- PR number: `git fetch origin pull/<n>/head:review-pr-<n>`, then diff `dev...review-pr-<n>`. With `gh` available, `gh pr view <n>` and `gh pr diff <n>` also work. A PR URL: take the number from it.
- Branch: `git diff dev...<branch>` and `git log dev..<branch> --oneline`.
- Start with `--stat`, then read every changed file in full (not just hunks) plus the files it imports from when behaviour depends on them. Never review from commit messages alone.
- Delete any temporary local review branch you created when finished.

## 2. What to check
Use the rules in `CLAUDE.md`, `backend/CLAUDE.md` and `README.md` as the standard, and the `/endpoint-checklist` items for any route.

- **Correctness:** logic bugs, wrong status codes, unhandled edge cases, race conditions, missing `await`, off-by-one in date ranges (inclusive ranges, UTC).
- **Security:** authentication mounted by default, role and object-level authorization in the query (404 for out of scope), strict Zod validation, no mass assignment, no secrets/tokens/hashes in code, responses or logs, SQL only via Prisma or tagged `$queryRaw`, upload and CSV rules.
- **Data integrity:** transactions with the history row, conditional updates or row locks for state changes, `Decimal` for money, no stored claim total, migrations (never edited after applying, CHECKs/triggers commented, `.env.example` updated for new variables).
- **Performance:** indexes for the queries actually added, pagination and filters, N+1, streaming for exports, selecting only needed columns.
- **Architecture and style:** module layout, thin controllers, services own Prisma and transactions, `AppError` with a code that is in the README error table, TypeScript strict with no `any`, a short purpose comment on each logical block, no dead code or duplicated logic.
- **Tests:** is the new behaviour covered, including the failure paths? Are the two mandatory tests (approver-by-ID isolation, total cannot desync) still in place?
- **Scope and hygiene:** one logical change per PR/commit, conventional commit messages, no unrelated files, no `.env*`, `STEPS.md`, `POC.md` or generated code committed, stale docs (README/STEPS) updated.
- **Version-specific claims** (Prisma 7, Express 5, Zod 4, Vue 3): verify against the installed package types or docs before flagging; say so when unsure instead of answering from memory.

## 3. Verify before you report
- Run `cd backend && npx tsc --noEmit` and, once they exist, lint and tests, when the branch is checked out. Report results honestly, including anything not run.
- Only report an issue you can point to with `file:line` and explain with a concrete failing scenario. Drop style nits that are not project rules.

## 4. Report format
Start with a one-line verdict: **Approve**, **Approve with suggestions**, or **Changes requested**. Then group findings:

- **Blocking** (bug, security hole, integrity risk, broken convention): `file:line`, what is wrong, a concrete scenario, the fix, and one line naming the concept ("Concept: ...") so the user can look it up.
- **Should fix** (maintainability, missing tests, performance): same format.
- **Nice to have**: one line each.
- **Done well**: two or three specific things worth keeping, so the user knows what to repeat.

End with a short summary of what was and was not checked (for example "did not run tests, none exist yet") and the suggested next step. Without `--fix` the user decides what to fix; offer to apply fixes only if asked (they can re-run with `--fix`).

## 5. Applying fixes (only with `--fix` or `--fix=all`)
Always finish sections 1-4 first, so the user sees the full report before any file changes.

- **Be on the PR's branch.** Fixes go into the working tree of the branch under review. If you reviewed a fetched `review-pr-<n>` ref, or the branch is not checked out, or the working tree has unrelated uncommitted changes, stop and tell the user rather than switching branches yourself.
- **Fix only reported findings** in the chosen groups, smallest change that resolves each one, matching the surrounding style and comment density. Do not refactor beyond the finding.
- **Skip and explain** a finding when it needs a decision from the user (design choice, changing an API contract or error code), a database change (write migration SQL only if the finding is exactly that; never run migrate commands or touch `backend/.env*`), or you are not sure the fix is right.
- **Verify:** run `cd backend && npx tsc --noEmit` (and lint/tests once they exist) after the fixes and report the real result; if a fix breaks it, revert that fix and report it as skipped.
- **Local only, never push.** Edit files in the local working tree and stop there. Do not run `git push` (including `--force`), do not create or update a remote branch, and do not touch the PR on GitHub. After the fixes, tell the user the changes exist only on their machine and that pushing is up to them.
- **Leave the changes uncommitted** so the user can review the diff. End with a table: finding, file, fixed or skipped (and why), then `git diff --stat`. Suggest `/commit` as the next step.
