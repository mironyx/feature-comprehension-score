# Question Generation Quality — V4 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-22 |
| Last updated | 2026-04-22 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-22 | LS / Claude | Initial draft — structure |

---

## Context / Background

The 2026-04-21 assessment (the first real-world use of V3's hint and comprehension depth features) revealed two quality issues in the rubric generation pipeline:

1. **Hints restate the question instead of scaffolding recall.** The current hint prompt instructs the LLM to "describe expected answer depth and format", producing outputs like "Explain which real-world constraints are captured in the validation rules." These are rephrased questions — a stuck participant gets no help. Effective hints should point to a code landmark that jogs memory without revealing the reasoning, e.g. "Look at what `validatePath` rejects vs. what it passes through unchanged." This tests Naur's theory building: someone who built the theory can see the landmark and reconstruct the rationale.

2. **Conceptual-depth questions leak implementation details.** Despite the prompt saying "NO need for specific identifier names", conceptual questions still reference specific files (`tool-loop.ts`), types (`GenerateQuestionsData`), and functions (`generateWithTools`). The depth instruction lacks negative examples and enforcement, so the LLM defaults to its natural behaviour of grounding questions in concrete code.

A secondary observation: scoring calibration may not differentiate well between depth-appropriate and depth-inappropriate answers, with scores clustering in the 0.3–0.6 range regardless of answer quality.

These are prompt engineering refinements to V3 features — no schema changes, no new database columns, no UI changes. See V3 requirements for the original feature specifications.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Scaffolding hint** | A hint that points to a code landmark (file, type, function, or behaviour) to jog the participant's memory, without revealing the reasoning expected in the answer. Replaces the V3 "depth and format" hint approach. |
| **Code landmark** | A specific, recognisable element in the codebase (a function name, a type, a file, a behaviour) that a developer who built the theory would recognise and be able to reason from. |
| **Depth enforcement** | The degree to which the question generation prompt constrains questions to the selected comprehension depth level, preventing conceptual questions from leaking implementation specifics or detailed questions from remaining too abstract. |

Terms from V3 (hint, comprehension depth, conceptual/detailed depth, reference answer) remain as defined there.

---

## Design Principles / Constraints

1. **Prompt-only changes.** All modifications are to LLM prompt text in `prompt-builder.ts` and `score-answer.ts`. No schema migrations, no API changes, no UI changes.
2. **Backward compatibility preserved.** Existing assessments continue to score and render identically. Changes only affect newly generated rubrics.
3. **Examples over instructions.** LLMs follow concrete examples more reliably than abstract rules. Prompt changes should include positive and negative examples for each behaviour.
4. **Hints scaffold, never reveal.** Scaffolding hints must point to recognisable code landmarks without revealing any content from the reference answer — the same invariant as V3, applied to the new hint style.
5. **Depth is a hard boundary.** Conceptual questions must not contain specific identifier names, file paths, or function signatures. This is an enforcement constraint, not a preference.

---

## Roles

Unchanged from V3:

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | Configures assessments, selects comprehension depth. |
| **Participant** | Contextual | Answers assessment questions; sees hints during the answer form. |
| **System** | Internal | Generates rubric (questions, reference answers, hints) and scores answers. |

---

## Epic 1: Question Generation Quality [Priority: High]

Improve the rubric generation prompt to produce higher-quality hints and enforce depth-appropriate question abstraction levels. All three stories modify the same prompt surface (`prompt-builder.ts` and `score-answer.ts`) and share a single integration test surface.

**Priority rationale:** This is a quality-of-output fix for the core product capability. Without it, the conceptual depth setting — the default for all assessments — produces questions and hints that undermine its own purpose.

### Story 1.1: Scaffolding hints

**As the** system,
**I want to** generate hints that point to code landmarks rather than restating the question,
**so that** stuck participants get a memory jog that helps them recall their understanding without being given the answer.

*(Acceptance criteria in next pass)*

**Notes:** Modifies the hint instruction in `QUESTION_GENERATION_SYSTEM_PROMPT` (prompt-builder.ts line 54). The hint schema (max 200 characters, nullable) is unchanged from V3.

### Story 1.2: Depth-enforced question generation

**As the** system,
**I want to** enforce that conceptual-depth questions do not contain specific identifier names, file paths, or function signatures,
**so that** the comprehension depth setting produces questions at the intended abstraction level.

*(Acceptance criteria in next pass)*

**Notes:** Modifies `CONCEPTUAL_DEPTH_INSTRUCTION` and `DETAILED_DEPTH_INSTRUCTION` in prompt-builder.ts (lines 72-93). Adds negative examples to each depth instruction.

### Story 1.3: Scoring calibration refinement

**As the** system,
**I want to** refine the scoring calibration prompts to better differentiate depth-appropriate answers,
**so that** scores reflect genuine comprehension quality rather than clustering in a narrow band.

*(Acceptance criteria in next pass)*

**Notes:** Modifies `CONCEPTUAL_CALIBRATION` and `DETAILED_CALIBRATION` in score-answer.ts (lines 37-52). May also refine the base scoring anchor points if the 0.3–0.6 clustering is a calibration text issue.

---

## Cross-Cutting Concerns

### Prompt coordination

All three stories modify overlapping prompt text. Changes should be integrated in a single coherent prompt update per file, not applied independently. Story 1.1 and 1.2 both modify `prompt-builder.ts`; Story 1.3 modifies `score-answer.ts`.

### Evaluation

Prompt changes are hard to unit test for quality. An evaluation test (similar to `tests/evaluation/hint-generation.eval.test.ts`) should validate that generated questions and hints conform to the new constraints using a sample artefact set.

---

## What We Are NOT Building

- **Schema changes** — no new columns, no migrations. The existing `hint` and `config_comprehension_depth` columns are sufficient.
- **UI changes** — hint rendering and depth display are unchanged from V3.
- **Post-generation validation layer** — while a validation step that programmatically flags depth violations (e.g. regex-checking for code identifiers in conceptual questions) would be valuable, it is out of scope for this iteration. Prompt engineering is the first lever; validation is a future consideration if prompt changes prove insufficient.
- **New depth levels** — still Conceptual and Detailed only.
- **Scoring model changes** — the scoring function signature and schema are unchanged; only the calibration prompt text is refined.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | Should scaffolding hints always reference code (landmark-style), or should some hints describe expected answer structure (format-style)? | The brief strongly favours landmark-style, but some questions (especially world-to-program) may not have an obvious code landmark. | A) Always landmark B) Landmark preferred, format as fallback | Affects hint prompt instruction wording |
| 2 | Is the 0.3–0.6 score clustering a calibration text issue or a reference answer quality issue? | If reference answers are too specific for conceptual depth, scoring will always penalise conceptual participant answers regardless of calibration. Story 1.2 may resolve this indirectly. | A) Address in calibration (Story 1.3) B) Defer until Story 1.2 is implemented and re-evaluated | Determines whether Story 1.3 is needed now or deferred |

---

## Next steps

1. Run `/architect` to produce LLD for the epic (single LLD given shared prompt surface).
2. Run `/feature` for each story in order: 1.1 → 1.2 → 1.3.
