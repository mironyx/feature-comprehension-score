---
name: feature
description: Autonomously implement the next feature from the project board. Picks the top Todo item, creates a branch, implements with TDD, runs diagnostics, commits, creates a PR, runs /pr-review and fixes any findings, then reports. Only pauses for real blockers.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature — Autonomous Implementation Cycle

Implements a single feature end-to-end without user intervention unless blocked.

**Usage:**

- `/feature` — picks the top Todo item from the project board
- `/feature 123` — works on issue #123 specifically

**Pre-requisite:** The issue's design document (LLD, design doc section, or ADR) must be complete. If not, stop and tell the user.

## Process

Execute these steps sequentially. Do not skip steps. Do not ask for confirmation between steps — only pause if a step fails after remediation attempts.

### Step 1: Pick the work item and tag the session

If `$ARGUMENTS` contains an issue number, use that. Otherwise:

1. Run `gh project item-list 1 --owner leonids2005 --format json` and find the **top Todo item** (first item with `status: "Todo"`).
2. Read the issue body: `gh issue view <number>`.
3. **Validate the issue has enough context:**
   - Design doc or LLD section reference
   - BDD test specs or acceptance criteria
   - If missing, stop and report: "Issue #N lacks [missing item]. Cannot proceed autonomously."

Once the issue number is known, tag the session so it is identifiable in the IDE and in Grafana:

```bash
py - <<'PYEOF'
import os, json, subprocess, pathlib

ISSUE = "<issue-number>"            # replace with actual issue number
FEATURE_ID = f"FCS-{ISSUE}"
PROJECT_KEY = "c--projects-feature-comprehension-score"

# Anchor to main repo root — works whether CWD is main tree or a worktree
git_root = pathlib.Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True
).stdout.strip())

# Find current session JSONL (newest file in the project's Claude dir)
claude_dir = pathlib.Path.home() / ".claude" / "projects" / PROJECT_KEY
jsonl_files = sorted(claude_dir.glob("*.jsonl"), key=os.path.getmtime, reverse=True)
if not jsonl_files:
    print("No session JSONL found — skipping session tagging")
    raise SystemExit(0)

jsonl_path = jsonl_files[0]
session_id = jsonl_path.stem          # UUID is the filename without extension

# 1. Append custom-title so the IDE session list shows "FCS-<N>"
with open(jsonl_path, "a", encoding="utf-8") as f:
    f.write(json.dumps({
        "type": "custom-title",
        "sessionId": session_id,
        "customTitle": FEATURE_ID,
    }) + "\n")

# 2. Write Prometheus textfile mapping session → feature
# Always writes to main repo's monitoring dir (where node-exporter mounts from)
textfile_dir = git_root / "monitoring" / "textfile_collector"
textfile_dir.mkdir(parents=True, exist_ok=True)
prom_file = textfile_dir / "session_feature.prom"

# Append new session entry (preserve prior sessions — Prometheus keeps all labels)
existing = prom_file.read_text(encoding="utf-8") if prom_file.exists() else ""
new_line = f'claude_session_feature{{session_id="{session_id}",feature_id="{FEATURE_ID}"}} 1\n'
if new_line not in existing:
    header = (
        "# HELP claude_session_feature Maps Claude Code session ID to feature ID\n"
        "# TYPE claude_session_feature gauge\n"
    )
    if existing and not existing.startswith("# HELP"):
        # File exists but has no header — prepend it
        content = header + existing + new_line
    elif not existing:
        content = header + new_line
    else:
        content = existing.rstrip("\n") + "\n" + new_line
    prom_file.write_text(content, encoding="utf-8", newline="\n")

print(f"Session tagged: {FEATURE_ID} → {session_id}")
print(f"Prom file: {prom_file}")
PYEOF
```

### Step 2: Set up the worktree and branch

Each feature runs in an isolated git worktree so multiple `/feature` sessions can run in parallel without filesystem conflicts.

