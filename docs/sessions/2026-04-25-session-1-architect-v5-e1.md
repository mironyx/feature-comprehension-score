# Session Log — 2026-04-25 Session 1: Architect V5 E1

## Skill

`/architect`

## Scope

V5 Epic 1: Model-Aware Token Budget Enforcement — all 3 stories.

## What Was Done

### Design artefacts produced

| Artefact | Path / ID |
|----------|-----------|
| LLD | `docs/design/lld-v5-e1-token-budget.md` |
| Epic issue | #327 |
| Task: Story 1.1 (model context limit lookup) | #328 |
| Task: Story 1.2 (wire truncation into pipeline) | #329 |
| Task: Story 1.3 (surface truncation details) | #330 |

### Key design decisions

1. **New adapter module `src/lib/openrouter/model-limits.ts`** — fetches and caches `context_length` from OpenRouter's `GET /api/v1/models` endpoint. Falls back to 130K on failure. Module-level `Map` cache (no external dependency).

2. **Wiring point is `extractArtefacts()`** — the change is surgical: replace the manual `AssembledArtefactSet` assembly (line 563-564 of `service.ts`) with a call to `truncateArtefacts()`. The existing function already handles priority ordering, quality classification, and note generation.

3. **DB persistence via existing `finalise_rubric` RPC** — add two params (`p_token_budget_applied`, `p_truncation_notes`) with `DEFAULT NULL` for backwards compatibility. No new RPC needed.

4. **UI follows `RetrievalDetailsCard` pattern** — new `TruncationDetailsCard` component, rendered above retrieval details in `AdminAggregateView`. Conditionally shows retrieval recommendation when truncation occurred but retrieval was not enabled.

### Decomposition

No splits needed. All 3 stories are under the 200-line PR threshold individually. Strictly sequential: #328 -> #329 -> #330.

## Decisions / ADRs

No new ADRs needed. Existing ADR-0015 (OpenRouter) and ADR-0023 (tool-use loop) cover the relevant decisions.

## Open Questions

From requirements — OQ#1 (truncation priority for epic issue bodies vs PR content) — deferred. Current priority ordering is reasonable; can be revisited after observing real truncation behaviour.

## Next Steps

1. Human reviews LLD and issues.
2. `/feature` for #328 (Story 1.1), then #329, then #330.
