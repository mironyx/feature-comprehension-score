---
description: Autonomously implement the next feature from the project board. Picks the top Todo item, creates a branch, implements with TDD, runs diagnostics, commits, creates a PR, runs pr-review and fixes any findings, then reports. Only pauses for real blockers.
---

# Feature — Autonomous Implementation Cycle

Implements a single feature end-to-end without user intervention unless blocked.

**Usage:**
- `/feature` — picks the top Todo item from the project board
- `/feature 123` — works on issue #123 specifically

**Pre-requisite:** The issue's design document (LLD, design doc section, or ADR) must be complete. If not, stop and tell the user.

Note: OTEL session cost tracking is not available in Windsurf — the PR body will have Usage section omitted.

## Process

Execute these steps sequentially. Do not skip steps. Do not ask for confirmation between steps — only pause if a step fails after remediation attempts.

### Step 1: Pick the work item

If an issue number was provided in the user's message, use that. Otherwise:

```powershell
gh issue list --label L5-implementation --state open --limit 1
```

Read the issue body:
```powershell
gh issue view <number>
```

**Validate the issue has enough context:**
- Design doc or LLD section reference
- BDD test specs or acceptance criteria
- If missing, stop and report: "Issue #N lacks [missing item]. Cannot proceed autonomously."

### Step 2: Set up the branch

Derive a short slug from the issue title (e.g., issue #123 "Add scoring engine" → `scoring-engine`).

Fetch the integration branch and create a new branch from it:
```powershell
git fetch origin main
git checkout -b feat/<slug> origin/main
```

Move the issue to In Progress:
```powershell
./scripts/gh-project-status.sh <number> "in progress"
```

### Step 3: Read design context

1. Read all files referenced in the issue body (design docs, LLDs, type files, related source).
2. Read any existing source files in the target directory.
3. Understand the contract: inputs, outputs, types, error cases.

### Step 4: Implement with TDD

Follow strict Red-Green-Refactor. One test at a time.

For each behaviour in the BDD spec from the issue:

1. **RED** — Write a failing test. Run:
   ```powershell
   npx vitest run <test-file>
   ```
   Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. Run tests again. Confirm green.
3. **REFACTOR** — Clean up if needed. Tests must stay green.

Continue until all acceptance criteria are covered.

### Step 5: Full verification

Run all checks. **All must pass — zero failures — before proceeding.**

```powershell
npx vitest run
```
```powershell
npx tsc --noEmit
```
```powershell
npm run lint
```

**Integration test failures are not pre-existing — fix them.** Do not dismiss `*.integration.test.ts` failures as unrelated.

If E2E tests exist (`tests/e2e/` is non-empty), also run:
```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"; $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="placeholder"; $env:SUPABASE_SECRET_KEY="placeholder"; npm run build; npx playwright test
```

If any fail, fix and re-run. If stuck after 3 attempts on the same failure, pause and report.

### Step 6: Diagnostics (blocking gate)

Run the `/diag` workflow on all files changed in this cycle. This is a **blocking gate**.

1. Run `/diag` on all changed files.
2. Fix all findings. **Exception: ignore smells on generated files** (e.g. `supabase/migrations/`).
3. Re-run `/diag`.
4. Repeat until `/diag` reports zero findings on non-generated files.
5. Re-run Step 5 after any fixes.

Only proceed to Step 7 when `/diag` reports zero findings on non-generated files.

### Step 7: Commit

Stage and commit with a conventional commit message referencing the issue number:

```powershell
git add <specific-files>
git commit -m "feat: <description> #<issue-number>"
```

One commit per issue. Do not batch multiple issues.

### Step 8: Push and create PR

```powershell
git push -u origin feat/<branch-name>
```

Create the PR:

```powershell
gh pr create --title "<short title>" --base main --body @"
## Summary
<1-3 bullet points of what was implemented>

## Issue
Closes #<number>

## Design reference
<path to design doc section>

## Test plan
- [ ] ``npx vitest run`` — all tests pass
- [ ] ``npx tsc --noEmit`` — clean
- [ ] ``npm run lint`` — clean
- [ ] Design contracts verified (field names, types, schemas match)

## Verification
- **Tests added:** N
- **Total tests:** N (M test files)
"@
```

Note the PR number from the output.

### Step 8b: CI — monitor in background

After the PR is created, check CI status:
```powershell
gh run list --limit 3
```

Continue with Step 9 immediately. Check back on CI after review is complete. If CI fails, fix the root cause, push, and note in the Step 10 report.

### Step 9: Review

Run the `/pr-review` workflow on the PR just created, passing the PR number.

Triage each finding:
- **Blocker / correctness issue** — fix it: update code, re-run Step 5, add a commit, push.
- **Design contract mismatch** — check whether design or implementation is wrong; fix accordingly.
- **Non-blocking suggestion** — decide whether worth fixing now or deferring. Note deferrals in Step 10.
- **Style / minor** — fix if trivial; otherwise note and move on.

After any fixes, re-run `/pr-review <pr-number>` to confirm no new issues.

### Step 10: Report

Summarise what was done:
- Issue number and title
- Branch and PR link
- Tests added / total
- Review outcome: what was found, what was fixed, what was deferred
- CI outcome: pass / fail / pending
- Any warnings or notes (PR size, diagnostics findings, design drift)
- Suggested next item from the board

**Stop here.** User reviews the PR. Post-PR workflow is handled by `/feature-end`.

**DO NOT** move the board item to `done`. Leave it at `in progress`.

## Blocker policy

**Pause and report** if:
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
