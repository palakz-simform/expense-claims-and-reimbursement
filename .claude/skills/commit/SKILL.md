---
name: commit
description: Commit the current changes following this project's rules (conventional commit, one logical change, never secrets). Use only when the user asks to commit.
disable-model-invocation: true
---

Commit the current work. Follow these steps in order.

1. Run `git status --short` and `git diff --stat`. Show the user what will be committed.
2. **Never stage** `backend/.env`, `backend/.env.test`, `STEPS.md`, `POC.md` or anything under `uploads/` or `src/generated/`. If one appears as changed or untracked, stop and tell the user (they should be gitignored).
3. If the changes mix unrelated work, propose splitting them into separate commits (one logical change each, one phase per commit) and ask which to do first.
4. Stage files by name (`git add <paths>`), never `git add -A` or `git add .`.
5. Write a conventional commit message: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. Subject under 72 characters, imperative mood, then a short body saying what and why if it is not obvious.
6. End the message with the attribution line the session instructions specify.
7. Commit, then show `git log --oneline -1` and `git status --short`.
8. Do not push or merge unless the user asks. Remind them of the next STEPS.md phase branch if the phase is complete.
