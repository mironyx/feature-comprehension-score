---
name: feature-core
description: Core implementation cycle: read design, TDD, verify, silent-swallow check, diagnostics, commit, PR, CI probe, review, report. Called by /feature and /feature-team skills after branch setup.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature Core — Implementation Cycle

Executes the implementation cycle from design reading through PR review. Called after:

- The feature branch is checked out and current
- The board item is set to In Progress
- The session has been tagged

**Usage:** `/feature-core <issue-number>` — not typically invoked directly; called by `/feature` and `/feature-team` skills.

## Steps

Execute sequentially. Do not skip steps. Do not ask for confirmation — only pause on blockers.

### Step 3: Read design context

1. Read the issue body: `gh issue view <issue-number>`.
2. **Epic guard:** Check the issue labels. If the issue has the `epic` label, stop: "Issue #N is an epic, not a task. Use `/feature epic <N>` to pick a task within it."
3. Read all files referenced in the issue body (design docs, LLDs, type files, related source).
4. Read any existing source files in the target directory.
5. Understand the contract: inputs, outputs, types, error cases.

### Step 4: Implement with TDD

Tests-first, grouped by acceptance criterion. Batch the test and its implementation in a single turn per criterion rather than running each test twice (once red, once green) — the literal Red-Green-Refactor cadence burns tokens on every round-trip without adding signal for LLM-driven work. The discipline remains: no implementation without a test written from the LLD spec, and every acceptance criterion must have covering tests before Step 5.

A dedicated ADR on the TDD execution strategy under LLM cost constraints is planned; until it lands, default to batching per criterion.

The PostToolUse hook opens edited files in the editor automatically for diagnostics analysis.
If the hook fires with inline findings during the cycle, address them before moving to the next test.

**Before writing the first test**, scan for reusable fixtures:

