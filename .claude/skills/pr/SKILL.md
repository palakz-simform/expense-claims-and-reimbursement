---
name: pr
description: Raise a pull request from the current branch into dev with a clear title and description. Never merges. Use only when the user asks to raise or open a PR.
disable-model-invocation: true
---

Open a PR from the current branch into `dev`. **Never merge it, never enable auto-merge, never approve it.**

1. **Check the branch.** Run `git branch --show-current`. If it is `dev` or `main`, stop and tell the user. Run `git status --short`; if there are uncommitted changes, stop and ask whether to commit them first (`/commit`).
2. **Read what the PR contains:** `git log dev..HEAD --oneline` and `git diff dev...HEAD --stat`. Read the key changed files if the commits alone do not explain the change. Do not guess from branch names.
3. **Check for an existing PR:** `gh pr list --head <branch> --base dev`. If one is open, show its link and stop instead of creating a duplicate.
4. **Push** only after telling the user the branch name and that this publishes it: `git push -u origin <branch>`.
5. **Write the title:** conventional-commit style, under 72 characters, describing the whole PR (for example `feat: add JWT auth, role guard and rate limiting`).
6. **Write the description** in this shape, short and factual:
   ```
   ## What
   - bullet per meaningful change (files, endpoints, migrations)

   ## Why
   One or two sentences on the reason or the rule it enforces.

   ## Testing
   - what was run and the result (be honest if something was not tested)

   ## Notes
   - anything a reviewer must know: migrations to apply, new env variable names (no values), follow-ups

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```
   Never include secrets, connection strings or `.env` contents. Mention new env variable names and migrations explicitly.
7. **Create it:** `gh pr create --base dev --head <branch> --title "<title>" --body "<description>"` (use a heredoc for the body).
8. **Report** the PR URL, the title, and a reminder that it is open and unmerged. Next step for the user: review and merge on GitHub, then create the next phase branch from `dev`.
