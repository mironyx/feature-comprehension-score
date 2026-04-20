# Session: /architect — Epic 18 Pipeline Observability & Recovery

## Summary

Produced the full design for Epic 18 (Pipeline Observability & Recovery) from the v2 requirements document. Created epic #271 with three task issues (#272 error capture & logging, #273 retry guardrails, #274 progress visibility) and the LLD at `docs/design/lld-e18.md`. The epic is a surgical extension of existing infrastructure — retry route, RetryButton, observability columns, and polling all already exist and are being extended, not replaced.

## Shipped

| Commit | Scope |
|--------|-------|
| `b95bc1b` | `docs/design/lld-e18.md` — full LLD with Part A (flows, structure, invariants) and Part B (schema, decomposition, BDD specs) |

## Board state

| Issue | Title | Status |
|-------|-------|--------|
| #271 | epic: Pipeline Observability & Recovery (E18) | Todo |
| #272 | feat: pipeline error capture & structured logging (E18.1) | Todo |
| #273 | feat: assessment retry guardrails & error display (E18.2) | Todo |
| #274 | feat: pipeline progress visibility (E18.3) | Todo |

## Cross-cutting decisions

- **No new API endpoints.** GET `/api/assessments/[id]` already returns all assessment fields — new columns are automatically included. Retry route is extended, not duplicated.
- **`RubricGenerationError` typed error class** introduced to carry `LLMError` + partial observability from `finaliseRubric` to the `triggerRubricGeneration` catch block. This avoids string-parsing error messages.
- **`finalise_rubric` RPC extended** to clear progress fields on success — keeps the atomic status transition pattern from E17.
- **Stale detection is client-side** — UI compares `rubric_progress_updated_at` against `Date.now()` to avoid server-side timers.

## What didn't go to plan

Nothing — requirements were well-specified with concrete column names, thresholds, and UI labels. No ambiguities required clarification.

## Process notes for /retro

- Requirements doc quality for E18 was excellent — concrete column names, error codes, UI copy, and thresholds all specified. Made the LLD straightforward.
- The `--epics` flag parse from the command line was slightly ambiguous (`-epic` vs `--epics`) but resolved easily.

## Next step

Human reviews `docs/design/lld-e18.md` and the three task issues. Then `/feature` implements Wave 1 (#272 and #274 in parallel), followed by Wave 2 (#273).