1. Grep existing `tests/` files in the same area (e.g. the neighbouring unit test for the
   module you're replacing or extending) for mock client builders, `makeX` factories,
   shared input constants, and response helpers.
2. Check `tests/fixtures/` and `tests/helpers/` for anything already extracted.
3. **If the pattern you need already exists, import it** — never copy-paste boilerplate.
4. **If you are about to write a helper that looks similar to one in a neighbouring test
   file, extract both into `tests/fixtures/<topic>-mocks.ts` first**, then import from
   both places. Do this in the same commit as the new tests.

Duplicated mock setup is tech debt the moment it's written — cheaper to extract up front
than after the evaluator or a reviewer catches it.

For each acceptance criterion in the LLD / issue:

1. **Write the test(s) and the implementation together**, derived from the BDD spec. Keep the test first in the edit order and make sure it would fail without the implementation.
2. Run `npx vitest run <test-file>` once. If it fails, diagnose and fix. If it passes, move on.
3. **Refactor** if anything is obviously cleanup-worthy. Tests must stay green.

Continue until all acceptance criteria are covered. One acceptance criterion per iteration, not one assertion per iteration.

### Step 5: Full verification

Run all checks. **All must pass — zero failures, including integration tests — before proceeding.**

```bash
npx vitest run                                   # full suite — unit + integration, not just new tests
npx tsc --noEmit                                 # no type errors
npm run lint                                     # no lint errors
npx markdownlint-cli2 "**/*.md" 2>&1 | tail -5   # no markdown lint errors
```

**Run the full suite, not just the test files you wrote.** `npx vitest run` with no filter runs
every test in the repo. If you see pre-existing failures, they are your problem — fix them.

**Integration test failures are not pre-existing — fix them.** If `npx vitest run` reports
failures in `*.integration.test.ts` files, diagnose and resolve before continuing. Do not
dismiss integration failures as "unrelated to this PR" and proceed to create the PR.

If E2E tests exist (`tests/e2e/` is non-empty), also run:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-publishable-key \
  SUPABASE_SECRET_KEY=placeholder-secret-key \
  npm run build && npx playwright test
```

If any fail, fix and re-run. If stuck after 3 attempts on the same failure, pause and report.

### Step 5b: Silent-swallow check (blocking gate)

Before proceeding, grep for catch blocks that swallow errors without logging or user feedback:

```bash
grep -rn "catch" src/ --include="*.ts" | grep -v "logger\.\|console\.\|setError\|throw\|// fire-and-forget"
```

Any match must be resolved — add logging, surface the error, or add a `// fire-and-forget` justification comment. Do not proceed to Step 6 with unguarded catch blocks.

### Step 6: Diagnostics (blocking gate)

Run `/diag` on all files changed in this cycle. This is a **blocking gate** — do not proceed to Step 7 until clean.

**Both `src/` and `tests/` files must be checked.** CodeScene analyses test files and flags Code
Duplication in them (repeated `it()` blocks, repeated arrange/render patterns). These warnings
are blocking — fix them before proceeding to Step 7.

Then:

1. Run `/diag` on all changed files — including every modified test file under `tests/`.
2. If any findings exist, fix them all. **Exception: ignore smells on generated files** (e.g. `supabase/migrations/`) — CodeScene exclusions are configured but may not cover every generated file.
3. After fixing, re-run `/diag` to confirm the findings are gone — do not assume a fix worked without seeing the updated diagnostics.
4. Repeat until `/diag` reports zero findings on non-generated files.
5. Re-run Step 5 (full verification) after any fixes.

Only proceed to Step 6b when `/diag` reports zero findings on non-generated files.

### Step 6b: Evaluate (blocking gate)

Launch the `feature-evaluator` agent as a sub-agent. Pass it:

- `lld_path` — the LLD file read in Step 3 (or the issue number if no LLD exists)
- `issue_number` — the current issue number
- `changed_files` — all `src/` files created or modified in this cycle
- `test_files` — all `tests/` files created or modified in this cycle

```
Launch Agent: feature-evaluator
Input: lld_path=<path> issue_number=<N> changed_files=<list> test_files=<list>
```

**Triage the verdict:**

- **PASS** — proceed to Step 7.
- **PASS WITH WARNINGS** — review warnings. Fix quick wins; note the rest in the PR body. Proceed to Step 7.
- **FAIL** — read the failed adversarial tests and silent failure risks. Fix the implementation to address each finding. After fixing, re-run Step 5 (full verification) and Step 6 (`/diag`). Do NOT re-run the evaluator — proceed to Step 7 after verification passes.

The evaluator writes tests to `tests/evaluation/<slug>.eval.test.ts`. These files are committed alongside the feature code in Step 7 — they serve as ongoing regression protection.

### Step 7: Commit

Stage and commit with a conventional commit message referencing the issue number:

```bash
git add <specific-files>
git commit -m "feat: <description> #<issue-number>"
```

One commit per issue. Do not batch multiple issues.

### Step 8: Push and create PR

```bash
git push -u origin HEAD
```

Create the PR first with a placeholder Usage section, then run the cost script once after the PR
exists so labels are applied to both issue and PR in a single call, and patch the body.

```bash
PR_URL=$(gh pr create --title "<short title>" --base main --body "$(cat <<'EOF'
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

<!-- claude-session-id: TBD -->
EOF
)")

PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')

# Single cost script call — applies labels to issue + PR and outputs cost summary
COST_OUTPUT=$(.claude/hooks/run-python.sh scripts/query-feature-cost.py FCS-<issue-number> --issue <issue-number> --pr $PR_NUMBER --stage pr)

# Patch the PR body with the actual cost figures (replace TBD placeholders)
COST_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Cost:')
TOKEN_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Tokens:')
TIME_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Time to PR:')
CURRENT_BODY=$(gh pr view $PR_NUMBER --json body -q '.body')
SESSION_ID=$(python3 -c "
import re, pathlib, os, subprocess
result = subprocess.run(['git', 'rev-parse', '--git-common-dir'], capture_output=True, text=True)
root = pathlib.Path(result.stdout.strip()).parent.resolve()
prom_dir = pathlib.Path(os.environ.get('FCS_FEATURE_PROM_DIR') or root / 'monitoring' / 'textfile_collector')
prom = prom_dir / 'session_feature.prom'
if prom.exists():
    m = re.search(r'session_id=\"([^\"]+)\",feature_id=\"FCS-<issue-number>\"', prom.read_text())
    print(m.group(1) if m else 'unknown')
else:
    print('unknown')
")

UPDATED_BODY=$(echo "$CURRENT_BODY" | .claude/hooks/run-python.sh -c "
import sys
cost_line = '''$COST_LINE'''
token_line = '''$TOKEN_LINE'''
time_line = '''$TIME_LINE'''
session_id = '''$SESSION_ID'''
body = sys.stdin.read()
body = body.replace('- **Cost:** TBD', cost_line)
body = body.replace('- **Tokens:** TBD', token_line)
body = body.replace('- **Time to PR:** TBD', time_line)
body = body.replace('<!-- claude-session-id: TBD -->', f'<!-- claude-session-id: {session_id} -->')
print(body, end='')
")
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER --method PATCH -f body="$UPDATED_BODY" > /dev/null
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

Run `/pr-review-v2 <pr-number>` on the PR just created. This posts a comment on the PR and
returns findings. Triage each finding:

- **Blocker / correctness issue** — fix it: update the code, re-run Step 5 (verification), add a commit, push.
- **Design contract mismatch** — check whether the design or the implementation is wrong:
  if the implementation is wrong, fix it; if the design is outdated, update the design doc in the same branch.
- **Non-blocking suggestion** — decide whether it is worth fixing now (quick win) or deferring. If deferring, note it in the Step 10 report.
- **Style / minor** — fix if trivial; otherwise note and move on.

After any fixes, re-run `/pr-review-v2 <pr-number>` to confirm no new issues were introduced.

### Step 10: Report

Summarise what was done:

- Issue number and title
- Branch and PR link
- Tests added / total
- Review outcome: what was found, what was fixed, what was deferred
- CI outcome: pass / fail / pending (if the ci-probe has not yet reported back)
- Any warnings or notes (PR size, diagnostics findings, design drift)
- Suggested next item from the board

**Stop here.** User reviews the PR. Post-PR workflow (merge, close, board update) is handled by `/feature-end`.

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

**Never invoke `/simplify`** — it is too costly for routine features and redundant with `/pr-review-v2`'s code quality checks. Only run it if the user explicitly asks.
