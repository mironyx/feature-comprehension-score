# Embedded Reflection in Question Generation Prompt — V10 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-28 |
| Last updated | 2026-04-28 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-28 | LS / Claude | Initial draft |

---

## Context / Background

The question generation system prompt (`QUESTION_GENERATION_SYSTEM_PROMPT` in `src/lib/engine/prompts/prompt-builder.ts`) already constrains the LLM with Naur's three-layer framework, good/bad examples, and depth instructions. However, the constraints are passive — the model reads them and attempts to comply in a single generative pass. In practice this means the model can produce questions that violate the constraints (too shallow, answerable by grep, testing recall rather than theory) because there is no explicit check between generating and outputting.

The Reflection technique addresses this by embedding a structured self-critique step inside the same prompt: the model drafts candidate questions, applies the Naur-grounded critique rubric to each, rewrites any that fail, and only then outputs the final structured JSON. This is one LLM call — no additional context cost, no new infrastructure.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Reflection technique** | A prompt engineering pattern where the model is instructed to generate output, critique it against explicit criteria, and revise before producing the final result — all within one LLM call. |
| **Naur critique rubric** | The three tests used to evaluate each candidate question, grounded in Peter Naur's theory-building properties (see Epic 1). |
| **Candidate question** | An intermediate question generated in the draft pass, before critique and revision. Never exposed to the user. |
| **Final question** | A question that has passed the critique rubric (or been rewritten to pass). This is what populates the JSON output. |
| **Rationale probe** | Critique test 1: does the question require explaining *why*, not just *what*? |
| **Depth probe** | Critique test 2: is the question answerable by reading the code for 30 seconds (grep, variable names, default values)? If yes, it is too shallow. |
| **Theory persistence probe** | Critique test 3: does the question test knowledge that a developer retains after moving on — the kind needed to judge whether a proposed change is safe? |

---

## Design Principles / Constraints

1. **Single LLM call.** The reflection step is embedded in the existing system prompt. No second LLM call, no new functions, no schema changes.
2. **Output schema unchanged.** The JSON output contract (`QuestionGenerationResponseSchema`) is not modified. Reflection is internal to the model's reasoning process.
3. **Question count preserved.** Candidate questions that fail critique must be rewritten, not dropped. The final output must contain exactly the requested number of questions.
4. **Prompt-only change.** The only file modified is `src/lib/engine/prompts/prompt-builder.ts`. No other files change.
5. **Additive, not replacing.** The reflection section is appended to the existing system prompt after the current `## Constraints` block. Existing constraints remain unchanged.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **LLM (question generator)** | Internal | The model that receives the prompt and produces questions. The reflection step is an instruction to this actor. |
| **Assessor (org user)** | Persistent | Receives the final questions. Sees only the output of the reflection process, never the intermediate draft. |

---

## Epic 1: Embedded Reflection in Question Generation [Priority: High]

Adds an explicit draft-critique-rewrite instruction to the system prompt so the LLM performs a structured self-check against the Naur rubric before producing the final question set.

**Rationale:** Single epic, single story. This is a prompt-only change. The scope boundary is the system prompt string; everything else is unchanged.

### Story 1.1: Draft-critique-rewrite instruction in system prompt

**As a** question generator (LLM),
**I want to** be explicitly instructed to draft questions, critique each against the Naur rubric, and rewrite failing questions before outputting,
**so that** the final question set is more reliably grounded in theory-building assessment rather than surface recall.

**Acceptance Criteria:**

- Given the updated system prompt, when the model generates questions, then the prompt instructs it to first produce a draft set of candidate questions (internal reasoning), then critique each candidate against the three Naur probes (rationale, depth, theory persistence), then rewrite any candidate that fails one or more probes, and finally output only the revised final questions as the JSON response.
- Given a candidate question that is answerable by reading the code for 30 seconds (depth probe fails), when the model applies the critique step, then the question must be rewritten to require reasoning about design intent, constraints, or trade-offs — not discarded.
- Given a candidate question that answers "what" without requiring the developer to explain "why" (rationale probe fails), when the model applies the critique step, then the question must be rewritten to require justification or design reasoning.
- Given a candidate question that tests knowledge a developer could reconstruct on demand (theory persistence probe fails), when the model applies the critique step, then the question must be rewritten to test durable understanding — the kind needed to judge safe change paths.
- Given a candidate question that is rewritten after critique, when the model produces the final JSON entry for that question, then the `reference_answer` and `hint` are also regenerated to match the rewritten question — not carried over from the candidate.
- Given the reflection instruction, when the model outputs the final JSON, then the question count matches the requested count exactly (rewrites replace candidates; no questions are dropped).
- Given the reflection instruction is added, when the existing constraints are read, then all prior constraints remain unchanged in the prompt — the reflection section is additive only.

**Notes:** The critique criteria are not new — they are already stated in `## Constraints` as passive rules. The change is making them active: the model is instructed to apply them as an explicit self-check step rather than hoping they are honoured during generation. INVEST: Independent — no dependency on other stories. Estimable: prompt string edit only. Testable: see AC criteria above; behaviour is observable by examining generated question quality against the rubric.

### Story 1.2: Prompt improvements — depth compliance probe, hint conflict, diversity, weight criteria (#388)

**As a** question generator (LLM),
**I want to** receive unambiguous, non-conflicting instructions for depth compliance, hint specificity, question diversity, and weight assignment,
**so that** generated questions and hints are consistently scoped to the selected comprehension depth, spread across distinct code areas, and weighted with a reproducible standard.

**Acceptance Criteria:**

- Given conceptual depth, when the model critiques a candidate question that uses a specific identifier in `question_text`, `reference_answer`, or `hint`, then the depth compliance probe flags it and the model rewrites to remove the identifier.
- Given detailed depth, when the model critiques a candidate question with no concrete code anchor in `question_text` or `hint`, then the depth compliance probe flags it and the model rewrites to add one.
- Given the updated base hint description, when read alone (without the depth instruction), it no longer instructs the model to name specific identifiers.
- Given a diff spanning 4+ distinct files, when 5 questions are generated, then no two questions are grounded primarily in the same source file.
- Given weight 3 criteria, when a question is about a concept that affects only one component, then the model assigns weight ≤ 2.
- All existing `REFLECTION_INSTRUCTION` tests pass unchanged.

---

## Cross-Cutting Concerns

### Token cost

The reflection instruction adds a small number of tokens to the system prompt (approximately 150–200 tokens). This is negligible relative to the artefact context. The instruction does not add a second LLM call.

### Observability

No new metrics are added. Existing token usage tracking (`inputTokens`, `outputTokens` in `GenerateQuestionsData`) already captures total cost including the expanded system prompt.

---

## What We Are NOT Building

- A second LLM call to perform critique separately — ruled out as too expensive given large artefact context (Option B).
- A critique log or intermediate output — the model's draft and critique steps are internal reasoning; only the final questions are returned.
- Changes to `QuestionGenerationResponseSchema` — the output contract is frozen for this change.
- Changes to `generateQuestions` or `buildQuestionGenerationPrompt` signatures — prompt content changes only.

---

## Open Questions

No open questions. Approach agreed in conversation: single-call reflection (Option A), critique grounded in Naur's three theory properties.

---

## Next Steps

1. Run `/architect docs/requirements/v10-requirements.md` to produce LLD and implementation tasks.
