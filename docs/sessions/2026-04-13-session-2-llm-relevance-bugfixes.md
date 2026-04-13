# Session: 2026-04-13 — LLM Relevance Detection Bug Fixes

**Issue:** No tracked issue — bugs found during manual testing of answer submission flow.
**Branch:** `main` (direct fixes, no feature branch)

## Work completed

Three interconnected bugs in the answer submission pipeline, discovered during live testing:

### Bug 1: LLM returning markdown instead of JSON

The LLM client (`src/lib/engine/llm/client.ts`) did not set `response_format: { type: 'json_object' }` on chat completion requests. Models returned markdown-formatted text instead of valid JSON, causing `malformed_response` errors on every relevance check.

**Fix:**
- Added `response_format: { type: 'json_object' }` to the API call in `callLlm()`.
- Added explicit JSON output instructions to system prompts for relevance detection and scoring (belt-and-suspenders).
- Added `z.preprocess` to `RelevanceResponseSchema` to coerce string `"true"`/`"false"` to booleans — some models return `"true"` instead of `true` even with `response_format`.

### Bug 2: `attempts_remaining` always hardcoded

`runRelevanceChecks` returned `attempts_remaining: MAX_ATTEMPTS - 1` (always 2) regardless of actual attempt number, and `0` for LLM failures. Users saw incorrect retry counts and got stuck when LLM errors reported zero remaining.

**Fix:**
- Added `attemptNumber` parameter to `runRelevanceChecks`.
- Calculated `remaining = MAX_ATTEMPTS - attemptNumber` for all code paths (success, LLM failure, exception).

### Bug 3: LLM failures burned participant attempts

When the LLM failed to evaluate an answer, the old code wrote `is_relevant: false` to the stored row. On the next submission, `resolveAttemptNumber` incremented the attempt counter. After 3 LLM failures, the user hit "Max attempts exhausted" without their answers ever being properly evaluated.

**Fix:**
- Changed `AnswerResult.is_relevant` from `boolean` to `boolean | null`. LLM failures return `null` (unevaluated).
- `resolveAttemptNumber` now checks if the latest attempt has unevaluated answers; if so, returns the same attempt number (retry, not increment).
- Added `deleteUnevaluatedAnswers` helper to remove `is_relevant IS NULL` rows before re-inserting on retry (avoids unique constraint violations).
- `previouslyIrrelevantIds` filter changed from `=== false` to `!== true` to include both `false` and `null` as re-submittable.
- `isAnswerLocked` in `answering-form.tsx` updated to use `=== true` so `null` keeps fields editable.

## Files changed

| File | Change |
|------|--------|
| `src/lib/engine/llm/client.ts` | Added `response_format: { type: 'json_object' }` |
| `src/lib/engine/llm/schemas.ts` | `z.preprocess` for string-to-boolean coercion on `is_relevant` |
| `src/lib/engine/relevance/detect-relevance.ts` | JSON output instruction in system prompt |
| `src/lib/engine/scoring/score-answer.ts` | JSON output instruction in system prompt |
| `src/app/api/assessments/[id]/answers/service.ts` | `is_relevant: null` for LLM failures, `attemptNumber` param, `deleteUnevaluatedAnswers`, `resolveAttemptNumber` retry logic |
| `src/app/assessments/[id]/answering-form.tsx` | `isAnswerLocked` uses `=== true` |
| `tests/app/api/assessments/[id].answers.test.ts` | 6 new tests for attempts_remaining and LLM failure handling |
| `docs/design/lld-phase-2-web-auth-db.md` | Updated implementation notes (items 8–12) and constraint wording |

## Tests added

- First attempt → `attempts_remaining = 2` for irrelevant answers
- Second attempt → `attempts_remaining = 1`
- Third attempt → `attempts_remaining = 0`
- LLM failure returns `is_relevant: null` with correct `attempts_remaining`
- LLM exception on re-attempt preserves correct remaining
- Retry after LLM failure does not burn an attempt

## Decisions made

- **`is_relevant: null` over deleting rows on failure** — preserves the answer text for debugging while signalling "not yet evaluated". The `null` state is already supported by the DB schema (`is_relevant boolean` — nullable).
- **No separate issue** — these were blocking bugs found during testing, fixed directly on main.
- **Data cleanup required** — existing rows with `is_relevant = false` from LLM failures need manual SQL cleanup: `DELETE FROM participant_answers WHERE assessment_id = '...' AND is_reassessment = false;`

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run` — 616 tests pass (610 existing + 6 new)
