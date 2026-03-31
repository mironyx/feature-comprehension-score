---
name: feature-end
description: Wrap up a completed feature after PR review. Writes session log, commits remaining changes, merges PR (with approval), switches to parent branch, cleans up.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature End — Post-Review Wrap-Up

Finalises a feature branch after the PR has been reviewed and approved. Handles session log, final commit, merge, and cleanup.

**Pre-requisite:** A PR exists for the current branch (or the given issue) and has been reviewed/approved.

**Usage:**
- `/feature-end` — detects the PR from the current branch (original behaviour)
- `/feature-end <issue-number>` — looks up the PR for the given issue and checks out its branch (used by `/feature-team` lead when triggering remotely via message)

## Process

Execute these steps sequentially. Do not skip steps.

### Step 1: Gather context

If an issue number argument was provided:
1. Find the PR for the issue:
   ```bash
   gh pr list --search "closes #<issue-number>" --json number,title,baseRefName,state,url,headRefName --state open
   ```
   If no open PR is found, try `--state merged` in case it was already merged. If still none, stop and report.
2. Check out the PR's head branch so subsequent git operations work correctly:
   ```bash
   gh pr checkout <pr-number>
   ```

If no argument was provided (original behaviour):
1. Identify the current branch: `git branch --show-current`.
2. Find the open PR for this branch: `gh pr view --json number,title,baseRefName,state,reviews,url`.
   - If no PR exists, stop and report: "No open PR found for the current branch."

In both cases:
- Extract the **base branch**, **PR number**, and **URL**.
- Find the associated issue number from the PR body (look for `Closes #N` or `#N` references).
- Read the latest session log in `docs/sessions/` to understand what has been done this session.

### Step 1.5: Sync the LLD — MANDATORY

**Do not skip.** Run `/lld-sync <issue-number>` to update the Low-Level Design document with
implementation learnings before writing the session log. The sync report feeds directly into the
session log's "Decisions made" section.

Only skip if no LLD covers this issue (chore or infrastructure task) — note the skip in the
session log.

### Step 2: Write session log — MANDATORY

**Do not skip.** A session log must always be written, even for small changes.

1. Check for a compact draft: `ls docs/sessions/*-draft.md 2>/dev/null | tail -1`.
   - If a draft exists, read it — it contains pre-compact snapshots with tool counts, files
     touched, agent spawns, and git milestones captured automatically before context was lost.
     Use this data to populate the cost retrospective (Step 2.6) with actual numbers rather
     than estimates. The final session log filename should match the draft name minus `-draft`
     (e.g., `2026-03-26-session-3-draft.md` → `2026-03-26-session-3.md`).
   - If no draft exists, determine the filename as `YYYY-MM-DD-session-N-<slug>.md` where N increments from the latest log for today and `<slug>` is a short kebab-case label derived from the issue title (e.g. issue #130 "show rubric_generation status" → `rubric-generation-status`).
2. Write the session log capturing:
   - Work completed (reference issue number and PR)
   - Decisions made during the session
   - Any review feedback addressed
   - Next steps or follow-up items
   - Final feature cost (from Step 2.5) — include both the PR-creation cost (from PR body) and the final total, so the delta is visible
3. If a draft file was used, delete it: `rm docs/sessions/*-draft.md`.
4. Stage the session log (and the draft deletion if applicable).

### Step 2.5: Query final feature cost

Query Prometheus for the full feature total (all sessions since `/feature` started — same
session IDs registered in the textfile). This is the **final** cost snapshot; comparing it
to the cost recorded in the PR body at creation time shows how much effort was spent
post-PR (review fixes, re-runs, etc.). Also updates the `ai-cost:*` label on the issue.

Derive the issue number from the git log and run the shared script:

```bash
ISSUE=$(git log --oneline -10 | grep -o '#[0-9]*' | head -1 | tr -d '#')
PR=$(gh pr view --json number --jq .number 2>/dev/null || echo "")
COST_OUTPUT=$(.claude/hooks/run-python.sh scripts/query-feature-cost.py FCS-$ISSUE --issue $ISSUE ${PR:+--pr $PR} --final)
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

### Step 3.5: Rebase onto latest base branch

With multiple agents working in parallel, the base branch may have advanced since this branch was cut.
Rebase before merging so CI validates the integrated code and the merge is conflict-free.

```bash
BASE=$(gh pr view --json baseRefName --jq .baseRefName)
git fetch origin "$BASE"
git merge-base --is-ancestor "origin/$BASE" HEAD \
  && echo "ALREADY_UP_TO_DATE" \
  || (git rebase "origin/$BASE" && git push --force-with-lease && echo "REBASED_AND_PUSHED")
```

- **Already up to date** (`ALREADY_UP_TO_DATE`) → proceed directly to Step 4.
- **Rebased cleanly** (`REBASED_AND_PUSHED`) → proceed to Step 4. CI will re-run on the rebased commit; wait for it to pass before merging (use `gh run watch`).
- **Rebase conflict** (non-zero exit from `git rebase`) → run `git rebase --abort`, stop, and report the conflicting files to the user. Do not attempt to resolve conflicts automatically.

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

Once approved, proceed immediately through Steps 5–7 without further confirmation:

```bash
gh pr merge <number> --squash --delete-branch
```

**All steps below must be run automatically without user approval - unless there is a blocker.**
### Step 5 + 6: Clean up, sync, and update project board

Read the issue state from the earlier `gh pr view` output (merged PRs close the issue automatically).
Chain **all** of cleanup + board update into a **single Bash call** to minimise approval prompts:

**Worktree detection:** If running inside a linked worktree (parallel mode), the cleanup must
happen from the main repo — you cannot remove a worktree from within itself. Detect and handle:

```bash
WORKTREE_PATH=$(pwd)
MAIN_REPO=$(dirname "$(git rev-parse --git-common-dir)")
IS_WORKTREE=$([ "$WORKTREE_PATH" != "$MAIN_REPO" ] && echo "yes" || echo "no")
```

Then chain all cleanup in a **single Bash call**:

```bash
# If in a worktree: cd to main repo first, then clean up worktree + branch
# If in main repo: standard cleanup (git branch -d works directly)

cd "$MAIN_REPO" && git pull \
  && [ "$IS_WORKTREE" = "yes" ] && git worktree remove "$WORKTREE_PATH" --force 2>&1; true \
  && git branch -d <feature-branch> 2>&1; true \
  && bash scripts/gh-project-status.sh <issue-number> done 2>&1; true \
  && gh issue close <issue-number> 2>&1; true
```

The `2>&1; true` on each segment ensures:
- Not in a worktree — `git worktree remove` skipped cleanly.
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
