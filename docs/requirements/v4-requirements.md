# Question Generation Quality & Epic-Aware Discovery — V4 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-22 |
| Last updated | 2026-04-22 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-22 | LS / Claude | Initial draft — structure |
| 0.2 | 2026-04-22 | LS / Claude | Acceptance criteria, resolved open questions |
| 1.0 | 2026-04-22 | LS / Claude | Finalised — all open questions resolved, testability validated |
| 1.1 | 2026-04-22 | LS / Claude | Added Epic 2: Epic-Aware Artefact Discovery. Extends V2 Epic 19 to traverse child issues from epics (sub-issues + task list references). Gradual GraphQL adoption. Structure draft. |

---

## Context / Background

The 2026-04-21 assessment (the first real-world use of V3's hint and comprehension depth features) revealed two quality issues in the rubric generation pipeline:

1. **Hints restate the question instead of scaffolding recall.** The current hint prompt instructs the LLM to "describe expected answer depth and format", producing outputs like "Explain which real-world constraints are captured in the validation rules." These are rephrased questions — a stuck participant gets no help. Effective hints should point to a code landmark that jogs memory without revealing the reasoning, e.g. "Look at what `validatePath` rejects vs. what it passes through unchanged." This tests Naur's theory building: someone who built the theory can see the landmark and reconstruct the rationale.

2. **Conceptual-depth questions leak implementation details.** Despite the prompt saying "NO need for specific identifier names", conceptual questions still reference specific files (`tool-loop.ts`), types (`GenerateQuestionsData`), and functions (`generateWithTools`). The depth instruction lacks negative examples and enforcement, so the LLM defaults to its natural behaviour of grounding questions in concrete code.

A secondary observation: scoring calibration may not differentiate well between depth-appropriate and depth-inappropriate answers, with scores clustering in the 0.3–0.6 range regardless of answer quality.

These are prompt engineering refinements to V3 features — no schema changes, no new database columns, no UI changes. See V3 requirements for the original feature specifications.

A separate issue emerged during 2026-04-22 testing: when an epic issue is provided as an assessment source, the pipeline discovers zero PRs and zero files. The LLM received only ~2,356 input tokens (the epic body text alone) and generated questions from almost no context. Root cause: V2 Epic 19's `discoverLinkedPRs` only checks cross-references on the provided issue itself. Epics don't have PRs cross-referenced directly — their child task issues do (e.g. epic #294 has tasks #295, #296, #297, each with merged PRs). The pipeline needs to traverse from epic → child issues → their linked PRs. This is addressed by Epic 2 below.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Scaffolding hint** | A hint that points to a code landmark (file, type, function, or behaviour) to jog the participant's memory, without revealing the reasoning expected in the answer. Replaces the V3 "depth and format" hint approach. |
| **Code landmark** | A specific, recognisable element in the codebase (a function name, a type, a file, a behaviour) that a developer who built the theory would recognise and be able to reason from. |
| **Depth enforcement** | The degree to which the question generation prompt constrains questions to the selected comprehension depth level, preventing conceptual questions from leaking implementation specifics or detailed questions from remaining too abstract. |
| **Epic issue** | A GitHub issue that serves as a container for related work, linking to child issues via GitHub's native sub-issues relationship or via task list references (`- [x] #N`) in the issue body. |
| **Child issue** | An issue related to an epic via GitHub's native sub-issues relationship or referenced in the epic's task list. Both discovery mechanisms are supported. |
| **Task list reference** | A convention-based link from an epic to a child issue, written as a Markdown checkbox item in the epic body (e.g. `- [x] #295`). Distinct from GitHub's native sub-issues feature. |

Terms from V3 (hint, comprehension depth, conceptual/detailed depth, reference answer) remain as defined there. Terms from V2 Epic 19 (artefact, linked issue, artefact quality) remain as defined there.

---

## Design Principles / Constraints

1. **Prompt-only changes.** All modifications are to LLM prompt text in `prompt-builder.ts` and `score-answer.ts`. No schema migrations, no API changes, no UI changes.
2. **Backward compatibility preserved.** Existing assessments continue to score and render identically. Changes only affect newly generated rubrics.
3. **Examples over instructions.** LLMs follow concrete examples more reliably than abstract rules. Prompt changes should include positive and negative examples for each behaviour.
4. **Hints scaffold, never reveal.** Scaffolding hints must point to recognisable code landmarks without revealing any content from the reference answer — the same invariant as V3, applied to the new hint style.
5. **Depth is a hard boundary.** Conceptual questions must not contain specific identifier names, file paths, or function signatures. This is an enforcement constraint, not a preference.

*Epic 2 additions:*

6. **Gradual GraphQL adoption.** Use GraphQL for new features where it provides clear efficiency gains (batch fetching, fewer round-trips). Do not mandate migrating existing REST calls — they are migrated opportunistically when touched for other reasons.
7. **One-level traversal.** Epic → child issues is the supported depth. Recursive traversal (epic → sub-epic → tasks) is out of scope. Keep it simple until real usage demands more.
8. **Provider-agnostic port interface.** The `ArtefactSource` port should avoid hard-coupling to GitHub-specific data models where the cost is low. No Jira adapter, but don't foreclose it either.

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

**Acceptance Criteria:**

- Given the hint generation instruction in the system prompt, then it instructs the LLM to produce a hint that names a recognisable code landmark (a function, type, file, or observable behaviour) the participant can reason from, rather than describing the expected answer format or restating the question.
- Given a generated hint, then it does NOT paraphrase or restate the question text. Bad: "Explain which real-world constraints are captured in the validation rules." Good: "Look at what `validatePath` rejects vs. what it passes through unchanged."
- Given a generated hint, then it does NOT reveal reasoning, rationale, or trade-offs from the reference answer — only points to where to look.
- Given a question where no obvious code landmark exists, then the hint is set to `null` rather than falling back to a format-style hint.
- Given the hint schema, then it remains unchanged from V3: max 200 characters, nullable, optional.

**Notes:** Modifies the hint instruction in `QUESTION_GENERATION_SYSTEM_PROMPT` (prompt-builder.ts line 54). The hint schema in `schemas.ts` is unchanged.

### Story 1.2: Depth-enforced question generation

**As the** system,
**I want to** enforce that conceptual-depth questions do not contain specific identifier names, file paths, or function signatures,
**so that** the comprehension depth setting produces questions at the intended abstraction level.

**Acceptance Criteria:**

- Given comprehension depth is `'conceptual'`, when the rubric generation prompt runs, then the depth instruction includes at least one negative example showing a question that incorrectly contains specific identifiers (e.g. "Why was the tool-use loop extracted into `tool-loop.ts`?") and at least one positive example showing the same question at the correct abstraction level (e.g. "Why is the tool execution logic kept separate from the LLM provider integration?").
- Given comprehension depth is `'conceptual'`, when questions are generated, then neither `question_text` nor `reference_answer` contains specific type names, file paths, or function signatures. Generic terms (e.g. "a union type", "the validation module") are acceptable.
- Given comprehension depth is `'detailed'`, when the rubric generation prompt runs, then the depth instruction includes at least one negative example showing a pure-recall question (e.g. "What file contains the tool loop?") and at least one positive example showing a reasoning question anchored in specifics (e.g. "Why is `X` modelled as a `Y<Z>` rather than a plain Z?").
- Given comprehension depth is `'detailed'`, when questions are generated, then questions use specific identifiers as anchors for reasoning, not as the answer being elicited.
- Given the depth instruction text, then both conceptual and detailed variants include an explicit "DO NOT" constraint listing prohibited question patterns for that depth level.

**Notes:** Modifies `CONCEPTUAL_DEPTH_INSTRUCTION` and `DETAILED_DEPTH_INSTRUCTION` in prompt-builder.ts (lines 72-93).

### Story 1.3: Scoring calibration refinement

**As the** system,
**I want to** refine the scoring calibration prompts to better differentiate depth-appropriate answers,
**so that** scores reflect genuine comprehension quality rather than clustering in a narrow band.

**Acceptance Criteria:**

- Given the conceptual calibration prompt, then it includes explicit scoring examples: a high-scoring conceptual answer (correct reasoning without identifiers, score >= 0.8) and a low-scoring conceptual answer (vague or factually wrong, score <= 0.3).
- Given the detailed calibration prompt, then it includes explicit scoring examples: a high-scoring detailed answer (identifiers named with reasoning about their role, score >= 0.8) and a low-scoring detailed answer (identifiers listed without reasoning, score <= 0.4).
- Given a participant provides a conceptually correct answer without any specific identifiers on a conceptual-depth assessment, then the scoring prompt does not instruct the LLM to penalise for missing specifics.
- Given a participant provides specific identifiers without reasoning on a detailed-depth assessment, then the scoring prompt instructs the LLM to score this lower than an answer with both identifiers and reasoning.
- Given the base scoring scale (0.0–1.0), then the anchor point descriptions remain unchanged — only the depth-specific calibration blocks are modified.

**Notes:** Modifies `CONCEPTUAL_CALIBRATION` and `DETAILED_CALIBRATION` in score-answer.ts (lines 37-52). The base scoring prompt and function signature are unchanged.

---

## Epic 2: Epic-Aware Artefact Discovery [Priority: High]

When an Org Admin provides an epic issue number as an assessment source, the pipeline should automatically discover child task issues and their linked merged PRs, feeding the full implementation context into rubric generation. This extends V2 Epic 19 (GitHub Issues as Artefact Source), which built issue → PR discovery for flat issues but does not traverse the epic → child issue relationship.

**Motivation:** Epics are the natural unit for feature comprehension assessment — they represent a complete feature spanning multiple PRs. Without this, an admin providing an epic gets questions based solely on the epic description text (~2K tokens), missing all implementation context. The fix is small: discover children, then reuse the existing `discoverLinkedPRs` and `extractFromPRs` pipeline.

**Technical mechanism:** Use GitHub GraphQL API for batch child-issue and PR discovery. Two discovery strategies for child issues: (1) GitHub native sub-issues (structured parent-child relationship), (2) task list reference parsing from the epic body (`- [x] #N`). GraphQL can batch-fetch sub-issues and cross-reference events in a single request, avoiding N+1 REST calls. This is the second use of GraphQL in the codebase (after V2 Epic 19's `CROSS_REF_QUERY`), following the gradual adoption strategy.

**Dependency:** V2 Epic 19 (Stories 19.1–19.3) — issue numbers accepted at creation, PR discovery from issues, enhanced logging. All implemented.

### Story 2.1: Discover child issues from epic issues

**As the** system,
**I want to** discover child issues linked to an epic via sub-issues or task list references,
**so that** the pipeline can find the PRs associated with each child issue and include their implementation artefacts.

Two discovery strategies, applied in order:
1. GitHub native sub-issues — query the API for the epic's sub-issue relationships
2. Task list reference parsing — parse `- [x] #N` and `- [ ] #N` checkbox items from the epic body

*(Acceptance criteria in next pass)*

### Story 2.2: Feed child issue PRs into artefact extraction

**As the** system,
**I want to** discover merged PRs from child issues and include them in artefact extraction,
**so that** an assessment created from an epic contains the full implementation context across all child tasks.

This story extends `resolveMergedPrSet` to include child-issue-discovered PRs in the merged set. The existing `discoverLinkedPRs` and `extractFromPRs` pipeline handles the rest.

*(Acceptance criteria in next pass)*

### Story 2.3: Include child issue content in LLM context

**As the** system,
**I want to** fetch and include child issue content (body + comments) alongside the epic's own content,
**so that** the LLM has access to task-level acceptance criteria and design context when generating questions.

*(Acceptance criteria in next pass)*

---

## Cross-Cutting Concerns

### Prompt coordination (Epic 1)

All three Epic 1 stories modify overlapping prompt text. Changes should be integrated in a single coherent prompt update per file, not applied independently. Story 1.1 and 1.2 both modify `prompt-builder.ts`; Story 1.3 modifies `score-answer.ts`.

### Evaluation (Epic 1)

Prompt changes are hard to unit test for quality. An evaluation test (similar to `tests/evaluation/hint-generation.eval.test.ts`) should validate that generated questions and hints conform to the new constraints using a sample artefact set.

### GraphQL adoption strategy (Epic 2)

Epic 2 introduces GraphQL for child-issue and PR batch discovery. The existing `CROSS_REF_QUERY` (V2 Epic 19) already uses GraphQL for cross-reference events. New queries should follow the same pattern: typed response interfaces, single-purpose queries, error handling consistent with existing GraphQL usage. REST calls elsewhere in the codebase are not migrated as part of this work.

### Logging consistency (Epic 2)

Epic 2 must extend the existing artefact summary log (V2 Story 19.3) to include child issue discovery results — how many children were found, via which mechanism (sub-issues vs task list), and how many additional PRs were discovered through them. This enables the same diagnostic capability that caught the original problem.

---

## What We Are NOT Building

- **Schema changes** — no new columns, no migrations. The existing `hint` and `config_comprehension_depth` columns are sufficient.
- **UI changes** — hint rendering and depth display are unchanged from V3.
- **Post-generation validation layer** — while a validation step that programmatically flags depth violations (e.g. regex-checking for code identifiers in conceptual questions) would be valuable, it is out of scope for this iteration. Prompt engineering is the first lever; validation is a future consideration if prompt changes prove insufficient.
- **New depth levels** — still Conceptual and Detailed only.
- **Scoring model changes** — the scoring function signature and schema are unchanged; only the calibration prompt text is refined.
- **Jira or generic issue tracker adapter** — the `ArtefactSource` port interface should remain provider-agnostic where cheap, but no Jira implementation or abstract issue tracker interface is built. GitHub is the only supported provider.
- **Recursive epic traversal** — only one level of traversal is supported (epic → child issues). Sub-epics containing further sub-epics are not recursively expanded.
- **Migration of existing REST calls to GraphQL** — existing REST-based GitHub API calls are not touched. GraphQL is used only for new functionality in Epic 2.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | ~~Should scaffolding hints always reference code (landmark-style), or should some hints describe expected answer structure (format-style)?~~ | Resolved: Always landmark. If no obvious code landmark exists for a question, the hint is set to `null`. No fallback to format-style. | Decided: A) Always landmark, null if none available. | Hint prompt instructs landmark-only; null on failure is already supported from V3. |
| 2 | ~~Is the 0.3–0.6 score clustering a calibration text issue or a reference answer quality issue?~~ | Resolved: Address scoring calibration now (Story 1.3) alongside the other prompt changes. | Decided: A) Address in calibration now. | Story 1.3 proceeds as planned. |
| 3 | Should sub-issues take priority over task list references when both are present? | An epic could have both native sub-issues and `- [x] #N` checkbox items, potentially referencing overlapping sets of child issues. | A) Sub-issues only if present, fall back to task list. B) Union of both, deduplicated. C) Sub-issues preferred, task list as supplement. | Affects deduplication logic and discovery order. |
| 4 | Should the pipeline detect that an issue is an epic, or always attempt child discovery? | We could check for an `epic` label, or just always try to discover children (no-op if none found). | A) Check for `epic` label first. B) Always attempt discovery on all provided issues. C) Let the admin flag it via a new `is_epic` parameter. | Option B is simplest and works regardless of labelling conventions. |

---

## Next steps

1. Run `/architect` for Epic 1 (single LLD given shared prompt surface).
2. Run `/feature` for Epic 1 stories in order: 1.1 → 1.2 → 1.3.
3. Run `/architect` for Epic 2 (separate LLD — different codebase surface).
4. Run `/feature` for Epic 2 stories in order: 2.1 → 2.2 → 2.3.
