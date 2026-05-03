# Session Log — 2026-05-03 Session 1 — Issue #441

Session ID: `76c3ab5f-d6aa-4970-9f0b-d0ec3fd0329b`

## Issue

**#441** — fix+feat: project dashboard reuses AssessmentOverviewTable; org overview adds project column + filter

## Work completed

- Deleted `src/app/(authenticated)/projects/[id]/assessment-list.tsx` (bespoke card list that violated Story 2.2 AC 1 / HLD non-responsibility clause).
- Added `project_name: string | null` to `AssessmentListItem` and `toListItem`; `loadOrgAssessmentsOverview` SELECT extended with LEFT JOIN `projects(name)`.
- Added `showProjectColumn?: boolean` prop to `AssessmentOverviewTable` with inline `buildProjectList`/`renderProjectFilter` helpers; client-side project filter hidden when ≤ 1 distinct project.
- `page.tsx` (project dashboard) now fetches FCS rows inline via `loadProjectAssessments` and renders `<AssessmentOverviewTable>`; empty-state CTA preserved.
- `DeleteableAssessmentTable` and org overview `page.tsx` forward `showProjectColumn` through to `AssessmentOverviewTable`.
- `partition.ts` comment updated to remove stale reference to deleted `assessment-list.tsx`.
- 24 tests added (17 unit + 7 eval); 2148 total tests all passing.
- PR #443 created; CI passed.
- Post-PR review (3 parallel agents) found 1 blocker: `renderRow` emitted cells as Feature → Repository → Project when `showProjectColumn=true`, mismatching header order. Fixed in commit f54be00.
- LLD synced (§B.9, version 0.6 → 0.7); coverage manifest `REQ-fcs-scoped-to-projects-project-scoped-assessment-list` flipped to `Implemented`.

## Decisions made

- **ProjectFilter not reused.** The spec said to "reuse `ProjectFilter` shape from `project-filter.tsx`" but that file is a full React component. Inline helpers keep `AssessmentOverviewTable` self-contained and avoid coupling to the `/assessments` page's component.
- **Named `loadProjectAssessments` function** instead of anonymous inline code — needed for line-limit compliance (≤ 25 lines per route handler body).
- **`projects(name)` LEFT JOIN on project dashboard** uses a named constant `ASSESSMENT_SELECT` without a ROW_LIMIT (unlike org overview which caps at 50). Acceptable for project-scoped pages where row counts are naturally bounded by the project.

## Review feedback addressed

- **Blocker (column order):** `renderRow` cell order corrected — Project cell moved before Repository cell to match header declaration order. Caught by two of three review agents independently.

## Cost retrospective

| Stage | Cost |
|-------|------|
| At PR creation | $5.88 |
| Final | $9.31 |
| Post-PR delta | $3.43 |

**Cost drivers:**
1. **Context compaction (2×):** Session ran past context limit twice; re-summarising inflates cache-write tokens. The impl+test cycle was long because the feature touched 6 src files and needed a new test file from the test-author sub-agent.
2. **13 agent spawns:** test-author, evaluator, 3× pr-review, 2× full verification, ci-probe, and several single-file vitest runs. Each re-sends the full diff.
3. **Post-PR blocker fix:** The column order bug required a fix commit + re-run of full verification — ~$1 overhead.

**Improvements for next time:**
- Validate cell order against header order in the test-author BDD specs upfront (add as a property: "cells are emitted in the same order as headers"). Would have caught this before PR.
- When adding a `showProjectColumn` conditional that inserts a column in the middle of a row, the test-author should enumerate the exact cell sequence, not just "Project column header present".

## Next steps

- Epic #409 remaining: E11.3 (project context config settings page), E11.4 (admin My Assessments NavBar link — #438, designed).
- `#438` is the top designed task on the board.
