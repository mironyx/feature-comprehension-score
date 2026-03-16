---
name: feature
description: Autonomously implement the next feature from the project board. Picks the top Todo item, creates a branch, implements with TDD, reviews, runs diagnostics, commits, and creates a PR. Only pauses for real blockers.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature — Autonomous Implementation Cycle

Implements a single feature end-to-end without user intervention unless blocked.

**Pre-requisite:** The issue's design document (LLD, design doc section, or ADR) must be complete. If not, stop and tell the user.

## Process

Execute these steps sequentially. Do not skip steps. Do not ask for confirmation between steps — only pause if a step fails after remediation attempts.

### Step 1: Pick the work item

If `$ARGUMENTS` contains an issue number, use that. Otherwise:

1. Run `gh project item-list 1 --owner leonids2005 --format json` and find the **top Todo item** (first item with `status: "Todo"`).
2. Read the issue body: `gh issue view <number>`.
3. **Validate the issue has enough context:**
   - Design doc or LLD section reference
   - BDD test specs or acceptance criteria
   - If missing, stop and report: "Issue #N lacks [missing item]. Cannot proceed autonomously."

### Step 2: Set up the branch

1. Ensure you are on `feat/assessment-engine` (or the correct integration branch) and it is up to date: `git checkout feat/assessment-engine && git pull`.
2. Create a feature branch: `git checkout -b feat/<short-description-from-issue>`.
3. Move the issue to In Progress: `./scripts/gh-project-status.sh <number> "in progress"`.

### Step 3: Read design context

1. Read all files referenced in the issue body (design docs, LLDs, type files, related source).
2. Read any existing source files in the target directory.
3. Understand the contract: inputs, outputs, types, error cases.

### Step 4: Implement with TDD

Follow strict Red-Green-Refactor. One test at a time.

For each behaviour in the BDD spec from the issue:

1. **RED** — Write a failing test. Run `npx vitest run <test-file>`. Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. Run tests again. Confirm green.
3. **REFACTOR** — Clean up if needed. Tests must stay green.

Continue until all acceptance criteria are covered.

### Step 5: Full verification

Run all three checks. All must pass before proceeding.

```bash
npx vitest run          # all tests green
npx tsc --noEmit        # no type errors
npm run lint            # no lint errors
```

If any fail, fix and re-run. If stuck after 3 attempts on the same failure, pause and report.

### Step 6: Review

Run `/review` on the current changes. Fix any findings and re-run Step 5 after fixes.

If `/review` raises design conformance issues (field names, types, schemas don't match the design doc), check whether the design or the implementation is wrong:
- If the implementation is wrong, fix it.
- If the design is outdated, update the design doc in the same branch.

### Step 7: Diagnostics

Run `/diag` to check VS Code extension diagnostics.

- Fix any Errors or Warnings.
- Info-level items: fix if straightforward, otherwise note for the PR description.
- Re-run Step 5 after any fixes.

### Step 8: Commit

Stage and commit with a conventional commit message referencing the issue number:

```bash
git add <specific-files>
git commit -m "feat: <description> #<issue-number>"
```

One commit per issue. Do not batch multiple issues.

### Step 9: Push and create PR

```bash
git push -u origin feat/<branch-name>
```

Create the PR targeting the integration branch:

```bash
gh pr create --title "<short title>" --base feat/assessment-engine --body "$(cat <<'EOF'
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
EOF
)"
```

### Step 10: Report

Summarise what was done:
- Issue number and title
- Branch and PR link
- Tests added / total
- Any warnings or notes (PR size, diagnostics findings, design drift)
- Suggested next item from the board

**Stop here.** User reviews the PR. Post-PR workflow (merge, close, board update) is a separate process.

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
