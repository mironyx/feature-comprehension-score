# Session Log — 2026-04-28 Session 3 — #330 Surface Truncation Details

_Session recovered from crashed teammate (original session: `d5ce3b02-1142-4847-886a-439b7e5a20d1`)._

## Summary

Implemented V5 Story 1.3: surfacing truncation details on the assessment results page. Added
`token_budget_applied` and `truncation_notes` columns to the `assessments` table, updated the
`finalise_rubric` RPC to persist them, wired the data through the backend service layer, and
created a new `TruncationDetailsCard` React component rendered above `RetrievalDetailsCard`.

**Issue:** #330
**PR:** [#384](https://github.com/mironyx/feature-comprehension-score/pull/384) — merged
**Branch:** `feat/feat-surface-truncation-details`

---

## Work Completed

### Schema (DB)
- Added `token_budget_applied boolean` and `truncation_notes jsonb` columns to `assessments` table
  in `supabase/schemas/tables.sql`
- Updated the observability overload of `finalise_rubric` in `supabase/schemas/functions.sql` to
  accept `p_token_budget_applied boolean DEFAULT NULL` and `p_truncation_notes jsonb DEFAULT NULL`
  with DEFAULT NULL for backwards compatibility
- Generated migration `supabase/migrations/20260428144145_v5-token-budget-columns.sql` via
  `npx supabase db diff -f v5-token-budget-columns`; applied cleanly via `db reset`
- Manually added new field types to `src/lib/supabase/types.ts` (see Decisions Made below)

### Backend (`src/app/api/fcs/service.ts`)
- Extended `RubricPersistParams` interface with `tokenBudgetApplied: boolean` and
  `truncationNotes: string[] | undefined`
- Updated `persistRubricFinalisation` to pass both fields to the RPC
- Updated `finaliseRubric` to pass `artefacts.token_budget_applied` / `artefacts.truncation_notes`
  through to `persistRubricFinalisation`

### Frontend
- Created `src/components/assessment/TruncationDetailsCard.tsx` — renders when
  `token_budget_applied = true`; lists truncation notes; shows retrieval recommendation when
  `rubric_tool_call_count` is 0 or null
- Added the card to `AdminAggregateView` in results page above `RetrievalDetailsCard`

### Tests
- `tests/components/truncation-details-card.test.ts` — 14 tests covering all 6 BDD specs plus
  edge cases (empty notes array, notes rendered correctly)
- `tests/evaluation/surface-truncation-details.eval.test.ts` — 3 adversarial tests from the
  feature-evaluator agent covering AC-2 (RPC param persistence verification)

---

## Decisions Made

### Manual `types.ts` edit instead of regenerating

`npx supabase gen types typescript --local` downgrades hand-crafted enum literal types (e.g.
`config_comprehension_depth: 'conceptual' | 'detailed'`, `type: 'prcc' | 'fcs'`) to `string`,
causing ~9 TypeScript errors in pre-existing code. Running `git checkout HEAD -- src/lib/supabase/types.ts`
after initial regeneration and then manually appending the two new column types was the correct
approach. The LLD has been updated with this pattern so future DB additions use it by default.

### Pressure tier: Standard (not Light)

The change spanned 4 source files and a DB migration (~56 src lines), triggering the full pipeline
(test-author sub-agent, feature-evaluator). The LLD spec was detailed enough that the test-author
produced 14 tests with complete coverage upfront.

---

## Review Feedback

PR review returned 2 warnings, no blockers — both deferred:

1. **[unspecified-function] `TruncationDetailsCard.tsx:1`** — `QuestionHeader` and `PersonalScoresBlock`
   (imported from results page) not in LLD's internal decomposition — minor LLD gap on shared
   sub-components in the results page file (pre-existing).
2. **[anti-pattern] `results/page.tsx`** — `as unknown as` cast for `truncation_notes` and
   `rubric_tool_calls`. These casts are intentional: Supabase types carry `Json` for JSONB
   columns; the cast is the documented pattern in this codebase.

---

## Next Steps

- Epic #327 (V5 E1) has all three stories complete: #328, #329, #330.
- Tick the parent epic checklist for #330.

---

## Cost Retrospective

| Stage | Cost | Tokens (in/out) |
|-------|------|-----------------|
| PR creation | $4.1535 | 5,995 / 46,045 |
| Post-PR (review, lld-sync, feature-end) | $2.26 | 5,780 / 25,777 |
| **Total** | **$6.41** | **11,775 / 71,822** |

**Cache:** 13,058,495 read / 421,097 write

### Cost drivers

| Driver | Impact | Notes |
|--------|--------|-------|
| Context compaction (crash recovery) | High | Session recovered from crashed teammate — re-summarising inflated cache-write tokens. The post-PR $2.26 delta includes feature-end overhead. |
| `supabase gen types` enum-type issue | Low | One extra fix cycle discovering the type regeneration problem; fixed quickly by restoring original file and doing manual edit. |
| DB port conflict on second `db diff` | Low | Shadow DB container held port 54320; `db reset` had already confirmed clean application so not a real blocker. |

### Improvement actions

- **`supabase gen types` pattern**: now documented in LLD §Story 1.3. For any future story that
  adds DB columns: `db diff` → `db reset` → manual `types.ts` edit (append only). Do not regenerate.
- **Port conflict on second `db diff`**: if a second diff is needed for verification, run
  `docker ps` first to check for orphaned shadow containers from the first run.
