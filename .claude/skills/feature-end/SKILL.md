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
post-PR (review fixes, re-runs, etc.).

```bash
py - <<'PYEOF'
import urllib.request, urllib.parse, json, pathlib, subprocess

PROM = "http://localhost:9090/api/v1/query"

git_root = pathlib.Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True
).stdout.strip())

# Derive feature ID from branch name (feat/slug -> FCS-<N> via prom file)
prom_file = git_root / "monitoring" / "textfile_collector" / "session_feature.prom"

# Derive current feature ID from issue number in recent commits
import re, subprocess as _sp
log = _sp.run(["git", "log", "--oneline", "-10"], capture_output=True, text=True, check=True).stdout
issue_matches = re.findall(r'#(\d+)', log)
feature_id = f"FCS-{issue_matches[0]}" if issue_matches else None

session_ids = []
if prom_file.exists() and feature_id:
    for line in prom_file.read_text().splitlines():
        if line.startswith("claude_session_feature{") and f'feature_id="{feature_id}"' in line:
            for part in line.split(","):
                if "session_id=" in part:
                    session_ids.append(part.split('"')[1])
                    break

sid_regex = "|".join(session_ids) if session_ids else None

def query(promql):
    try:
        url = PROM + "?" + urllib.parse.urlencode({"query": promql})
        rows = json.loads(urllib.request.urlopen(url, timeout=3).read()).get("data", {}).get("result", [])
        return sum(float(r["value"][1]) for r in rows) if rows else 0.0
    except Exception:
        return None

if sid_regex:
    s = f'session_id=~"{sid_regex}"'
    cost = query(f'sum(claude_code_cost_usage_USD_total{{{s}}})')
    inp  = query(f'sum(claude_code_token_usage_tokens_total{{{s},type="input"}})')
    out  = query(f'sum(claude_code_token_usage_tokens_total{{{s},type="output"}})')
    cr   = query(f'sum(claude_code_token_usage_tokens_total{{{s},type="cacheRead"}})')
    cc   = query(f'sum(claude_code_token_usage_tokens_total{{{s},type="cacheCreation"}})')
else:
    cost = inp = out = cr = cc = None

sessions_note = f" ({len(session_ids)} sessions)" if len(session_ids) > 1 else ""
if cost is None:
    print("## Final Usage\n- Prometheus unavailable")
else:
    print(f"## Final Usage (feature total{sessions_note})\n- **Cost:** ${cost:.4f}\n- **Tokens:** {int(inp or 0):,} input / {int(out or 0):,} output / {int(cr or 0):,} cache-read / {int(cc or 0):,} cache-write")
    print(f"_Compare to PR-creation cost in the PR body to see post-PR rework overhead._")
PYEOF
```

Capture the output. Post it as a PR comment:

```bash
gh pr comment <number> --body "<final usage output>"
```

Store the cost figures — you will include them in the session log in Step 2.

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
- Suggested next item from the board: run `gh project item-list 1 --owner <owner> --format json` and print the first Todo item's title and number. This is the only additional query allowed here.

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
