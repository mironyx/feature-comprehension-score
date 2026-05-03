# Session: Remove stale Back to Organisation link — issue #445

**Date:** 2026-05-03
**Issue:** [#445 fix: assessment-detail admin view — replace stale 'Back to Organisation' link](https://github.com/mironyx/feature-comprehension-score/issues/445)
**PR:** [#447](https://github.com/mironyx/feature-comprehension-score/pull/447)
**Branch:** `feat/fix-back-link-admin-view`

---

## Work completed

- Deleted lines 23-25 from `src/app/(authenticated)/projects/[id]/assessments/[aid]/assessment-admin-view.tsx` — the `<a href="/organisation">← Back to Organisation</a>` element that was a V10 remnant.
- Inverted test A3 in `tests/app/(authenticated)/projects/[id]/assessments/[aid]/role-based-rendering.test.ts` from asserting the link's presence to asserting its absence (regression for #445).
- All 2148 tests pass, tsc clean, lint clean, code health 10.0, CI green on all 5 jobs.

## Decisions made

- **No replacement link** — Design Principle 8: breadcrumbs (Story 4.3) already provide project-scoped navigation from the parent page. Adding a new inline link would duplicate the nav pattern.
- **lld-sync skipped** — change is 3 deletions in one file (< 30 src lines). The LLD drift (§T2 still documents the now-removed link) is minor; flagged in the PR review comment for future reference.

## Review findings

- 1 warning: `docs/design/lld-v8-assessment-detail.md §T2` still mandates the removed link. Pre-V11 drift — no code fix needed. Will be resolved when the LLD is next synced.

## Cost retrospective

- **At PR creation:** $0.58 (1,015 input / 5,729 output / 1,135,715 cache-read / 56,815 cache-write)
- **Final total:** $1.04 (1,051 input / 12,240 output / 1,896,735 cache-read / 100,824 cache-write)
- **Post-PR delta:** ~$0.46 — spent on pr-review-v2 (single agent), CI probe, and feature-end steps.

### Cost drivers

- Simple deletion with no new code paths — minimal fix cycles.
- Post-PR cost is proportionally high (79% of total) due to pr-review + feature-end overhead on a near-zero implementation.
- For future micro-fixes (< 5 lines), consider whether full pipeline overhead is warranted vs a direct commit.

## Next steps

- Issue #444 (restore polling during rubric_generation) and #446 (add breadcrumbs to results and submitted pages) are in progress in parallel.
