# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-03-16
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0.5 — Scaffolding & Infrastructure

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Warning  | 9 |
| Info     | 8 |

**Overall drift score:** Epic 4 (Assessment Engine) — the only epic with implementation — has 100% design coverage and approximately 90% test coverage for implemented stories. Epics 1–3, 5–6 are unimplemented and have full design coverage in `v1-design.md`. The engine itself shows strong alignment between design contracts and code. The one critical issue is a missing ADR for a confirmed architectural decision. Former C1 (per-participant scores) was resolved by ADR-0005 revision — see I8.

---

## Critical Issues

### ~~C1~~ — Resolved: `participantScores` in `AggregateResult` now justified by ADR-0005 revision

*Downgraded to I8. See Informational section.*

### C1 (was C2) — No ADR covers the `LLMClient` interface segregation and `AnthropicClient` binding decision

- **Requirement:** ADR-0010 references `src/lib/engine/llm/types.ts` for `LLMResult<T>` and `LLMError`, and describes the Zod validation strategy. It explicitly states the `LLMClient` port interface is a consequence.
- **Expected:** An ADR covering the `LLMClient` port design — why `generateStructured` takes a `ZodType` schema parameter rather than a simpler contract, and why the default model is hardcoded to `claude-sonnet-4-20250514` inside `AnthropicClient` rather than being mandatory configuration.
- **Found:** ADR-0010 addresses *response validation strategy* but not the *interface contract itself*. The model string `claude-sonnet-4-20250514` in `src/lib/engine/llm/client.ts` line 43 is a hardcoded default with no design justification — the requirements out-of-scope table explicitly defers OSS model alternatives but does not document which Claude model version is the V1 default or why.
- **Impact:** Hardcoded model strings become stale without a recorded decision. When the model identifier changes (Claude model versions do change), there is no ADR to reference to understand what the acceptable replacement is, whether retesting is required, or what the fallback should be. Given the project's dogfooding intent (its own FCS assessment will use these artefacts), missing model provenance weakens the assessment quality signal.

---

## Warnings

### W1 — `classifyArtefactQuality` plan doc contains incorrect test cases that contradict the implementation

- **Location:** `docs/plans/2026-03-13-artefact-types-prompt-builders.md` — Phase 2 test list
- **Issue:** The plan lists this expected test behaviour: `Given artefacts with context files` → returns `code_and_requirements`. However, the LLD (`lld-artefact-pipeline.md` section 3.3) and both the implementation (`classify-quality.ts`) and the test (`classify-quality.test.ts`) correctly map `context_files` to `code_and_design`, not `code_and_requirements`. The plan doc is the stale artefact — it was not updated when the quality classification logic was finalised.
- **Impact:** A future developer using the plan as a reference to add more tests would write a test with the wrong expected value, causing a test failure or, worse, correcting the implementation to match the wrong plan.
- **Suggested action:** Update `docs/plans/2026-03-13-artefact-types-prompt-builders.md` Phase 2 test list to replace `code_and_requirements` with `code_and_design` for the context-files case.

### W2 — `RawArtefactSetSchema` requires `file_contents` to be non-empty (`.min(1)`) but the design allows empty file content arrays

- **Location:** `src/lib/engine/prompts/artefact-types.ts` line 29 — `file_contents: z.array(ArtefactFileSchema).min(1)`
- **Issue:** The design (LLD section 3.2) specifies `file_contents` as "curated subset — top N files by lines changed". It is described as always being a subset, but the LLD does not guarantee it is non-empty. For a PR where all changed files are exempt patterns or all changed files are test files, `file_contents` could legitimately be empty (with `test_files` and the diff being the meaningful artefacts). The `.min(1)` constraint would cause `RawArtefactSetSchema.parse()` to throw, rejecting a structurally valid artefact set.
- **Impact:** Edge case but runtime failure — a PR composed entirely of test files (no source files) would fail schema validation when constructing the artefact set, blocking assessment creation.
- **Suggested action:** Change `file_contents: z.array(ArtefactFileSchema).min(1)` to `z.array(ArtefactFileSchema)` (allow empty). Add a test case for the empty file contents scenario.

### W3 — `user_organisations` table is missing an `is_admin` column despite ADR-0004 specifying it

