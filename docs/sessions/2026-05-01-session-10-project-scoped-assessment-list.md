# Session 10 — Project-Scoped Assessment List (#414)

**Date:** 2026-05-01
**Issue:** [#414 — feat: project-scoped assessment list on /projects/[pid] (V11 E11.2 T2.5)](https://github.com/mironyx/feature-comprehension-score/issues/414)
**PR:** [#425 — feat: project-scoped FCS assessment list on /projects/[id]](https://github.com/mironyx/feature-comprehension-score/pull/425)
**Branch:** `feat/v11-e11-2-t2-5-project-scoped-list`
**LLD:** `docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.5`

_Session recovered from crashed teammate (original session: `032b9872-1ff5-464a-a9ca-05a5504a56b1`)._

---

## Work completed

Replaced the placeholder assessment slot on the project dashboard (`/projects/[id]`) with a
real `AssessmentList` server component, scoped strictly to `project_id` and `type='fcs'`.

**Files created / modified:**

- `src/app/(authenticated)/projects/[id]/assessment-list.tsx` (new) — async RSC querying
  assessments by `project_id` + `type='fcs'`, partitioning into pending/completed via the
  existing `partitionAssessments` helper, rendering with a private `AssessmentRow` helper.
  Empty state shows "Create the first assessment" CTA.
- `src/app/(authenticated)/projects/[id]/page.tsx` — replaced placeholder with
  `<AssessmentList projectId={id} />`.
- `tests/app/(authenticated)/projects/[id]/assessment-list.test.ts` (new) — 18 tests covering
  all observable contract properties via vi.mock + JSON.stringify assertions on RSC output.

---

## Decisions made

**Reused `partitionAssessments` helper** from the existing assessments page rather than
re-implementing status-based routing logic. This was implied by the LLD ("reuse the existing
list shape") and kept the status → link mapping consistent across the app.

**Extracted `AssessmentRow` as a file-private helper** to avoid duplicating the Card+Link
markup in the two `.map()` calls (pending and completed). Not shared across files — purely
for deduplication within the module.

**`type` removed from SELECT**: The LLD included `type` in the SELECT string, but `AssessmentItem`
does not include `type` as a field — adding it created a TypeScript type mismatch at the cast
site. The `.eq('type', 'fcs')` filter is sufficient. Added `rubric_error_retryable` and
`project_id` to SELECT, which `AssessmentItem` does require.

**18 tests vs 5 BDD specs**: The test-author agent enumerated all observable properties of the
component contract (not just the 5 issue BDD specs), resulting in more comprehensive coverage.

---

## Review feedback addressed

PR review (via `/pr-review-v2`) flagged two issues:

1. **`type` in SELECT but not in `AssessmentItem`** (correctness) — Removed `type` from the
   SELECT string. Addressed in a fixup commit before the PR was approved.
2. **Silent `data ?? []` without explanation** (observability) — Added an inline comment:
   `// error is not destructured; a DB failure renders as empty state — server logs carry the detail`.

---

## CI outcome

**FAIL** — but both failing test suites are pre-existing, unrelated to this PR:
- `createFcs is not a function` in `fcs-*.test.ts` (103 known failures, also failing on `main`).
- `useRouter` null context in `polling-badge-behaviour.test.ts` (also failing on `main`).

All 18 new tests pass. Lint and type-check are clean.

---

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-read/cache-write) |
|-------|------|----------------------------------------|
| PR creation | $2.72 | 973 / 40,443 / 4,358,186 / 252,848 |
| Final total | $5.54 | 8,044 / 80,356 / 8,840,790 / 502,841 |
| Post-PR delta | $2.82 | — |

**Cost drivers:**

- **Context compaction** (~$1.5 delta): The original teammate session hit context limits and was
  compacted. The recovery session re-summarised context, inflating cache-write tokens. Impact:
  high. Mitigation: keep PRs under 200 lines; break features that need a test-author agent into
  smaller sub-issues.
- **Test-author agent + PR review agent** (~$1.0): Two sub-agent spawns re-sent the full diff.
  This is expected overhead for a standard-pressure feature.
- **LLD SELECT mismatch** (~$0.3): One fixup commit was required after PR review flagged the
  `type` column in SELECT. The LLD spec should have noted which columns `AssessmentItem` requires
  — a quick `grep AssessmentItem` at LLD-writing time would have caught this.

**Improvement actions:**

- When writing LLD SELECT queries, cross-reference the target TypeScript type (e.g. `AssessmentItem`)
  to ensure the field list matches exactly. A single grep during `/architect` prevents a post-review
  fixup commit.
- For features where a context compaction is likely (test-author agent + PR review in the same
  session), consider breaking the session at the test-author boundary.

---

## Next steps

- Issue #415 — My Pending Assessments cross-project FCS queue + project filter (Wave 3, in parallel
  with this).
- Issue #416 — the coverage manifest and epic wrap-up once all Wave 3 tasks are merged.
