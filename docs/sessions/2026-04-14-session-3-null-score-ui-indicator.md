# Session Log — 2026-04-14 Session 3 — null-score-ui-indicator

**Issue:** #213 — bug: NULL score not retried or surfaced to user
**PR:** [#218](https://github.com/mironyx/feature-comprehension-score/pull/218)
**Branch:** `fix/null-score-retry-surface`
**Status:** Merged

## Work completed

Fixed the visibility gap where LLM scoring failures left answers with NULL `score` and `score_rationale` in the database with no indication shown to the user.

**Change:** 3-line JSX conditional added to `src/app/assessments/[id]/results/page.tsx`.
When `assessment.scoring_incomplete === true` AND `q.aggregate_score === null`, renders
`<p>Unable to score</p>` next to that question's aggregate score. Visible to both participants
and org admins (facilitators).

No API, schema, or data changes required — `aggregate_score === null` on a completed assessment
with `scoring_incomplete = true` was already the unambiguous signal.

**Out of scope (deferred):**
- Retry logic for `validation_failed` — explicitly linked to issue #212
- Surfacing failures in the GET `/assessments/[id]` API response — the questions array already
  exposes `aggregate_score: null`; no API consumer currently needs a dedicated field

## Tests added

- 4 unit tests in `tests/app/assessments/results.test.ts`:
  - `scoring_incomplete=true, null score → shows indicator`
  - `scoring_incomplete=false, null score → no indicator` (regression guard)
  - `scoring_incomplete=true, all scored → no indicator` (flag-alone guard)
  - Partial-question scoping: only null-scored questions show the indicator (occurrence count = 1)
- 1 eval adversarial test in `tests/evaluation/null-score-ui-indicator.eval.test.ts`:
  - Org admin (facilitator) access path — confirmed indicator visible to admins without a participant record

**Total suite:** 636 tests, 80 files — all pass.

## Decisions made

- **Minimal fix over API change:** The issue suggested surfacing failures in the API response, but
  the data is already present in the questions array (`aggregate_score: null`). No new API field
  needed for the UI use case.
- **Results page only:** The fix targets the page where users already go to see scores, rather
  than adding a new endpoint or banner. No cross-cutting changes.
- **Label text "Unable to score":** Chosen by the test-author sub-agent as the assertion string.
  Kept consistent between tests and implementation.

## Diagnostics

CodeScene flagged code duplication in the test file (3 `it()` blocks at the same structural level).
Fixed by consolidating into `it.each` with a parametrised table — reduced duplication and improved
readability.

`results/page.tsx` diagnostics: extension did not export a fresh file after the 3-line change
(known hook-reliability issue on Windows/Windsurf). The change is a trivial JSX conditional with
no CodeScene-relevant patterns (no new functions, no nesting depth increase).

## Review outcome

PR review: clean — no findings (bugs, justification, design principles, compliance, anti-patterns).
CI: all 5 jobs pass (lint, types, unit, integration, E2E).
Evaluator: PASS WITH WARNINGS — 1 adversarial test added for admin path gap (passed).

## LLD sync

No LLD exists for this bug fix — skipped.

## Cost retrospective

Session tagging ran on the WSL side; cost data unavailable from the Windows Claude Code instance.
No numeric figures available for this session.

**Drivers identified (qualitative):**
- Fix was minimal (3 lines) — no fix cycles or re-runs needed.
- 1 CodeScene diagnostic pass to fix code duplication in test file — low overhead.
- Test-author sub-agent wrote independent tests correctly on first pass — no spec gaps requiring
  escalation.
- Evaluator found 1 minor gap (admin path) with 1 adversarial test — normal volume signal.

**No process improvements needed** — this was a clean, fast bug fix with correct tooling.

## Next steps

- Issue #212 (LLM score out-of-range / clarified prompt) — the upstream root cause that drove this NULL score bug
- Any other Todo items on the project board
