# Rubric Generation Enhancements — V3 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-14 |
| Last updated | 2026-04-14 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-14 | LS / Claude | Initial draft — structure |

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

*(Acceptance criteria in next pass)*

### Story 1.2: Store hints in assessment questions

**As the** system,
**I want to** persist the generated hint alongside each question,
**so that** it can be displayed to participants and survives page reloads.

*(Acceptance criteria in next pass)*

### Story 1.3: Display hints in participant answer form

**As a** participant,
**I want to** see a guidance hint below each question,
**so that** I understand the expected answer depth before I start writing.

*(Acceptance criteria in next pass)*

---

## Epic 2: Configurable Comprehension Depth (#215) [Priority: High]

Add a comprehension depth setting to assessments that controls both rubric generation (what depth of questions and reference answers to produce) and scoring calibration (how strictly to grade specificity). Prioritised equally with Epic 1 because it addresses the deeper calibration problem — without depth control, even well-hinted questions still produce over-specific reference answers that penalise conceptual understanding.

### Story 2.1: Add comprehension depth to assessment configuration

**As an** Org Admin,
**I want to** select a comprehension depth (Conceptual or Detailed) when creating an assessment,
**so that** the rubric matches the type of understanding I want to measure.

*(Acceptance criteria in next pass)*

### Story 2.2: Depth-aware rubric generation

**As the** system,
**I want to** adjust the rubric generation prompt based on the selected comprehension depth,
**so that** questions and reference answers match the intended depth.

*(Acceptance criteria in next pass)*

### Story 2.3: Depth-aware scoring calibration

**As the** system,
**I want to** adjust the scoring prompt based on the assessment's comprehension depth,
**so that** participants are graded appropriately for the depth level selected.

*(Acceptance criteria in next pass)*

### Story 2.4: Display depth context in results

**As an** Org Admin,
**I want to** see the comprehension depth setting on the assessment results page,
**so that** I can interpret scores in the context of what was being measured.

*(Acceptance criteria in next pass)*

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
| 1 | Should comprehension depth be configurable at org level (default) or only per-assessment? | Issue #215 describes it as per-assessment. An org-level default would reduce friction. | A) Per-assessment only. B) Org-level default + per-assessment override. | If B, needs an additional column on `organisations` or `repository_configs`. |
| 2 | Should hints be visible on the results page alongside reference answers? | Hints add context to how participants interpreted the question. | A) Show hints only during answering. B) Show hints on results too. | Minor UI change but affects results page layout. |
| 3 | Does comprehension depth affect hint wording? | Conceptual-depth hints would say "describe the approach" while detailed-depth hints would say "name the specific types." | A) Hints are depth-aware (generated together). B) Hints are depth-agnostic. | If A, the prompt must coordinate both features. If B, hints may conflict with depth expectations. |

---

## Next steps

*(Populated after Gate 2 approval)*
