# Session 3 — Project Dashboard Settings Affordance (#450)

**Date:** 2026-05-03  
**Issue:** [#450 feat: project dashboard — Settings affordance + actions column parity](https://github.com/mironyx/feature-comprehension-score/issues/450)  
**PR:** [#459](https://github.com/mironyx/feature-comprehension-score/pull/459)  
**Branch:** `feat/project-dashboard-settings-affordance` (worktree)

## Work completed

Implemented two bundled stories from the v11 rev 1.3 batch:

**Story 1.3 (Settings affordance):** Replaced the faint `text-secondary` inline Settings link in `projects/[id]/page.tsx` with an icon-and-label secondary button (`border border-border h-9`) placed in the `PageHeader` action slot alongside "New Assessment". Added `Settings` from `lucide-react` with `aria-label="Project settings"` for accessibility.

**Story 2.2 (Actions column parity):** Replaced `<AssessmentOverviewTable assessments={...} />` with `<DeleteableAssessmentTable initialAssessments={...} />` (no `showProjectColumn` prop — project context is implicit on the project dashboard).

### Files changed

- `src/app/(authenticated)/projects/[id]/page.tsx` — main source change (26 insertions, 23 deletions)
- `tests/app/(authenticated)/projects/[id]/page.test.ts` — 9 new BDD specs (Settings affordance + actions column)
- `tests/app/(authenticated)/projects/dashboard-page.test.ts` — 1 assertion updated (action slot now always non-null)
- `tests/evaluation/project-dashboard-settings-affordance.eval.test.ts` — 2 evaluator adversarial tests

### Commits

- `feat: project dashboard — Settings affordance + actions column parity #450`

## Decisions made

**Server component test strategy:** Assertions use `JSON.stringify(result).toContain(...)` rather than mock call counts. When a Next.js server component calls `React.createElement(Fn, props)`, it creates a React element descriptor without invoking `Fn`. Props are serialisable and visible in JSON output; mock function call counts are always 0. This was the root cause of 5 initially failing tests that used `mockFn.toHaveBeenCalled()`.

**`vi.fn()` not needed for stub mocks:** Changed `DeleteableAssessmentTable` mock from `vi.fn(() => null)` to plain `() => null` since it is never called in server component tests. Using `vi.fn()` for uncallable stubs creates misleading affordance.

**Action slot always non-null:** Settings + New Assessment links are always present in the header action slot for all roles. Only `DeleteButton` is gated behind `isAdmin`. Updated pre-existing test in `dashboard-page.test.ts` that expected `'"action":null'` for Repo Admin.

**lld-sync skipped:** 26 src lines changed (< 30-line threshold). LLD pending-changes sections for Stories 1.3 and 2.2 were implemented as specified without deviation.

## Review outcome

PR review (Agent): **clean** — no blockers, no warnings.

## CI outcome

- Lint & Type-check: **PASS**
- Integration tests (Supabase): **PASS**
- Unit tests: **FAIL** (all pre-existing failures confirmed via `git stash` before my branch; zero new failures introduced)

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-read) |
|-------|------|---------------------------|
| PR creation | $4.57 | 2,809 / 72,141 / 8,062,838 |
| Final total | $5.97 | 4,142 / 89,268 / 10,620,184 |
| **Delta (post-PR)** | **$1.40** | +1,333 / +17,127 / +2,557,346 |

### Cost drivers

1. **Context compaction** — session hit context limit; re-summarisation added cache-write overhead. High impact. Trigger: large test file from evaluator agent + pr-review agent running in same context.

2. **Server component test fix loop** — 5 tests initially failed (wrong assertion strategy). 3 rounds of diagnosis + rewrite before green. Medium impact.

3. **Test placement error** — test-author agent wrote test file to main repo instead of worktree; manual `cp` + `rm` required. Low impact but avoidable.

### Improvement actions

- **Server component testing:** For future tests on `page.tsx` server components, brief the test-author explicitly: "assert via `JSON.stringify(result).toContain(...)` — component functions are never called by `React.createElement`". Prevent the mock-call-count anti-pattern at authorship time.
- **Worktree agent isolation:** When spawning the test-author sub-agent for a feature in a worktree, pass the absolute worktree path explicitly so it writes to the correct location.
- **PR size:** This PR was 26 src lines (well under 200) — no compaction pressure from the feature itself. Compaction was driven by multiple large agent contexts (evaluator + pr-review) accumulating in the same session.

## Next steps

- Resolve pre-existing unit test failures (separate investigation — not introduced by this PR)
- Continue v11 rev 1.3 batch: issues #451, #452, #453, #454 (already in flight on other branches)
