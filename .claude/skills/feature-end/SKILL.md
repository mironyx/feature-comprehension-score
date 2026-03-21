---
name: feature-end
description: Wrap up a completed feature after PR review. Writes session log, commits remaining changes, merges PR (with approval), switches to parent branch, cleans up.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature End — Post-Review Wrap-Up

Finalises a feature branch after the PR has been reviewed and approved. Handles session log, final commit, merge, and cleanup.

**Pre-requisite:** A PR exists for the current branch and has been reviewed/approved.

## Process

Execute these steps sequentially. Do not skip steps.

### Step 1: Gather context

1. Identify the current branch: `git branch --show-current`.
2. Find the open PR for this branch: `gh pr view --json number,title,baseRefName,state,reviews,url`.
   - Extract the **base branch** (this is the parent branch to return to — not necessarily `main`).
   - Extract the **PR number** and **URL**.
   - If no PR exists, stop and report: "No open PR found for the current branch."
3. Find the associated issue number from the PR body (look for `Closes #N` or `#N` references).
4. Read the latest session log in `docs/sessions/` to understand what has been done this session.

### Step 1.5: Sync the LLD

Run `/lld-sync <issue-number>` to update the Low-Level Design document with implementation learnings
before writing the session log. The sync report output feeds directly into the session log's
"Decisions made" section.

If no LLD covers this issue (e.g., it is a chore or infrastructure task), skip this step and note
it in the session log.

### Step 2: Write session log

1. Determine the session log filename: `docs/sessions/YYYY-MM-DD-session-N.md` (increment N from the latest log for today, or start at 1).
2. Write the session log capturing:
   - Work completed (reference issue number and PR)
   - Decisions made during the session
   - Any review feedback addressed
   - Next steps or follow-up items
3. Stage the session log.

### Step 3: Commit remaining changes

1. Run `git status` to check for uncommitted changes (session log, review fixes, etc.).
2. If there are changes to commit:
   ```bash
   git add <specific-files>
   git commit -m "docs: session log and final fixes #<issue-number>"
   ```
3. Push to remote: `git push`.

### Step 4: Merge the PR — USER APPROVAL REQUIRED

**This is the ONLY step in the entire skill that requires user confirmation. All steps before and after run automatically without pausing.**

First check whether the PR is already merged (user may have merged via GitHub UI):
```bash
gh pr view <number> --json state
```
Parse the `state` field from the JSON output (no `jq` — read the raw output). If `"state":"MERGED"`, skip the merge command and proceed directly to Step 5.

Otherwise, present the user with:
- PR title and URL
- Base branch the PR will merge into
- Merge strategy: squash merge (default)

Ask: "Ready to merge PR #N into `<base-branch>`? (squash merge, delete remote branch)"

Wait for explicit approval. If denied, stop and report.

Once approved, proceed immediately through Steps 5–7 without further confirmation. **Run from the primary worktree** (not from inside the feature worktree — `gh pr merge --delete-branch` attempts a local `git checkout <base>` which fails if `<base>` is already checked out in another worktree):

```bash
gh pr merge <number> --squash --delete-branch
```

### Step 5: Clean up and sync

Chain all cleanup into a single Bash call to minimise approval prompts:

```bash
git checkout <base-branch> && git pull && git branch -d <feature-branch> 2>&1; true
```

(The `; true` prevents a non-zero exit if the local branch was already deleted by the merge.)

Worktrees are not used in this project — skip worktree steps.

### Step 6: Update project board

Check issue state and board status in one call, then act once — do not re-query to verify:

```bash
gh issue view <issue-number> --json state,projectItems
```

Read the output:
- `"state":"CLOSED"` → skip `gh issue close`
- Board `"name":"Done"` → skip `gh-project-status.sh`

Only run what is actually needed (each is optional):
```bash
./scripts/gh-project-status.sh <issue-number> done   # only if board not already Done
gh issue close <issue-number>                         # only if issue not already closed
```

### Step 7: Report

Summarise what was done:
- PR merged (link)
- Issue closed
- Now on branch `<base-branch>`, up to date with remote
- Suggested next item from the board (from the Step 6 `gh issue view` output — do not make an additional board query)

## Blocker policy

**Pause and report** if:

- No open PR exists for the current branch
- PR has not been approved / has requested changes
- Merge conflicts prevent merging
- Push fails

**Do NOT pause for:**

- Missing session log (create one)
- Minor uncommitted changes (commit them)
- Issue already closed by GitHub on merge (skip close step)
- Board item already moved to Done by GitHub on merge (skip board update)
- Local feature branch already deleted (skip `git branch -d`)
