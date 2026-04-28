# Session Log — 2026-04-28 Session 1 — OpenRouter Model Limits (#328)

Session ID: `2e761167-d7bd-41d5-9071-2a04beaefc60`

## Work Completed

**Issue:** #328 — feat: model context limit lookup from OpenRouter (V5 Story 1.1)
**Branch:** `feat/feat-openrouter-model-limits`
**PR:** #382 — <https://github.com/mironyx/feature-comprehension-score/pull/382>

Created `src/lib/openrouter/model-limits.ts`: fetches the full model list from OpenRouter
`GET /api/v1/models/user`, caches it as `Map<string, number>`, and exposes
`getModelContextLimit(modelId)` and `getConfiguredModelId()`.

**Files created/modified:**

| File | Change |
|------|--------|
| `src/lib/openrouter/model-limits.ts` | Created (adapter module) |
| `tests/lib/openrouter/model-limits.test.ts` | Created (15 tests via test-author agent) |
| `tests/evaluation/model-limits.eval.test.ts` | Created (2 adversarial tests — non-2xx branch gap) |
| `tests/setup.ts` | Added `OPENROUTER_API_KEY` fallback env var |
| `src/app/(authenticated)/assessments/use-status-poll.ts` | Removed stale `eslint-disable-next-line` (pre-existing CI failure) |

**Two commits:**
1. `feat: model context limit lookup from OpenRouter #328`
2. `fix: guard OPENROUTER_API_KEY null; remove stale eslint-disable #328`

## Decisions Made

**fetchPromise deduplication (deviation from LLD):** The LLD sketch used a simple
`modelListCache = await fetchModelList()` assignment. This races when two concurrent callers
both see `modelListCache === null` before the first fetch resolves — both issue HTTP requests.
Added `fetchPromise` in-flight guard to deduplicate. Private implementation detail;
exported API unchanged. Required for the `Promise.all` concurrent-call acceptance test (invariant I3).

**`/api/v1/models/user` endpoint confirmed:** PR review flagged this as potentially wrong.
The LLD explicitly specifies this endpoint to get the guardrails-filtered list. Dismissed.

**OPENROUTER_API_KEY guard:** Production guard (`if (!apiKey) return new Map()`) added after
review. Required adding a dummy key to `tests/setup.ts` because the guard fires before MSW
can intercept — without the env var, all tests that expect MSW to respond would get an empty map.

**console.warn on not-found fallback:** The LLD sketch silently returned `?? DEFAULT_CONTEXT_LIMIT`.
Implementation adds `console.warn` so observability is not lost. LLD updated in lld-sync.

## Review Feedback Addressed

- **Warning: missing apiKey null check** → fixed (early return with warning log).
- **Warning: fetchPromise not in LLD** → intentional, noted in PR body under `## Design deviations`.
- **Warning: endpoint** → dismissed (LLD explicitly specifies `/models/user`).

## LLD Sync

Updated `docs/design/lld-v5-e1-token-budget.md §Story 1.1`:
- Added `fetchPromise` singleton and deduplication pattern to code sketch.
- Updated `clearModelLimitsCache()` to reset both `modelListCache` and `fetchPromise`.
- Added `console.warn` on not-found fallback path.
- Added implementation note callout explaining the fetchPromise deviation.

## Cost

| Stage | Cost | Notes |
|-------|------|-------|
| PR creation | $1.8836 | 11 min |
| Final total | $3.7635 | Post-PR rework: ~$1.88 |

## Cost Retrospective

**Post-PR overhead was $1.88 — nearly equal to the implementation cost.** Drivers:

| Driver | Impact | Action |
|--------|--------|--------|
| Test-author agent missed MSW lifecycle hooks | Medium — caused 4 failing tests, extra fix round | Add MSW lifecycle pattern to `test-author` system prompt or LLD template |
| apiKey env var not in test setup | Medium — all MSW tests failed until `tests/setup.ts` patched | LLD testability note should mention adding env var fallbacks for any new `process.env` reads |
| Context compaction hit (session continued from summary) | High — cache-write tokens doubled | Keep PRs under 200 lines; this one was borderline (68 src lines OK, but agent spawns inflated context) |
| 8 agent spawns for a 60-line module | Medium — each re-sends full diff | Standard pressure was correct tier, but test-author + evaluator adds two full re-reads of the diff |
| Pre-existing CI failure (use-status-poll.ts) | Low — one extra fix commit | Not avoidable; caught by CI probe |

**Improvement actions:**
- LLD testability sections should explicitly note: add env var fallback to `tests/setup.ts` for each new `process.env` key in the module.
- test-author system prompt: include MSW `beforeAll`/`afterAll` lifecycle hooks in the standard BDD boilerplate when MSW is the mocking strategy.

## Next Steps

- **#329** — feat: wire truncation into artefact pipeline (V5 Story 1.2) — calls `getModelContextLimit()` from `extractArtefacts()`.
- **#330** — feat: surface truncation details on assessment results (V5 Story 1.3).
