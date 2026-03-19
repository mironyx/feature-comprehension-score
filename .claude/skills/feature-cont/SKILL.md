---
name: feature-cont
description: Continue an in-progress feature implementation in a new session when the previous session's context was exhausted. Reconstructs state from git history and issue body, registers the new session in the prom file, and resumes TDD from where it left off.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature Continue — Resume In-Progress Feature

Resumes a feature that was started with `/feature` in a prior session.
Use when context was exhausted mid-implementation and the work is not yet complete (no PR created, or PR created but implementation incomplete).

**Usage:**

- `/feature-cont` — detects current feature from `monitoring/textfile_collector/session_feature.prom`
- `/feature-cont 123` — resumes issue #123 specifically

## Process

Execute these steps sequentially. Do not skip steps.

### Step 1: Identify the feature and register the new session

**Determine the issue number:**

If `$ARGUMENTS` contains an issue number, use that. Otherwise read from the prom file:

```bash
py - <<'PYEOF'
import pathlib, subprocess

git_root = pathlib.Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True, check=True
).stdout.strip())

prom_file = git_root / "monitoring" / "textfile_collector" / "session_feature.prom"
if not prom_file.exists():
    print("NO_PROM_FILE")
    raise SystemExit(0)

feature_id = None
for line in prom_file.read_text().splitlines():
    if line.startswith("claude_session_feature{"):
        for part in line.split(","):
            if "feature_id=" in part:
                feature_id = part.split('"')[1]
                break
    if feature_id:
        break

if feature_id:
    print(f"FEATURE_ID={feature_id}")
    print(f"ISSUE={feature_id.removeprefix('FCS-')}")
else:
    print("NO_FEATURE_FOUND")
PYEOF
```

If no feature is detected, stop and ask the user to provide an issue number.

**Register the new session** (append — do not overwrite):

```bash
py - <<'PYEOF'
import os, json, subprocess, pathlib

ISSUE = "<issue-number>"            # replace with actual issue number
FEATURE_ID = f"FCS-{ISSUE}"
PROJECT_KEY = "c--projects-feature-comprehension-score"

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
session_id = jsonl_path.stem

# 1. Append custom-title so the IDE session list shows "FCS-<N> (cont)"
with open(jsonl_path, "a", encoding="utf-8") as f:
    f.write(json.dumps({
        "type": "custom-title",
        "sessionId": session_id,
        "customTitle": f"{FEATURE_ID} (cont)",
    }) + "\n")

# 2. Append new session entry to prom file — preserves prior session mappings
textfile_dir = git_root / "monitoring" / "textfile_collector"
textfile_dir.mkdir(parents=True, exist_ok=True)
prom_file = textfile_dir / "session_feature.prom"

existing = prom_file.read_text(encoding="utf-8") if prom_file.exists() else ""
new_line = f'claude_session_feature{{session_id="{session_id}",feature_id="{FEATURE_ID}"}} 1\n'

if new_line not in existing:
    header = (
        "# HELP claude_session_feature Maps Claude Code session ID to feature ID\n"
        "# TYPE claude_session_feature gauge\n"
    )
    if not existing:
        content = header + new_line
    elif not existing.startswith("# HELP"):
        content = header + existing + new_line
    else:
        content = existing.rstrip("\n") + "\n" + new_line
    prom_file.write_text(content, encoding="utf-8", newline="\n")

print(f"New session registered: {FEATURE_ID} → {session_id}")
print(f"Prom file: {prom_file}")
PYEOF
```

### Step 2: Locate the worktree

```bash
git worktree list
```

Find the worktree for `feat/<slug>` matching the issue number. Note the path as `WDIR`.

If no worktree exists for this feature:

1. Check if the feature branch still exists: `git branch -a | grep feat/`
2. If the branch exists, recreate the worktree:
   ```bash
   git worktree add "$WDIR" feat/<slug>
   ```
3. If neither worktree nor branch exists, stop and report: "No worktree or branch found for FCS-<N>. The feature may need to be restarted with `/feature <N>`."

### Step 3: Reconstruct state

1. Read the issue body: `gh issue view <number>` — extract acceptance criteria.
2. Check what has been committed: `(cd "$WDIR" && git log --oneline origin/main..HEAD)`
3. Run the tests to see which pass and which fail:
   ```bash
   (cd "$WDIR" && npx vitest run 2>&1 | tail -30)
   ```
4. Read the relevant source files and test files to understand current state.
5. Identify which acceptance criteria are covered by passing tests and which remain.

Report the reconstruction summary before proceeding:
- Issue: #N — title
- Worktree: `$WDIR`
- Commits since main: N
- Tests: N passing / N failing
- Remaining criteria: list

### Step 4: Write prior session log

Write a session log for the session that just ran out of context, so its work is recorded before the new session begins.

1. Determine the log filename: `docs/sessions/YYYY-MM-DD-session-N.md` (today's date, increment N from the latest log for today, or start at 1).
2. Write the log covering:
   - Feature: issue #N and title
   - What was completed (reference commits, tests written)
   - Which acceptance criteria are now covered
   - Which acceptance criteria remain
   - Reason for continuation: context exhausted
3. Commit the log to the worktree:
   ```bash
   (cd "$WDIR" && git add docs/sessions/<filename>.md)
   (cd "$WDIR" && git commit -m "docs: partial session log #<issue-number>")
   ```

### Step 5: Resume TDD

Continue the Red-Green-Refactor cycle from the first uncovered acceptance criterion.

Follow the same discipline as `/feature` Step 4:

1. **RED** — Write a failing test. Run `(cd "$WDIR" && npx vitest run <test-file>)`. Confirm it fails for the right reason.
2. **GREEN** — Write minimum code to pass. Run tests again. Confirm green.
3. **REFACTOR** — Clean up if needed.

Continue until all acceptance criteria are covered.

### Step 6: Full verification

```bash
(cd "$WDIR" && npx vitest run)
(cd "$WDIR" && npx tsc --noEmit)
(cd "$WDIR" && npm run lint)
```

If any fail, fix and re-run. If stuck after 3 attempts, pause and report.

### Step 7: Review

Run `/review` on the current changes. Fix findings and re-run Step 6.

### Step 8: Diagnostics

Run `/diag`. Fix Errors and Warnings. Re-run Step 6 after fixes.

### Step 9: Commit

```bash
(cd "$WDIR" && git add <specific-files>)
(cd "$WDIR" && git commit -m "feat: <description> #<issue-number>")
```

If a PR already exists, create a new commit (do not amend).

### Step 10: Push and create (or update) PR

Check if a PR already exists:

```bash
(cd "$WDIR" && gh pr list --head feat/<branch-name> --json number,url,state)
```

**If no PR exists:** follow `/feature` Step 9 to create one, including Prometheus cost query.

**If PR exists:** push and note the PR URL in the report.

```bash
(cd "$WDIR" && git push)
```

### Step 11: Report

Summarise what was done:
- Issue number and title
- Sessions involved (original + this continuation)
- Branch and PR link
- Tests added this session / total
- Any warnings or notes

**Stop here.** User reviews the PR. Post-PR workflow is handled by `/feature-end`.

## Blocker policy

**Pause and report** if:

- No worktree, branch, or prom file found for the feature
- Tests fail after 3 fix attempts on the same error
- Design contract mismatch requiring clarification

**Do NOT pause for:**

- Linting issues (fix them)
- Minor test adjustments (refactor)
- Missing barrel exports (create them)
- Diagnostic warnings (fix them)
