---
name: pr
description: Draft a pull request title and description for the current branch (target dev) and give the GitHub compare link. Does NOT create the PR, merge or approve; the user opens it. Use when the user asks for a PR description.
disable-model-invocation: true
---

Prepare everything the user needs to open a PR from the current branch into `dev`. **The user raises the PR themselves.** Never run `gh pr create` or any other call that creates, edits, comments on, approves or merges a PR, and never enable auto-merge.

1. **Check the branch.** Run `git branch --show-current`. If it is `dev` or `main`, stop and tell the user. Run `git status --short`; if there are uncommitted changes, stop and ask whether to commit them first (`/commit`).
2. **Read what the PR contains:** `git log dev..HEAD --oneline` and `git diff dev...HEAD --stat`. Read the key changed files if the commits alone do not explain the change. Do not guess from branch names.
3. **Check it is pushed:** `git status -sb` and `git branch -r --contains HEAD`. If the branch (or its latest commit) is not on `origin`, tell the user it must be pushed before a PR can be opened, and offer to run `git push -u origin <branch>`. Push only if the user says yes (it publishes the branch).
4. **Write the title:** conventional-commit style, under 72 characters, describing the whole PR (for example `feat: add JWT auth, role guard and rate limiting`).
5. **Write the description** in this shape, short and factual:
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
6. **Build the compare link** from `git remote get-url origin` (strip `.git`): `https://github.com/<owner>/<repo>/compare/dev...<branch>?expand=1`.
7. **Hand it over:** show the title and the description in separate code blocks the user can paste, the compare link, and a reminder to check that the base branch is `dev`. State plainly that **no PR has been created**. Next step for the user: open the PR, review it, merge on GitHub, then create the next phase branch from `dev`.
