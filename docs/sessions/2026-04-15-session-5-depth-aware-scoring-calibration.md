# Session 5 — 2026-04-15 — Depth-aware scoring calibration (Story 2.3)

Issue [#224](https://github.com/mironyx/feature-comprehension-score/issues/224) · PR [#232](https://github.com/mironyx/feature-comprehension-score/pull/232)

## Work completed

Implemented Story 2.3 of Epic 2 (Comprehension Depth) end-to-end:

- `src/lib/engine/scoring/score-answer.ts`: split the single `SYSTEM_PROMPT` into `BASE_SYSTEM_PROMPT` + `CONCEPTUAL_CALIBRATION` + `DETAILED_CALIBRATION`, composed by `buildScoringPrompt(depth?)`. Added `comprehensionDepth?: 'conceptual' | 'detailed'` to `ScoreAnswerRequest`; defaults to conceptual when omitted.
- `src/lib/engine/pipeline/assess-pipeline.ts`: threaded `comprehensionDepth` through `ScoreAnswersRequest` → `LLMCallConfig` → `processAnswer` → `scoreAnswer`.
- `src/app/api/assessments/[id]/answers/service.ts`: `fetchScoringData` now issues a third parallel Supabase query for `config_comprehension_depth` on the `assessments` row; `triggerScoring` forwards the value to `scoreAnswers`. Kept inside the 20-line complexity budget by consolidating the fetch rather than adding a new step.
- Tests: 9 new feature tests in `tests/lib/engine/scoring/score-answer.test.ts`, 3 threading tests in `tests/lib/engine/pipeline/assess-pipeline.test.ts`, 2 adversarial end-to-end tests by the feature-evaluator in `tests/evaluation/comprehension-depth-story-2-3.eval.test.ts` guarding AC-5 (assessment config → scoring path).
- LLD `docs/design/lld-v3-e2-comprehension-depth.md` §Story 2.3 updated in lockstep with implementation (calibration wording, fetch-path note, test file list, changelog).

## Decisions made

- **Consolidated the depth fetch into `fetchScoringData`** rather than adding a standalone read in `triggerScoring`. Kept `triggerScoring` under the 20-line budget and preserved the single-fetch-point invariant.
- **Default to conceptual when depth is omitted** (rather than throwing). Matches Story 2.1's DB default and avoids a migration-ordering footgun.
- **Mid-flight revision (per team-lead feedback):** re-framed the detailed-depth calibration away from "recall of implementation knowledge" towards "understanding at higher resolution" — aligned with Naur's theory-building frame. Specific identifiers are the expected *vocabulary* used to anchor reasoning, not the reasoning itself. LLD, `score-answer.ts`, and 3 detailed-branch tests updated together. Commit `eac35bc`.
- **LLD sync (Step 1.5):** recorded a correction — `fetchScoringData` gained a third parallel Supabase query; the spec had assumed the assessment row was already on hand.

## Review feedback addressed

- **Team-lead Naur re-framing** (mid-flight) — applied verbatim wording, updated tests in lockstep. Second CI run + second `/pr-review-v2` pass: clean.
- **`/pr-review-v2` (2 parallel agents, ≥150-line diff path)** — no findings on either the initial or revised implementation.
- **CI probe** — all jobs green on both pushes (lint, type-check, unit, integration, E2E, Docker build).

## Cost retrospective

- **PR-creation cost:** Prometheus unreachable at PR time — no figure recorded.
- **Final cost:** Prometheus unreachable at feature-end — no figure recorded.
- **Drivers observed (qualitative):**
  - One mid-flight revision cycle (Naur re-framing) — small additional cost; one extra commit, one extra CI run, one extra `/pr-review-v2` pass. Avoidable in principle by agreeing calibration wording against the theory frame during LLD, not after implementation.
  - Fixture reuse worked well — adversarial eval test used its own `[id].answers.test.ts`-style mock chain (sibling pattern already documented in `test-author`/`feature-evaluator` skill prompts). No duplicate factories created.
  - Test-author produced a full contract-coverage test file in one pass; evaluator only needed 2 adversarial tests (AC-5 gap). Low "over-generation" — close to the ideal ratio.

## Follow-ups / notes

- None for this story. Epic 2 Story 2.3 acceptance criteria all covered by tests.
- Epic #215 checklist entry for #224 ticked off during `/feature-end`.
