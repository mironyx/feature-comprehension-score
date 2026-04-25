# LLM Output Tolerance — V6 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Status | Final |
| Author | LS / Claude |
| Created | 2026-04-25 |
| Last updated | 2026-04-25 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-25 | LS / Claude | Initial draft |
| 1.0 | 2026-04-25 | LS / Claude | Finalised |

---

## Context / Background

Different LLM providers do not reliably follow exact output constraints in the rubric generation prompt. Two recurring failures:

1. **Question count overshoot.** The prompt requests N questions; some models return more. The pipeline treats this as a hard `validation_failed` error, wasting retries. The DB and UI already handle variable question counts — scoring iterates over actual `assessment_questions` rows, not `config_question_count`.
2. **Hint length overflow.** The prompt requests max 200-char hints; some models exceed this. The Zod schema rejects the entire response.

Both produce usable output that is currently discarded. Fix: accept what the model returns instead of rejecting.

---

## Stories

### Story 1: Accept any question count from the LLM

**As the** system,
**I want to** accept however many questions the LLM generates (provided >= 3),
**so that** rubric generation succeeds without retrying when a model overshoots the requested count.

**Acceptance Criteria:**

- Given the LLM returns more questions than `artefacts.question_count`, when validated, then all questions are accepted and stored.
- Given the LLM returns 3 or more questions, then validation passes regardless of the requested count.
- Given the LLM returns fewer than 3 questions, then the existing `validation_failed` error is returned (retryable).
- Given the Zod schema `QuestionGenerationResponseSchema`, then the `questions` array constraint is relaxed from `.min(3).max(5)` to `.min(3)` (no upper bound).
- Given `generate-questions.ts`, then the strict equality check (`response.questions.length !== artefacts.question_count`) is removed.

**Notes:** Change sites: `generate-questions.ts` lines 56–65 (remove strict equality check), `schemas.ts` line 37 (remove `.max(5)`). The prompt still asks for the configured count — this just stops the pipeline from rejecting usable output when the model overshoots.

---

### Story 2: Remove hint character limit from schema

**As the** system,
**I want to** accept hints of any length from the LLM,
**so that** rubric generation does not fail when a model produces hints longer than 200 characters.

**Acceptance Criteria:**

- Given the `QuestionSchema`, then `hint` changes from `z.string().max(200)` to `z.string()` — matching `question_text` which has no length limit.
- Given the LLM produces a hint longer than 200 characters, then it is accepted.
- Given the prompt in `prompt-builder.ts`, then the "max 200 characters" instruction is replaced with guidance toward brevity without a hard limit.
- Given existing stored hints, then they are unaffected (DB column is `text`, no constraint).

**Notes:** Change sites: `schemas.ts` line 25, `prompt-builder.ts` line 54.

---

## What We Are NOT Building

- Trimming or truncating questions — accept all that the model generates.
- Hint trimming/truncation — accepted as-is; prompt still guides brevity.
- Per-model prompt tuning.

---

## Next steps

1. Run `/architect docs/requirements/v6-requirements.md` to produce the LLD.
2. Run `/feature` for each story: Story 1 → Story 2 (or both in one PR given the small scope).
