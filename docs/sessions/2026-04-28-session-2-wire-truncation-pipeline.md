# Session Log — 2026-04-28 — Session 2

**Issue:** #329 feat: wire truncation into artefact pipeline (V5 Story 1.2)
**PR:** [#383](https://github.com/mironyx/feature-comprehension-score/pull/383)
**Branch:** `feat/feat-wire-truncation-pipeline`
**Session ID:** `9d86bdc9-e7d0-47f3-a3a3-f17f53b53a5b`

---

## Work Completed

### Implementation

- Extended `TruncationOptions` with `strategy?: 'agentic' | 'static'` field.
- Added `buildTruncationOptions(contextLimit, questionCount, toolUseEnabled)` exported helper — computes `tokenBudget = Math.floor(contextLimit * 0.8)` and selects strategy from org retrieval settings.
- Added `estimateArtefactSetTokens(set)` exported helper — sums all content fields; used for before/after token logging.
- Added `processDiffAndFiles` private helper (extracted for 20-line budget compliance) — groups file-importance sort with strategy dispatch.
- Static mode: diff dropped entirely when over threshold (`'Code diff omitted — file contents preserved'` appended to `truncation_notes`).
- Agentic mode: existing mid-stream diff truncation preserved.
- File importance sort: `file_contents` pre-sorted by `(additions + deletions)` descending before drop loop.
- `extractArtefacts` now calls `loadOrgRetrievalSettings` (added to existing `Promise.all`), then `buildTruncationOptions`, then `truncateArtefacts`. Returns `{ assembled, contextLimit, tokenBudget, rawTokens }`.
- `logArtefactSummary` now logs `tokenBudget`, `contextLimit`, `rawTokens`, `assembledTokens`, and `truncationNotes`.
- Hardcoded `token_budget_applied: false` removed.
- Removed `classifyArtefactQuality` import from `service.ts` (handled inside `truncateArtefacts`).

### Tests

- 56 tests across 3 files: `tests/app/api/fcs-service-truncation.test.ts` (new), `tests/lib/engine/prompts/truncate.test.ts` (extended), `tests/evaluation/wire-truncation-pipeline.eval.test.ts` (adversarial).
- Regression fix: `tests/evaluation/comprehension-depth-story-2-2.eval.test.ts` needed mocks for `loadOrgRetrievalSettings` and `getModelContextLimit` (new deps added to `extractArtefacts`); `waitForGenerate` timeout bumped 50ms → 200ms.

### Post-PR Review Fixes (3 warnings addressed)

1. `generateRubric` mock missing `observability` field — added to prevent silent pipeline failure path.
2. `tokenBudget` was recomputed inline in `logArtefactSummary` — threaded from `buildTruncationOptions` instead to avoid formula divergence.
3. `truncate.ts` missing `// Design reference` header and `processDiffAndFiles` missing `// Justification:` comment — both added.

### User-requested addition (post-PR)

Added before/after token count logging: `rawTokens` (before truncation) and `assembledTokens` (after) both appear in the artefact summary log entry.

---

## Decisions Made

- **Default strategy is `'agentic'`** (not `'static'` as the LLD draft suggested) — backward compatibility with all pre-existing callers that omit the field. `buildTruncationOptions` always passes an explicit value, so the default is rarely hit.
- **`processDiffAndFiles` extraction** — not in LLD spec; extracted solely to keep `truncateArtefacts` body under 20 lines. Justified with inline comment.
- **`loadOrgRetrievalSettings` called twice** per pipeline run (once in `extractArtefacts` for strategy, once in `runGeneration` for tools/timeout). Flagged as deferred — it is the pre-existing pattern and fixing it requires restructuring the `runGeneration` call graph.
- **`rawTokens` threaded via `FinaliseRubricParams`** — LLD showed `extractArtefacts` returning only `assembled`; extended return type keeps the data near its origin without re-computing.

---

## LLD Sync

Updated `docs/design/lld-v5-e1-token-budget.md §Story 1.2`:
- Corrected default strategy comment (`'static'` → `'agentic'`).
- Corrected test file path (`tests/api/fcs/` → `tests/app/api/`).
- Updated `extractArtefacts` return type to show actual shape.
- Added `estimateArtefactSetTokens` and `processDiffAndFiles` to decomposition.
- Documented actual `logArtefactSummary` fields.

---

## Next Steps

- Issue #330: Surface truncation details on assessment results (Story 1.3) — DB columns, `finalise_rubric` RPC update, `TruncationDetailsCard` component, results page integration.

---

## Cost Retrospective

| Snapshot | Cost | Notes |
|----------|------|-------|
| At PR creation | $6.06 | 33 min wall time |
| Final total | $9.41 | +$3.35 post-PR |

**Post-PR delta ($3.35):** review fixes (2 commits), token-logging addition, lld-sync, feature-end.

### Cost drivers

| Driver | Evidence | Impact |
|--------|----------|--------|
| Context compaction (×2) | Session summary in conversation preamble; draft log shows snapshots at turns ~160 and ~263 | High — each compaction re-summarises ~160 turns of context, inflating cache-write tokens |
| 15 agent spawns | Draft log: test-author, 8 verification runs, evaluator, 2 review agents, CI probe, re-run after fixes | Medium — each spawn re-sends the full diff |
| Regression from new deps | `comprehension-depth-story-2-2.eval.test.ts` needed 3 fix rounds before mocks worked | Medium |
| Eval adversarial tests | `feature-evaluator` wrote 2 adversarial tests for AC-6 (token logging) | Low |

### Improvement actions

1. **Context compaction:** Keep Story 1.x PRs under 200 src lines (this was ~56 lines — compaction was triggered by the total conversation length including design reading, not code size). Consider `/compact` proactively after Step 5 verification.
2. **Regression from new deps:** When adding a new call inside a shared helper (`extractArtefacts`), grep for all eval tests that exercise that helper and pre-emptively add mocks. The pattern is predictable — a checklist item in the feature-core prompt would catch it.
3. **Double `loadOrgRetrievalSettings` call:** Address in Story 1.3 or a future refactor — memoising the settings fetch inside the pipeline run would save one DB round-trip per rubric generation.
