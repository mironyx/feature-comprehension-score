# Session 2 — Restore polling badge on assessment-detail admin view (#444)

**Date:** 2026-05-03
**Issue:** [#444](https://github.com/mironyx/feature-comprehension-score/issues/444)
**PR:** [#448](https://github.com/mironyx/feature-comprehension-score/pull/448)
**Branch:** `feat/fix-polling-rubric-generation`

## Work completed

Regression fix: `AssessmentAdminView` was rendering a static `<StatusBadge>` for all statuses, including `rubric_generation`, so the admin detail page did not auto-update while the rubric job ran. The admin had to manually refresh to see the terminal status.

**Changes:**

- `src/app/(authenticated)/projects/[id]/assessments/[aid]/assessment-admin-view.tsx` — imported `PollingStatusBadge` from `@/app/(authenticated)/assessments/polling-status-badge`; added a conditional that renders `PollingStatusBadge` when `assessment.status === 'rubric_generation'` and falls back to `StatusBadge` for all other statuses. Pattern is identical to `assessment-overview-table.tsx:96–98`.
- `tests/app/(authenticated)/projects/[id]/assessments/[aid]/role-based-rendering.test.ts` — added mock for `PollingStatusBadge` (renders a `<span className="polling-status-badge-mock">` to keep tests free of hooks); added BDD tests A9 (`PollingStatusBadge` rendered for `rubric_generation`), A10 (`StatusBadge` rendered for `awaiting_responses` and `rubric_failed`). Final test count: 27/27.

**Commits:**
1. `fix: restore PollingStatusBadge on assessment-detail admin view for rubric_generation #444`
2. `fix: add justification comment for PollingStatusBadge branch (LLD §T2 pre-dates #444)`
3. `fix: review feedback — issue ref, rubric_failed test, eslint-disable rationale #444`

## Decisions made

- **`initialStatus` hardcoded as `"rubric_generation"`** — matches the established pattern in `assessment-overview-table.tsx:97`. Semantically correct: the branch only executes when the status IS `rubric_generation`. Reviewer raised it as a warning; deferred with rationale.
- **`PollingStatusBadge` mock in tests** — used `vi.mock` with `React.createElement` returning a `<span className="polling-status-badge-mock">`. Avoids needing to mock `useStatusPoll`/`useEffect`/`useRouter` chains while keeping tests meaningful. The `require('react')` in the factory required an `eslint-disable` with inline rationale.
- **lld-sync skipped** — 8 src lines changed, pure bug fix. The LLD §T2 design reference in the source file was annotated with a `{/* Justification: ... */}` JSX comment to satisfy design-conformance review.

## Review feedback addressed

- **Pass 1 blocker:** Missing `// Justification:` comment for LLD §T2 deviation → added inline JSX comment.
- **Pass 2 warnings (3 fixed):**
  - Added `rubric_failed` test case to complement `awaiting_responses` in A10
  - Updated file header from `// Issue: #364` to `// Issue: #364, #444`
  - Added inline rationale to `eslint-disable-next-line` comment
- **Pass 2 warning (1 deferred):** Hardcoded `initialStatus="rubric_generation"` — matches existing pattern, deferred.

## CI outcome

First three jobs (lint, types, unit tests, integration tests) all passed. E2E and Docker jobs cancelled due to GitHub Actions infrastructure issue (npm cache HTTP 400) — not a code defect.

## lld-sync

Skipped — small bug fix (8 src lines, no new exports, no architectural change).

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-r/cache-w) |
|---|---|---|
| At PR creation | $0.98 | 1,049 / 11,323 / — / — |
| Final total | $1.28 | 1,076 / 14,164 / 2,458,755 / 112,698 |
| Delta (post-PR) | $0.30 | — |

**Cost drivers:**

- **Two review passes** ($0.30 delta): First pass caught a missing justification comment; second pass found 4 warnings. Three were quick fixes. Each review pass re-reads the full diff.
- **No RED cycles:** Tests passed on the first run. No fix loops.
- **Mock complexity:** The `vi.mock` factory pattern for a `'use client'` component required one iteration to get right (the `require('react')` approach), but was resolved without extra agent spawns.

**Improvement for next time:**

- When a source file has a `// Design reference:` header and the change is outside the original LLD scope, add the `{/* Justification: */}` comment as part of the initial implementation (not as a review-fix commit). This would eliminate the first review blocker.
