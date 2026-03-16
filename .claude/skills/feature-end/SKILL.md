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

**This is the only step that requires user confirmation.**

Present the user with:
- PR title and URL
- Base branch the PR will merge into
- Merge strategy: squash merge (default)

Ask: "Ready to merge PR #N into `<base-branch>`? (squash merge, delete remote branch)"

Wait for explicit approval. If denied, stop and report.

Once approved:

```bash
gh pr merge <number> --squash --delete-branch
```

### Step 5: Switch to parent branch and sync

1. Switch to the parent branch (the PR's base branch):
   ```bash
   git checkout <base-branch>
   git pull
   ```
2. Delete the local feature branch:
   ```bash
   git branch -d <feature-branch>
   ```

### Step 6: Update project board

1. Move the issue to Done:
   ```bash
   ./scripts/gh-project-status.sh <issue-number> done
   ```
2. Close the issue if not auto-closed by the PR merge:
   ```bash
   gh issue close <issue-number>
   ```

### Step 7: Report

Summarise what was done:
- PR merged (link)
- Issue closed
- Now on branch `<base-branch>`, up to date with remote
- Suggested next item from the board (check top Todo)

## Blocker policy

**Pause and report** if:

- No open PR exists for the current branch
- PR has not been approved / has requested changes
- Merge conflicts prevent merging
- Push fails

**Do NOT pause for:**

- Missing session log (create one)
- Minor uncommitted changes (commit them)
- Issue already closed (skip close step)
