---
description: Wrap up a completed feature after PR review. Syncs the LLD, writes session log, merges PR (with approval), switches to parent branch, cleans up worktree.
---

# Feature End — Post-Review Wrap-Up

Finalises a feature branch after the PR has been reviewed and approved.

**Pre-requisite:** A PR exists for the current branch and has been reviewed/approved.

Note: OTEL feature cost query is not available in Windsurf — omit the cost section from the session log.

## Process

Execute these steps sequentially. Do not skip steps.

### Step 1: Gather context

1. Identify the current branch:
   ```powershell
   git branch --show-current
   ```
2. Find the open PR for this branch:
   ```powershell
   gh pr view --json number,title,baseRefName,state,reviews,url
   ```
   Extract: **base branch**, **PR number**, **PR URL**.
   If no PR exists, stop and report: "No open PR found for the current branch."
3. Find the associated issue number from the PR body (look for `Closes #N` or `#N` references).
4. Read the latest session log in `docs/sessions/` to understand what has been done.

### Step 1.5: Sync the LLD

Run the `/lld-sync` workflow with the issue number to update the Low-Level Design document with implementation learnings before writing the session log. The sync report output feeds directly into the session log's "Decisions made" section.

If no LLD covers this issue (e.g., it is a chore or infrastructure task), skip this step and note it in the session log.

### Step 2: Write session log

1. Determine the session log filename: `docs/sessions/YYYY-MM-DD-session-N.md` (increment N from the latest log for today, or start at 1).
2. Write the session log capturing:
   - Work completed (reference issue number and PR)
   - Decisions made during the session (include the LLD sync report from Step 1.5)
   - Any review feedback addressed
   - Next steps or follow-up items
3. Stage the session log:
   ```powershell
   git add docs/sessions/<filename>.md
   ```

### Step 3: Commit remaining changes

1. Check for uncommitted changes:
   ```powershell
   git status
   ```
2. If there are changes to commit:
   ```powershell
   git add <specific-files>
   git commit -m "docs: session log and final fixes #<issue-number>"
   ```
3. Push to remote:
   ```powershell
   git push
   ```

### Step 4: Merge the PR — USER APPROVAL REQUIRED

First check whether the PR is already merged (user may have merged via GitHub UI):
```powershell
gh pr view <number> --json state
```

If `"state":"MERGED"`, skip the merge command and proceed directly to Step 5.

Otherwise, present the user with:
- PR title and URL
- Base branch the PR will merge into
- Merge strategy: squash merge (default)

Ask: "Ready to merge PR #N into `<base-branch>`? (squash merge, delete remote branch)"

Wait for explicit approval. If denied, stop and report.

Once approved:
```powershell
gh pr merge <number> --squash --delete-branch
```

### Step 5: Clean up, sync, and update project board

Chain all cleanup into a single command to minimise prompts:

```powershell
git checkout <base-branch>; git pull; git branch -d <feature-branch> 2>$null; true
./scripts/gh-project-status.sh <issue-number> done 2>$null; true
gh issue close <issue-number> 2>$null; true
```

### Step 6: Check branch protection

```powershell
gh api repos/{owner}/{repo}/branches/main/protection 2>&1 | Select-Object -First 1
```

- If it returns protection config → nothing to do.
- If it returns a 404 or "Branch not protected" → remind the user that branch protection is not enabled.

### Step 7: Report

Summarise what was done:
- PR merged (link)
- Issue closed
- Now on branch `<base-branch>`, up to date with remote
- Suggested next items:
  ```powershell
  gh issue list --label L5-implementation --state open --limit 3
  ```

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
- Board item already moved to Done (skip board update)
- Local feature branch already deleted (skip `git branch -d`)
