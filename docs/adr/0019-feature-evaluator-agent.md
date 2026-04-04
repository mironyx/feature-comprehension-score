# 0019. Feature Evaluator Agent

**Date:** 2026-04-04
**Status:** Accepted
**Deciders:** LS / Claude

## Context

The `/feature` pipeline currently has two quality gates after implementation:

1. **`/diag`** — checks code health via CodeScene/SonarLint diagnostics
2. **`/pr-review-v2`** — static code review of the diff (bugs, design principles, conventions)

Neither gate verifies that the implementation actually satisfies its acceptance criteria.
The code review asks "is this code correct?" but not "does this deliver what the spec
promised?" This gap maps directly to the self-congratulation problem described in the
Medium article: the same agent writes code and tests from the same context.

Anthropic's harness engineering article for long-running apps describes a three-agent
architecture (Planner → Generator → Evaluator) where the evaluator is a separate agent
that tests the completed work against predetermined criteria. The key insight: separating
the agent doing the work from the agent judging it is a strong lever against
self-evaluation bias.

## Options Considered

### Option 1: Extend `/pr-review-v2` with evaluation checks

Add acceptance-criteria verification to the existing review agents.

- **Pros:** No new agent; lower per-feature cost.
- **Cons:** Muddies the review agent's purpose. Review reads the diff; evaluation needs
  full source files. Shared context defeats the separation principle.

### Option 2: Standalone evaluator agent in `/feature-core`

A separate agent spawned after `/diag` and before PR creation. Reads the LLD, maps
criteria to test coverage, writes adversarial tests, reports pass/fail per criterion.

- **Pros:** Independent context (no access to implementation session reasoning). Runs
  before the PR exists, so gaps are fixed before review. Adversarial tests persist as
  regression protection. Clear separation of concerns.
- **Cons:** Additional cost per feature (~$0.30–0.50). Adds wall-clock time to the
  feature cycle.

### Option 3: Separate test-writing agent (split TDD)

Move all test writing to a different agent from the implementer. The implementer writes
code; a test agent writes tests from the spec.

- **Pros:** Maximum separation.
- **Cons:** Breaks the TDD cycle (tests must exist before implementation). High
  coordination overhead. Premature for current project phase.

## Decision

**Option 2: Standalone evaluator agent.**

The evaluator runs as Step 6b in `/feature-core`, between `/diag` (Step 6) and commit
(Step 7). It reads the LLD acceptance criteria, maps them to existing test coverage,
writes adversarial tests for gaps, runs the full suite, and reports a structured verdict.

If the verdict is FAIL, the generator fixes the gaps before creating the PR.

## Consequences

- Every feature gets an independent verification pass before PR creation.
- Adversarial test files (`tests/evaluation/*.eval.test.ts`) accumulate as regression
  protection — they are committed alongside the feature code.
- Per-feature cost increases by ~$0.30–0.50 (Sonnet model).
- `/pr-review-v2` remains unchanged — it checks code quality, the evaluator checks
  correctness against the spec. Orthogonal concerns.
- Option 3 (split TDD) remains a future evolution if the evaluator proves the separation
  principle works well in practice.
