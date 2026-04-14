# Rubric Generation Enhancements — V3 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Status | Final |
| Author | LS / Claude |
| Created | 2026-04-14 |
| Last updated | 2026-04-14 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-14 | LS / Claude | Initial draft — structure |
| 0.2 | 2026-04-14 | LS / Claude | Acceptance criteria for all stories, resolved OQ-3 |
| 1.0 | 2026-04-14 | LS / Claude | Finalised — all open questions resolved, testability validated |

---

## Context / Background

The 2026-04-13 assessment exposed two calibration problems in the rubric generation pipeline:

1. **Participants don't know what depth of answer is expected.** All answers were 5–10 words against reference answers that are full paragraphs. There is no guidance on whether a one-liner or a detailed explanation is appropriate.

2. **Reference answers conflate theory-building with code memorisation.** The current pipeline produces a single depth of reference answer — detailed implementation specifics (exact type names, file paths, function signatures). This tests recall of code details rather than Naur's theory-building. A person with genuine modification capacity would describe the approach and constraints without needing to recall exact identifier names.

These are complementary fixes to the rubric generation prompt, question schema, and scoring calibration. Issue #214 addresses the participant guidance gap; issue #215 addresses the depth calibration gap.

See: [#214](https://github.com/mironyx/feature-comprehension-score/issues/214), [#215](https://github.com/mironyx/feature-comprehension-score/issues/215).

---

## Glossary

| Term | Definition |
|------|-----------|
| **Hint** | A short guidance sentence shown to participants alongside a question, indicating the expected answer depth and format without revealing the reference answer. |
| **Comprehension depth** | A per-assessment setting that controls the level of specificity expected in both generated reference answers and participant responses. |
| **Conceptual depth** | Comprehension depth level testing reasoning about the system — approach, constraints, rationale. Corresponds to Part A-level understanding. |
| **Detailed depth** | Comprehension depth level testing implementation knowledge — specific types, files, function signatures. Corresponds to Part B-level understanding. |
| **Reference answer** | The expected answer derived from artefacts, used as the scoring rubric. Its specificity is controlled by comprehension depth. |

---

## Design Principles / Constraints

1. **Hints must not leak answers.** A hint guides depth and format (e.g. "Describe 2–3 scenarios") without revealing the reference answer content.
2. **Backward compatibility.** Existing assessments with no hints or no depth setting must render and score correctly. New columns are nullable or have sensible defaults.
3. **Single prompt change surface.** Both features modify the rubric generation prompt. Changes should be coordinated to avoid conflicting prompt instructions.
4. **Depth affects both generation and scoring.** Comprehension depth is not cosmetic — it changes what the LLM generates as reference answers AND how strictly the scoring prompt grades specificity.
5. **Conceptual depth is the default.** Per issue #215, conceptual depth better measures Naur's theory-building. Detailed depth is opt-in for teams that specifically want to test implementation recall.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | Configures assessments, selects comprehension depth. |
| **Participant** | Contextual | Answers assessment questions; sees hints during the answer form. |
| **System** | Internal | Generates rubric (questions, reference answers, hints) and scores answers. |

---

## Epic 1: Answer Guidance Hints (#214) [Priority: High]

Extend the rubric generation pipeline to produce a `hint` field per question that gives participants guidance on expected answer depth and format, without revealing the reference answer. Prioritised first because it is simpler (additive schema + prompt change) and directly addresses the calibration failure observed in the 2026-04-13 assessment.

### Story 1.1: Generate hints in rubric pipeline

**As the** system,
**I want to** generate a guidance hint for each question during rubric generation,
**so that** participants know what depth and format of answer is expected.

**Acceptance Criteria:**

- Given the rubric generation prompt runs, when it produces questions, then each question includes a `hint` string field alongside the existing `question_text`, `reference_answer`, `weight`, and `naur_layer` fields.
- Given a generated hint, then it describes the expected answer format and depth (e.g. "Describe 2–3 specific scenarios and explain the design rationale") without revealing any content from the reference answer.
- Given a generated hint, then it is 1–2 sentences long (max 200 characters).
- Given the LLM fails to produce a hint for a question (malformed output), then the question is still accepted with `hint` set to `null` — hint generation failure does not block rubric generation.

**Notes:** The `QuestionSchema` in `src/lib/engine/llm/schemas.ts` gains an optional `hint` field. The `QuestionGenerationResponseSchema` validates it. The system prompt in `prompt-builder.ts` gains hint generation instructions.

### Story 1.2: Store hints in assessment questions

**As the** system,
**I want to** persist the generated hint alongside each question,
**so that** it can be displayed to participants and survives page reloads.

**Acceptance Criteria:**

- Given the `assessment_questions` table, then it has a `hint` column of type `text`, nullable, with no default.
- Given a rubric generation result with hints, when questions are inserted into `assessment_questions`, then the `hint` value is stored per row.
- Given a rubric generation result where a question has no hint (null), when inserted, then the `hint` column is `null` for that row.
- Given an existing assessment created before this feature, then its `hint` columns are `null` and the assessment continues to function.

### Story 1.3: Display hints in participant answer form

**As a** participant,
**I want to** see a guidance hint below each question,
**so that** I understand the expected answer depth before I start writing.

**Acceptance Criteria:**

- Given a question with a non-null hint, when the participant views the answer form, then the hint is displayed below the question text in a visually distinct style (e.g. muted text, smaller font).
- Given a question with a null hint, when the participant views the answer form, then no hint area is rendered — no empty space or placeholder.
- Given the hint is displayed, then it appears before the answer input field, not after.
- Given the results page (Org Admin or participant self-view), then hints are displayed alongside questions and reference answers for context.

---

## Epic 2: Configurable Comprehension Depth (#215) [Priority: High]

Add a comprehension depth setting to assessments that controls both rubric generation (what depth of questions and reference answers to produce) and scoring calibration (how strictly to grade specificity). Prioritised equally with Epic 1 because it addresses the deeper calibration problem — without depth control, even well-hinted questions still produce over-specific reference answers that penalise conceptual understanding.

### Story 2.1: Add comprehension depth to assessment configuration

**As an** Org Admin,
**I want to** select a comprehension depth (Conceptual or Detailed) when creating an assessment,
**so that** the rubric matches the type of understanding I want to measure.

**Acceptance Criteria:**

- Given the assessment creation form, then it includes a "Comprehension Depth" selector with two options: "Conceptual" (default, selected) and "Detailed".
- Given the selector, then each option includes a one-line explanation: Conceptual — "Tests reasoning about approach, constraints, and rationale"; Detailed — "Tests knowledge of specific types, files, and function signatures".
- Given the `assessments` table, then it has a `config_comprehension_depth` column of type `text`, not null, default `'conceptual'`, with a check constraint `IN ('conceptual', 'detailed')`.
- Given an assessment is created, then the selected depth is stored in `config_comprehension_depth` as part of the config snapshot.
- Given an existing assessment created before this feature, then its `config_comprehension_depth` is `'conceptual'` (the default).
- Given a PRCC assessment (webhook-triggered, not manually created), then it defaults to `'conceptual'` depth.

**Notes:** Depth is captured at creation time and immutable — consistent with existing config snapshot pattern (`config_enforcement_mode`, `config_score_threshold`, etc.).

### Story 2.2: Depth-aware rubric generation

**As the** system,
**I want to** adjust the rubric generation prompt based on the selected comprehension depth,
**so that** questions and reference answers match the intended depth.

**Acceptance Criteria:**

- Given comprehension depth is `'conceptual'`, when the rubric generation prompt runs, then reference answers describe approach, constraints, and rationale without requiring specific identifier names, file paths, or function signatures. Example: "The sign-in flow uses a union type to represent outcomes, and adding a pending state requires extending this union and handling it in the UI" rather than "Add `'pending'` to the `SigninOutcome` union type in `src/types/auth.ts`".
- Given comprehension depth is `'detailed'`, when the rubric generation prompt runs, then reference answers include specific type names, file paths, and function signatures as in the current behaviour.
- Given comprehension depth is `'conceptual'`, then questions focus on "why" and "how would you approach" rather than "what is the exact name of".
- Given comprehension depth is `'detailed'`, then question style is unchanged from current behaviour.
- Given the `AssembledArtefactSet`, then it includes a `comprehension_depth` field that the prompt builder reads to select the appropriate prompt variant.
- Given hints are also enabled (Epic 1), then hint wording reflects the selected depth — conceptual hints guide toward reasoning ("Describe the approach and constraints"), detailed hints guide toward specifics ("Name the relevant types and files").

### Story 2.3: Depth-aware scoring calibration

**As the** system,
**I want to** adjust the scoring prompt based on the assessment's comprehension depth,
**so that** participants are graded appropriately for the depth level selected.

**Acceptance Criteria:**

- Given comprehension depth is `'conceptual'`, when a participant answer is scored, then the scoring prompt instructs the LLM to: accept semantically equivalent descriptions even without exact identifier names; weight demonstration of reasoning and understanding of constraints over recall of specifics; not penalise for omitting file paths, type names, or function signatures when the conceptual understanding is correct.
- Given comprehension depth is `'detailed'`, when a participant answer is scored, then the scoring prompt uses the current behaviour — specificity is expected and valued.
- Given the `ScoreAnswerRequest` interface, then it accepts a `comprehensionDepth` parameter that controls which scoring calibration is applied.
- Given a participant provides exact identifiers on a conceptual-depth assessment, then they are not penalised — specificity is accepted but not required.
- Given `comprehensionDepth` is not provided to the scoring function (pre-existing assessments), then scoring defaults to `'conceptual'` calibration.

**Notes:** This is the most impactful change for score calibration. The scoring prompt in `score-answer.ts` needs a depth-conditional instruction block. Depends on #212 (scoring prompt scale bug) being resolved first.

### Story 2.4: Display depth context in results

**As an** Org Admin,
**I want to** see the comprehension depth setting on the assessment results page,
**so that** I can interpret scores in the context of what was being measured.

**Acceptance Criteria:**

- Given the assessment results page, then it displays the comprehension depth as a labelled badge or tag (e.g. "Depth: Conceptual" or "Depth: Detailed") near the assessment title.
- Given the depth is "Conceptual", then the results page includes a contextual note: "This assessment measured reasoning and design understanding. Participants were not expected to recall specific code identifiers."
- Given the depth is "Detailed", then the results page includes a contextual note: "This assessment measured detailed implementation knowledge including specific types, files, and function signatures."
- Given the organisation assessment history / list view, then the depth setting is shown as a column or filter option so Org Admins can compare scores within the same depth level.

---

## Cross-Cutting Concerns

### Prompt coordination

Both epics modify the rubric generation prompt. The hint generation instruction and depth-level instruction must be integrated into a single coherent prompt update, not layered independently.

### Migration

Schema changes (new `hint` column, new `comprehension_depth` column) require a database migration. Both can be in a single migration since they affect related tables.

### Backward compatibility

Existing assessments created before these features must continue to render and score correctly. The UI must handle null hints and missing depth settings gracefully.

---

## What We Are NOT Building

- **Per-question depth selection** — depth is per-assessment, not per-question. Mixing depths within an assessment would complicate scoring.
- **Custom hint authoring** — hints are LLM-generated only. Manual hint editing is a future consideration.
- **More than two depth levels** — Conceptual and Detailed only. A middle "Balanced" tier adds complexity without clear value at this stage.
- **Depth-specific question counts** — the existing question count configuration is independent of depth.
- **Retroactive depth change** — changing depth on a completed assessment is not supported. Depth is captured at creation time.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | ~~Should comprehension depth be configurable at org level (default) or only per-assessment?~~ | Resolved: per-assessment only. Assessment creation form defaults to Conceptual (Story 2.1 AC1). Org-level default is an additive change if needed later. | Decided: A) Per-assessment only. | No additional schema needed. |
| 2 | ~~Should hints be visible on the results page alongside reference answers?~~ | Resolved: Yes — hints on results page give context for score interpretation. | Decided: B) Show hints on results too. | Already covered by Story 1.3 AC4. |
| 3 | ~~Does comprehension depth affect hint wording?~~ | Resolved: Yes — Story 2.2 AC specifies hints are depth-aware when both features are enabled. | Decided: A) Hints are depth-aware. | Prompt coordinates both features. |

---

## Next steps

1. Run `/architect` to produce LLDs for Epic 1 and Epic 2 (can be a single LLD given the shared prompt surface).
2. Resolve #212 (scoring prompt scale bug) before implementing Story 2.3.
3. Run `/feature` for each story in order: 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 2.4.
