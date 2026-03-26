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
   - Final feature cost (from Step 2.5) — include both the PR-creation cost (from PR body) and the final total, so the delta is visible
3. Stage the session log.

### Step 2.5: Query final feature cost

Query Prometheus for the full feature total (all sessions since `/feature` started — same
session IDs registered in the textfile). This is the **final** cost snapshot; comparing it
to the cost recorded in the PR body at creation time shows how much effort was spent
post-PR (review fixes, re-runs, etc.). Also updates the `ai-cost:*` label on the issue.

Derive the issue number from the git log and run the shared script:

```bash
ISSUE=$(git log --oneline -10 | grep -o '#[0-9]*' | head -1 | tr -d '#')
PR=$(gh pr view --json number --jq .number 2>/dev/null || echo "")
COST_OUTPUT=$(py scripts/query-feature-cost.py FCS-$ISSUE --issue $ISSUE ${PR:+--pr $PR} --final)
echo "$COST_OUTPUT"
```

Post the output as a PR comment:

```bash
gh pr comment <number> --body "$COST_OUTPUT"
```

Store the cost figures — you will include them in the session log in Step 2.

### Step 2.6: Cost retrospective

Analyse the full cost and write a brief retrospective to include in the session log.
This is the institutional memory that makes future features cheaper.

1. **Cost summary:** PR-creation cost (from PR body `Usage` section) vs final total.
   Delta = post-PR work (review fixes, re-runs, extra commits).

2. **Identify cost drivers.** Check each of these against the git log and session history:

   | Driver | How to detect | Typical impact |
   |--------|--------------|----------------|
   | Context compaction | Session summary starts "This session is being continued..." | High — re-summarising inflates cache-write tokens |
   | Fix cycles (RED→fix rounds) | Count commits before the first green run | Medium — each vitest run adds tokens |
   | Agent spawns | Count Agent calls in the session: simplify (3), pr-review (3), diagnostics, ci-probe | Medium — each spawn re-sends the full diff |
   | LLD quality gaps | pr-review found design-contract violations → extra fix commit | Medium — avoidable with better LLD signatures upfront |
   | Mock complexity | Many test fix rounds before mocks worked | Low–medium |
   | Zod/framework version gotchas | Fix cycles on schema/type issues | Low |

3. **Improvement actions:** For each driver, record a concrete change for next time:
   - "LLD private-helper signatures were wrong → validate signatures in a quick `tsc` pass before writing tests"
   - "Context compaction hit → keep PRs under 200 lines; break large features into two issues"
   - "3 simplify agents re-read the full diff → run simplify before pr-review, not both"
   - "Zod v4 UUID format → read migration notes at session start for framework upgrades"

Record under **## Cost retrospective** in the session log.

### Step 3: Commit remaining changes

1. Run `git status` to check for uncommitted changes (session log, review fixes, etc.).
2. If there are changes to commit:
   ```bash
   git add <specific-files>
   git commit -m "docs: session log and final fixes #<issue-number>"
   ```
3. Push to remote: `git push`.

### Step 4: Merge the PR — USER APPROVAL REQUIRED


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

**All steps below must be run automatically without user approval - unless there is a blocker.**
### Step 5 + 6: Clean up, sync, and update project board

Read the issue state from the earlier `gh pr view` output (merged PRs close the issue automatically).
Chain **all** of cleanup + board update into a **single Bash call** to minimise approval prompts:

```bash
git checkout <base-branch> && git pull && git branch -d <feature-branch> 2>&1; true \
  && ./scripts/gh-project-status.sh <issue-number> done 2>&1; true \
  && gh issue close <issue-number> 2>&1; true
```

The `2>&1; true` on each segment ensures:
- A missing local branch does not abort the chain.
- A board item already at Done (script exits 0 with no-op) continues cleanly.
- An already-closed issue (`gh issue close` 422) is silently ignored.

**Do not run separate Bash calls** for branch delete, board update, and issue close — they must be one call.

### Step 7: Report

Summarise what was done:
- PR merged (link)
- Issue closed
- Now on branch `<base-branch>`, up to date with remote
- Suggested next item: run `gh issue list --label L5-implementation --state open --limit 3` and print the results. This is the only additional query allowed here.

### Step 7.5: Check branch protection

Run:
```bash
gh api repos/{owner}/{repo}/branches/main/protection --silent 2>&1 | head -1
```

- If it returns protection config → branch protection is active, nothing to do.
- If it returns a 404 or "Branch not protected" → remind the user:

  > **Branch protection is not enabled.** To require all CI checks before merging, either make
  > the repository public or upgrade to GitHub Pro, then run:
  > ```bash
  > gh api repos/{owner}/{repo}/branches/main/protection --method PUT --input - <<'EOF'
  > {
  >   "required_status_checks": {
  >     "strict": true,
  >     "contexts": [
  >       "Lint & Type-check",
  >       "Unit tests",
  >       "Integration tests (Supabase)",
  >       "Build",
  >       "Docker build",
  >       "E2E tests (Playwright)"
  >     ]
  >   },
  >   "enforce_admins": false,
  >   "required_pull_request_reviews": null,
  >   "restrictions": null
  > }
  > EOF
  > ```

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
