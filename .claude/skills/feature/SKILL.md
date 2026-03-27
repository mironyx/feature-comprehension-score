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

1. Run `gh issue list --label L5-implementation --state open --limit 1` and use the first result.
2. Read the issue body: `gh issue view <number>`.
3. **Validate the issue has enough context:**
   - Design doc or LLD section reference
   - BDD test specs or acceptance criteria
   - If missing, stop and report: "Issue #N lacks [missing item]. Cannot proceed autonomously."

Once the issue number is known, tag the session so it is identifiable in the IDE and in Grafana:

```bash
py scripts/tag-session.py <issue-number>
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

**Open each file in Windsurf the first time you create or edit it** so the diagnostics
extension begins analysing immediately. One open per file is enough — subsequent edits to
the same file are picked up automatically. If the hook fires with inline findings during
the cycle, address them before moving to the next test.

```bash
windsurf --reuse-window <path-to-file>   # run once per file, on first create/edit
```

For each behaviour in the BDD spec from the issue:

1. **RED** — Write a failing test. Run `(cd "$WDIR" && npx vitest run <test-file>)`. Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. Run tests again. Confirm green.
3. **REFACTOR** — Clean up if needed. Tests must stay green.

Continue until all acceptance criteria are covered.

### Step 5: Full verification

Run all checks. **All must pass — zero failures, including integration tests — before proceeding.**

```bash
(cd "$WDIR" && npx vitest run)                                   # all tests green (unit + integration)
(cd "$WDIR" && npx tsc --noEmit)                                 # no type errors
(cd "$WDIR" && npm run lint)                                     # no lint errors
(cd "$WDIR" && npx markdownlint-cli2 "**/*.md" 2>&1 | tail -5)  # no markdown lint errors (catches pre-existing violations that will fail CI)
```

**Integration test failures are not pre-existing — fix them.** If `npx vitest run` reports
failures in `*.integration.test.ts` files, diagnose and resolve before continuing. Do not
dismiss integration failures as "unrelated to this PR" and proceed to create the PR.

If E2E tests exist (`tests/e2e/` is non-empty), also run:

```bash
(cd "$WDIR" && NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-publishable-key \
  SUPABASE_SECRET_KEY=placeholder-secret-key \
  npm run build && npx playwright test)
```

If any fail, fix and re-run. If stuck after 3 attempts on the same failure, pause and report.

### Step 6: Diagnostics (blocking gate)

Run `/diag` on all files changed in this cycle. This is a **blocking gate** — do not proceed to Step 7 until clean.

**Files should already be open** from the Step 4 first-open protocol. If any changed file was
not opened during Step 4 (e.g. it was modified indirectly), open it now before running `/diag`:

```bash
windsurf --reuse-window src/path/to/missed-file.ts    # only for files not yet opened
windsurf --reuse-window tests/path/to/missed-file.ts  # test files too — CodeScene analyses them
sleep 5                                                # wait for CodeScene to analyse if opened cold
```

**Both `src/` and `tests/` files must be checked.** CodeScene analyses test files and flags Code
Duplication in them (repeated `it()` blocks, repeated arrange/render patterns). These warnings
are blocking — fix them before proceeding to Step 7.

Then:

1. Run `/diag` on all changed files — including every modified test file under `tests/`.
2. If any findings exist, fix them all. **Exception: ignore smells on generated files** (e.g. `supabase/migrations/`) — CodeScene exclusions are configured but may not cover every generated file.
3. After fixing, open the fixed files in Windsurf again and wait 5 s, then re-run `/diag` to confirm the findings are gone — do not assume a fix worked without seeing the updated diagnostics.
4. Repeat until `/diag` reports zero findings on non-generated files.
5. Re-run Step 5 (full verification) after any fixes.

Only proceed to Step 7 when `/diag` reports zero findings on non-generated files.

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

Create the PR first with a placeholder Usage section, then run the cost script once after the PR
exists so labels are applied to both issue and PR in a single call, and patch the body.

```bash
PR_URL=$(cd "$WDIR" && gh pr create --title "<short title>" --base main --body "$(cat <<'EOF'
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
- **Cost:** TBD
- **Tokens:** TBD
- **Time to PR:** TBD
EOF
)")

PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')

# Single cost script call — applies labels to issue + PR and outputs cost summary
COST_OUTPUT=$(py scripts/query-feature-cost.py FCS-<issue-number> --issue <issue-number> --pr $PR_NUMBER)

# Patch the PR body with the actual cost figures (replace TBD placeholders)
COST_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Cost:')
TOKEN_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Tokens:')
TIME_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Time to PR:')
CURRENT_BODY=$(gh pr view $PR_NUMBER --json body -q '.body')
UPDATED_BODY=$(echo "$CURRENT_BODY" \
  | sed "s|- \*\*Cost:\*\* TBD|$COST_LINE|" \
  | sed "s|- \*\*Tokens:\*\* TBD|$TOKEN_LINE|" \
  | sed "s|- \*\*Time to PR:\*\* TBD|$TIME_LINE|")
gh pr edit $PR_NUMBER --body "$UPDATED_BODY"
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