1. Derive a short slug from the issue title (e.g., issue #123 "Add scoring engine" → `scoring-engine`).
2. Compute the worktree path and store it — you will use this throughout all remaining steps:
   ```bash
   WDIR="$(git rev-parse --show-toplevel)/../fcs-feat-<issue-number>-<slug>"
   echo "WDIR=$WDIR"
   ```
3. Fetch the integration branch and create the worktree + branch from it:
   ```bash
   git fetch origin main
   git worktree add "$WDIR" -b feat/<slug> origin/main
   ```
4. Move the issue to In Progress: `./scripts/gh-project-status.sh <number> "in progress"`.

**From this point forward, all operations target the worktree:**

- All Bash commands: `(cd "$WDIR" && <command>)`
- All Read/Write/Edit/Glob/Grep file paths: use the absolute `$WDIR`-rooted path (e.g., `$WDIR/src/lib/engine/scoring.ts`)

### Step 3: Read design context

1. Read all files referenced in the issue body (design docs, LLDs, type files, related source).
2. Read any existing source files in the target directory.
3. Understand the contract: inputs, outputs, types, error cases.

### Step 4: Implement with TDD

Follow strict Red-Green-Refactor. One test at a time.

For each behaviour in the BDD spec from the issue:

1. **RED** — Write a failing test. Run `(cd "$WDIR" && npx vitest run <test-file>)`. Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. Run tests again. Confirm green.
3. **REFACTOR** — Clean up if needed. Tests must stay green.

Continue until all acceptance criteria are covered.

### Step 5: Full verification

Run all three checks. All must pass before proceeding.

```bash
(cd "$WDIR" && npx vitest run)          # all tests green
(cd "$WDIR" && npx tsc --noEmit)        # no type errors
(cd "$WDIR" && npm run lint)            # no lint errors
```

If E2E tests exist (`tests/e2e/` is non-empty), also run:

```bash
(cd "$WDIR" && NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-publishable-key \
  SUPABASE_SECRET_KEY=placeholder-secret-key \
  npm run build && npx playwright test)
```

If any fail, fix and re-run. If stuck after 3 attempts on the same failure, pause and report.

### Step 6: Diagnostics

Run `/diag` to check VS Code extension diagnostics.

- Fix any Errors or Warnings.
- Info-level items: fix if straightforward, otherwise note for the PR description.
- Re-run Step 5 after any fixes.

### Step 7: Commit

Stage and commit with a conventional commit message referencing the issue number:

```bash
(cd "$WDIR" && git add <specific-files>)
(cd "$WDIR" && git commit -m "feat: <description> #<issue-number>")
```

One commit per issue. Do not batch multiple issues.

### Step 8: Push and create PR

```bash
(cd "$WDIR" && git push -u origin feat/<branch-name>)
```

Query Prometheus for session-total cost and tokens to include in the PR body.
Also applies `ai-cost:*`, `input-tokens:*`, `output-tokens:*` labels to the issue and PR.

```bash
PR_NUMBER=<pr-number>
py scripts/query-feature-cost.py FCS-<issue-number> --issue <issue-number> --pr $PR_NUMBER
```

Incorporate the output into the PR body:

```bash
(cd "$WDIR" && gh pr create --title "<short title>" --base main --body "$(cat <<'EOF'
## Summary
<1-3 bullet points of what was implemented>

## Issue
Closes #<number>

## Design reference
<path to design doc section>

## Test plan
- [ ] `npx vitest run` — all tests pass
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] Design contracts verified (field names, types, schemas match)

## Verification
- **Tests added:** N
- **Total tests:** N (M test files)

## Usage
- **Cost:** $0.0000
- **Tokens:** N input / N output / N cache-read / N cache-write
EOF
)"
```

### Step 8b: CI probe (background)

Immediately after the PR is created, launch the `ci-probe` agent in the background.
It will block on `gh run watch` and report back when CI completes — no polling needed.

```
Launch Agent: ci-probe
Input: pr=<pr-number>
run_in_background: true
```

Continue with Step 9 immediately — do not wait for the CI probe.
When the probe reports back, triage its findings the same way as review findings:
- **CI failure** — fix the root cause, push, note in the Step 10 report.
- **CI pass** — note in the Step 10 report.

### Step 9: Review

Run `/pr-review <pr-number>` on the PR just created. This posts a comment on the PR and
returns findings. Triage each finding:

- **Blocker / correctness issue** — fix it: update the code, re-run Step 5 (verification), add a commit, push.
- **Design contract mismatch** — check whether the design or the implementation is wrong:
  if the implementation is wrong, fix it; if the design is outdated, update the design doc in the same branch.
- **Non-blocking suggestion** — decide whether it is worth fixing now (quick win) or deferring. If deferring, note it in the Step 10 report.
- **Style / minor** — fix if trivial; otherwise note and move on.

After any fixes, re-run `/pr-review <pr-number>` to confirm no new issues were introduced.

### Step 10: Report

Summarise what was done:
- Issue number and title
- Branch and PR link
- Tests added / total
- Review outcome: what was found, what was fixed, what was deferred
- CI outcome: pass / fail / pending (if the ci-probe has not yet reported back)
- Any warnings or notes (PR size, diagnostics findings, design drift)
- Suggested next item from the board

**Stop here.** User reviews the PR. Post-PR workflow (merge, close, board update, worktree removal) is handled by `/feature-end`.

**DO NOT** move the board item to `done`. Leave it at `in progress` — `/feature-end` handles that after merge.

## Blocker policy

**Pause and report** (do not attempt workarounds) if:

- Design doc is missing or ambiguous for this issue
- Tests fail after 3 fix attempts on the same error
- Type errors that suggest a design contract mismatch
- External dependency is unavailable (e.g., a function from an unmerged PR)
- Issue has no acceptance criteria

**Do NOT pause for:**

- Linting issues (fix them)
- Minor test adjustments (refactor)
- Missing barrel exports (create them)
- Diagnostic warnings (fix them)
- PR size slightly over 200 lines (warn in PR description, continue)