- **Location:** `supabase/migrations/20260309000001_core_tables.sql` lines 80–95
- **Issue:** ADR-0004 ("Roles & Access Control Model") specifies the conceptual schema as including `is_admin (boolean)` on `user_organisations`. The design doc section 4.1 and RLS helper functions (`is_org_admin()`) instead derive admin status from `github_role IN ('admin', 'owner')` directly — there is no `is_admin` column. The ADR's "Storage schema (conceptual)" block shows `is_admin` as a column but the actual migration and L4 contract do not include it.
- **Impact:** The ADR's stated schema is not what was implemented. This is a minor gap since the implemented approach (deriving admin status from `github_role`) is sound and matches what the design doc section 4.2 (`is_org_admin()` function) describes. However, the ADR document contains a misleading conceptual schema that would confuse a developer reading it in isolation. ADR-0004 also still has `Status: Proposed` rather than `Accepted`.
- **Suggested action:** Update ADR-0004 to (a) change status from `Proposed` to `Accepted`, (b) update the conceptual schema to remove `is_admin` and replace with `github_role (text)`, noting that admin status is derived via `is_org_admin()` rather than a boolean column.

### W4 — `org_config` table is missing `context_file_patterns` field planned in the LLD

- **Location:** `supabase/migrations/20260309000001_core_tables.sql` — `org_config` and `repository_config` tables
- **Issue:** `lld-artefact-pipeline.md` section 2.5 specifies that `org_config` must include a `context_file_patterns` field (glob patterns pointing to supplementary context files — design docs, requirements, ADRs). This field is explicitly described: "Stored in `org_config`". The artefact types (`src/lib/engine/prompts/artefact-types.ts`) include `context_files` in `RawArtefactSet`, and the LLD considers the feature complete once this config field exists. Neither the `org_config` nor `repository_config` migration includes this column.
- **Impact:** The artefact pipeline engine supports `context_files` as an artefact type, but there is no database column to configure which files should be fetched. This means the "supplementary context files" feature (which elevates artefact quality to `code_requirements_and_design`) is designed and partially implemented in the engine but cannot be configured by Org Admins. The LLD notes this as a known gap (plan doc also acknowledges it as out of scope for issue #25), but it is a schema gap relative to the L4 contracts.
- **Suggested action:** Create a GitHub issue to add `context_file_patterns text[] NOT NULL DEFAULT '{}'` to both `org_config` and `repository_config` in a new migration. This is a V1 requirement (Story 2.2 mentions design documents in artefact extraction).

### W5 — Scoring in `assess-pipeline.ts` runs sequentially rather than in parallel, contradicting the design intent

- **Location:** `src/lib/engine/pipeline/assess-pipeline.ts` — `scoreAnswers()` function, lines 139–156
- **Issue:** The design doc section 3.1 (Phase 3 diagram) shows scoring calls as sequential ("score answer 1 → score answer 2 → ...") with the note "one call per answer — isolated to prevent cross-contamination". However, the note is about *isolation* (no batching), not *sequencing*. The design does not mandate sequential processing. The implementation uses a `for...of` loop with `await processAnswer(...)` inside, meaning answers are scored one at a time. For an assessment with 3 participants × 5 questions = 15 LLM calls, sequential processing adds substantial latency where parallel processing (with `Promise.all`) would be both faster and equally isolated.
- **Impact:** Performance issue — not a correctness bug. The design contract says each answer uses a separate LLM call (fulfilled), but does not prohibit parallel execution. This will extend assessment completion time significantly at production scale and approaches the 10-second per-answer performance target stated in requirements Cross-Cutting Concerns section.
- **Suggested action:** Replace the sequential scoring loop with `Promise.all(answers.map(...))` to score all answers concurrently. Each call remains isolated (separate LLM call, separate schema validation). This is a performance improvement that does not change the correctness contract.

### W6 — `QuestionGenerationResponseSchema` enforces minimum 1 question (`z.array(QuestionSchema).min(1)`) but story and design require minimum 3

- **Location:** `src/lib/engine/llm/schemas.ts` line 36 — `questions: z.array(QuestionSchema).min(1).max(5)`
- **Issue:** Story 4.1 AC: "the system generates 3-5 questions (configurable)". The design doc section 4.6 specifies question count range 3-5. The `AssembledArtefactSet` schema correctly enforces `question_count: z.number().int().min(3).max(5)`. However, the LLM response schema only enforces `min(1)`, meaning a response with 1 or 2 questions would pass Zod validation and only be caught by the count-check in `generateQuestions()`. This means the schema and the business rule are split across two layers rather than being expressed at the schema level where the type is defined.
- **Impact:** Weak schema validation. The schema would accept a `QuestionGenerationResponse` with 2 questions — a type mismatch between the LLM response type and the business constraint. The downstream count-check in `generate-questions.ts` catches this, but having two validation layers for the same rule adds confusion about which is authoritative.
- **Suggested action:** Change `.min(1)` to `.min(3)` in `QuestionGenerationResponseSchema` to align with the design contract. The downstream count-check can remain as a guard but should not be the primary enforcement point.

### W7 — `lld-artefact-pipeline.md` issue scope table shows `ArtefactSource` port and `GitHubArtefactSource` adapter as "New issue needed" — these issues have not been tracked

- **Location:** `docs/design/lld-artefact-pipeline.md` section 6 — Issue Scope Mapping
- **Issue:** The LLD explicitly lists three components as requiring new issues: (1) `ArtefactSource` port interface, (2) `GitHubArtefactSource` adapter (Octokit), (3) Multi-PR merge strategy. These are marked with "New issue needed" in the scope table. There is no evidence in the code that these have been implemented, and the implementation plan (`2026-03-09-v1-implementation-plan.md`) treats artefact extraction as a future phase. The port interface itself (`src/lib/engine/ports/artefact-source.ts` as specified in the LLD) does not appear to exist in the current source tree.
- **Impact:** The artefact assembly layer is implemented (prompts, truncation, classification) but the extraction layer (GitHub adapter) has no issue, no design issue reference, and no implementation. The pipeline is half-built — the engine can assemble artefacts if given a `RawArtefactSet`, but nothing can produce one from a real PR yet.
- **Suggested action:** Create GitHub issues for (a) `ArtefactSource` port interface, (b) `GitHubArtefactSource` adapter, and (c) multi-PR merge strategy. Reference `lld-artefact-pipeline.md` sections 2.1–2.6.

### W8 — `assess-pipeline.ts` barrel export hygiene

- **Location:** `src/lib/engine/pipeline/assess-pipeline.ts` and `src/lib/engine/pipeline/index.ts`
- **Issue:** `calculateAssessmentAggregate` and `AggregateResult` are not re-exported from barrel files. Tests import directly from the internal module path `@/lib/engine/pipeline/assess-pipeline` rather than the public barrel `@/lib/engine/pipeline`.
- **Impact:** Minor architecture hygiene. The clean architecture principle (depend on public interfaces, not internal paths) is partially violated.
- **Suggested action:** Verify `src/lib/engine/pipeline/index.ts` re-exports all intended public types and functions. Update test imports to use the barrel path.

### W9 — Test coverage gap: `assess-pipeline.ts` has no test for the case where `questionIndex` is out of range

- **Location:** `tests/lib/engine/pipeline/assess-pipeline.test.ts`
- **Issue:** `scoreAnswers()` includes a guard for `answer.questionIndex` being out of range, but there is no test case exercising this path.
- **Impact:** Low risk in isolation, but the guard path (recording a `validation_failed` failure) is non-trivial logic that could mask data corruption bugs if it silently fails in production.
- **Suggested action:** Add a test: `Given an answer with questionIndex out of range, then it records a validation_failed failure and continues scoring remaining answers`.

---

## Informational

### I1 — ADR-0004 status is `Proposed` rather than `Accepted`

All other V1 ADRs are `Accepted`. The design decisions within ADR-0004 have been implemented (the `user_organisations` schema, `github_role` column, and `is_org_admin()` function are all present), so the status appears to be a documentation oversight rather than a genuinely unresolved decision.

### I2 — Design documents not updated since engine implementation

The `docs/design/v1-design.md` (v0.7) was last updated 2026-03-09. The `lld-artefact-pipeline.md` (v0.2) was last updated 2026-03-13. Three subsequent commits have landed since (`feat/assessment-engine` branch: issues #28, #29, #30, #44). The design documents have not been updated to reflect implementation outcomes. This is expected at Phase 0.5 but should be addressed before the Phase 1 review.

### I3 — Email service component is TBD

The email service (Component 5 in `v1-design.md` section 2) is described as "V1 approach TBD". Story 3.2 (FCS Participant Notification) requires email but the component is unspecified. This is appropriate for the current phase but will need a design decision before Epic 3 implementation begins.

### I4 — No coverage measurement configured

ADR-0009 (Test Diamond Strategy) specifies coverage targets: engine 90%, API routes 85%, overall 80%. There are no coverage measurement artefacts (no coverage report configuration) to verify the 90% engine target is being met.

### I5 — Pipeline barrel file exports should be confirmed

`src/lib/engine/pipeline/index.ts` should be verified to export the full public API surface intended by the design for consumers (future API routes, webhook handlers).

### I6 — Architecture fitness tests existence unverified

The `tests/architecture.test.ts` file exists (suggesting architecture fitness tests are in place), but it should be verified that the clean architecture rule (no framework imports in `src/lib/engine/`) is encoded as an enforced test.

### I7 — Stale cross-reference in requirements appendix

The spike-003 appendix entry in `v1-requirements.md` still reads "PR metadata export via commit status", which contradicts the current Story 2.9 acceptance criteria (Check Run only, per v0.6 update). The spike documents themselves are correct; only the appendix cross-reference is stale.

### I8 — `participantScores` in `AggregateResult` (formerly C1 — resolved)

ADR-0005 was revised on 2026-03-16 to adopt Option 4 (self-directed private view for FCS). Per-participant scores are now a justified data requirement for the self-directed view (Story 3.4) and re-assessment flow (Story 3.6). The `participantScores: Map<string, number>` field in `src/lib/engine/pipeline/assess-pipeline.ts` is no longer a violation. **However**, consumers of this field must enforce strict access control: participant scores are readable only by the owning participant, never by Org Admins or other participants. The data model (`participant_answers` table) will need a score column with RLS restricting reads — this is a follow-up from the revised ADR-0005 consequences. Additionally, PRCC pipeline consumers must **not** expose `participantScores` — the self-view is FCS only.

---

## Coverage Matrix

| Epic | Stories | Designed | ADR'd | Code implemented | Tests | Coverage |
|------|---------|----------|-------|------------------|-------|----------|
| Epic 1: Org Setup | 5 (1.1–1.5) | Yes — v1-design.md L1–L4 | ADR-0001, 0002, 0003, 0004 (Proposed), 0007, 0008 | Not yet | Not yet | 0% |
| Epic 2: PRCC Flow | 9 (2.1–2.9) | Yes — v1-design.md L1–L4, spike-003 | ADR-0001, 0006, 0007 | Not yet | Not yet | 0% |
| Epic 3: FCS Flow | 5 (3.1–3.5) | Yes — v1-design.md L1–L4 | ADR-0001, 0005 | Not yet | Not yet | 0% |
| Epic 4: Assessment Engine | 5 (4.1–4.5) | Yes — v1-design.md L4, lld-artefact-pipeline.md, ADR-0010, 0011 | ADR-0005, 0009, 0010, 0011 | Stories 4.1–4.4 implemented (prompts, generation, scoring, relevance, aggregate, pipeline). Story 4.5 retry logic in `AnthropicClient`. Artefact extraction port/adapter not yet built. | Unit tests for all implemented modules; pipeline integration test covers Stories 4.1–4.4 combined | ~85% |
| Epic 5: Web App & Auth | 4 (5.1–5.4) | Yes — v1-design.md L3–L4, spike-004 | ADR-0002, 0003 | Not yet | Not yet (placeholder only) | 0% |
| Epic 6: Reporting | 4 (6.1–6.4) | Yes — v1-design.md L1 capabilities | ADR-0005 | Not yet | Not yet | 0% |

---

## Recommendations

Ordered by urgency relative to the current phase.

1. ~~**[Resolved]**~~ `participantScores` in `AggregateResult` is now justified by ADR-0005 revision (Option 4). Follow-up: ensure PRCC consumers do not expose this field, and add RLS to `participant_answers` score column restricting reads to the owning participant.

2. **[Critical — before Phase 1 API routes]** Document the `LLMClient` port interface design decision (model default, schema-parameterised interface contract) in ADR-0010's consequences or a new ADR. Record the V1 model identifier (`claude-sonnet-4-20250514`) as a tracked configuration value, not a silent default.

3. **[Warning — before issue #25 is closed out]** Change `QuestionGenerationResponseSchema` array validation from `.min(1)` to `.min(3)` to align with the design contract.

4. **[Warning — before Epic 2/3 implementation]** Create GitHub issues for the missing artefact extraction components: `ArtefactSource` port interface, `GitHubArtefactSource` adapter, and multi-PR merge strategy.

5. **[Warning — before Epic 1 implementation]** Add `context_file_patterns text[] NOT NULL DEFAULT '{}'` to both `org_config` and `repository_config` tables in a new migration.

6. **[Warning — before Epic 2/3 scoring is integrated]** Replace the sequential scoring loop in `scoreAnswers()` with `Promise.all` to run answer scoring in parallel.

7. **[Warning — before Phase 1 review]** Update ADR-0004 status from `Proposed` to `Accepted` and correct the conceptual schema. Correct the stale spike-003 appendix entry in `v1-requirements.md`.

8. **[Info — ongoing]** Update `docs/plans/2026-03-13-artefact-types-prompt-builders.md` Phase 2 test cases to correct the `context_files → code_and_requirements` mapping to `context_files → code_and_design`.
