# Artefact Input Types and Prompt Builders — Implementation Plan

## Overview

Implement the assembly layer of the artefact pipeline (LLD section 3): TypeScript
types with Zod schemas for assessment artefacts, artefact quality classification,
token-aware truncation, and the question generation prompt builder. This is the
pure engine logic that takes extracted artefacts and produces prompt-ready input
for the LLM. Covers issue #25.

## Current State

- LLM client wrapper exists (`src/lib/engine/llm/client.ts`) with retry logic
- LLM response schemas exist (`src/lib/engine/llm/schemas.ts`): `QuestionGenerationResponseSchema`, `ScoringResponseSchema`, `RelevanceResponseSchema`
- LLM types exist (`src/lib/engine/llm/types.ts`): `LLMClient` interface, `LLMResult<T>`
- Test fixtures exist (`tests/fixtures/llm/`) for LLM responses
- Mock LLM client exists (`tests/fixtures/llm/mock-llm-client.ts`)
- No artefact input types, no prompt builders, no truncation logic
- ADR 0011: Deterministic extraction strategy (V1)
- LLD approved: `docs/design/lld-artefact-pipeline.md`

## Desired End State

- Artefact input types with Zod validation in `src/lib/engine/prompts/`
- `classifyArtefactQuality()` function
- `estimateTokens()` utility and `truncateArtefacts()` function
- `buildQuestionGenerationPrompt()` returning `{ systemPrompt, userPrompt }`
- System prompt text incorporating all three Naur layer definitions from Story 4.1
- Full BDD test coverage in `tests/lib/engine/prompts/`
- All tests pass, types check, lint clean

## Out of Scope

- `ArtefactSource` port interface (separate issue)
- `GitHubArtefactSource` adapter / Octokit integration (separate issue)
- Multi-PR merge logic (separate issue)
- Scoring and relevance prompt builders (separate issues — #25 is question generation only)
- Database persistence of artefact quality
- `context_file_patterns` config field in `org_config` (DB schema change — separate issue)

## Approach

Strict TDD: one test at a time, red-green-refactor. Four phases, each
independently verifiable. All code in `src/lib/engine/prompts/` — pure domain
logic, no framework imports, no I/O.

---

## Phase 1: Artefact Input Types and Zod Schemas

### Changes Required

**New file: `src/lib/engine/prompts/artefact-types.ts`**

Zod schemas and inferred types for:

- `ArtefactFileSchema` / `ArtefactFile` — `{ path: string, content: string }`
- `FileListingEntrySchema` / `FileListingEntry` — `{ path, additions, deletions, status }`
- `LinkedIssueSchema` / `LinkedIssue` — `{ title, body }`
- `RawArtefactSetSchema` / `RawArtefactSet` — full artefact set as extracted
- `AssembledArtefactSetSchema` / `AssembledArtefactSet` — extends raw with `question_count`, `artefact_quality`, `token_budget_applied`

**New file: `tests/lib/engine/prompts/artefact-types.test.ts`**

BDD tests:

- `ArtefactFileSchema` validates/rejects correctly
- `RawArtefactSetSchema` validates full and minimal sets
- `RawArtefactSetSchema` rejects missing required fields
- `AssembledArtefactSetSchema` validates with quality and question_count

### Success Criteria

#### Automated Verification

- [ ] `npx vitest run tests/lib/engine/prompts/artefact-types.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no type errors

#### Manual Verification

- [ ] Types match LLD section 3.2 definitions

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 2: Artefact Quality Classification

### Changes Required

**New file: `src/lib/engine/prompts/classify-quality.ts`**

- `classifyArtefactQuality(artefacts: RawArtefactSet): ArtefactQuality`
- Uses `ArtefactQuality` enum from existing `src/lib/engine/llm/schemas.ts`

**New file: `tests/lib/engine/prompts/classify-quality.test.ts`**

BDD tests (from issue #25 + LLD):

- `Given code-only artefacts` → returns `code_only`
- `Given artefacts with test files` → returns `code_and_tests`
- `Given artefacts with PR description` → returns `code_and_requirements`
- `Given artefacts with linked issues` → returns `code_and_requirements`
- `Given artefacts with context files` → returns `code_and_design`
- `Given artefacts with tests + requirements` → returns `code_requirements_and_design`
- `Given artefacts with tests + context files` → returns `code_requirements_and_design`

### Success Criteria

#### Automated Verification

- [ ] `npx vitest run tests/lib/engine/prompts/classify-quality.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no type errors

#### Manual Verification

- [ ] Classification logic matches LLD section 3.3

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 3: Token Estimation and Truncation

### Changes Required

**New file: `src/lib/engine/prompts/truncate.ts`**

- `estimateTokens(text: string): number` — `Math.ceil(text.length / 4)`
- `truncateArtefacts(raw: RawArtefactSet, options: TruncationOptions): AssembledArtefactSet`
  - `TruncationOptions: { tokenBudget?: number, questionCount: number }`
  - Default budget: 100,000 tokens
  - Priority ordering per LLD section 3.4 (1-3 always included, 4-7 truncated)
  - Calls `classifyArtefactQuality()` internally
  - Sets `token_budget_applied: true` if any truncation occurred
- `truncateText(text: string, maxTokens: number): string` — truncates with `... [truncated]` marker

**New file: `tests/lib/engine/prompts/truncate.test.ts`**

BDD tests (from issue #25):

- `Given artefacts within budget` → all included, `token_budget_applied: false`
- `Given artefacts exceeding budget` → truncated by priority (description > diff > files > tests)
- `Given a very large diff` → diff truncated, higher-priority artefacts intact
- `Given many file_contents exceeding budget` → lowest-priority files dropped first
- `Given test_files that don't fit` → test files dropped, everything else kept
- `estimateTokens` returns `ceil(length / 4)`

### Success Criteria

#### Automated Verification

- [ ] `npx vitest run tests/lib/engine/prompts/truncate.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no type errors

#### Manual Verification

- [ ] Priority ordering matches LLD section 3.4 table
- [ ] Token estimation uses chars/4 heuristic

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 4: Question Generation Prompt Builder

### Changes Required

**New file: `src/lib/engine/prompts/prompt-builder.ts`**

- `PromptPair` type: `{ systemPrompt: string, userPrompt: string }`
- `buildQuestionGenerationPrompt(artefacts: AssembledArtefactSet): PromptPair`
- `QUESTION_GENERATION_SYSTEM_PROMPT` constant — incorporates all three Naur layer
  definitions from requirements Story 4.1, output format instructions (JSON schema
  matching `QuestionGenerationResponseSchema`), and constraints
- `formatUserPrompt(artefacts: AssembledArtefactSet): string` — formats artefacts
  into the user prompt template per LLD section 3.5, omitting empty sections

**New file: `tests/lib/engine/prompts/prompt-builder.test.ts`**

BDD tests (from issue #25):

- `Given a full set of artefacts` → builds prompt with all sections populated
- `Given code-only artefacts` → omits linked issues, context docs sections
- System prompt contains all three Naur layer definitions
- System prompt contains JSON output format instructions
- User prompt includes assessment context (type, question count)
- User prompt includes changed files overview table
- User prompt omits sections for absent artefacts
- `Given artefact_type is 'feature'` → system prompt references feature context

**New file: `src/lib/engine/prompts/index.ts`**

- Re-exports public API: types, `classifyArtefactQuality`, `truncateArtefacts`, `buildQuestionGenerationPrompt`

### Success Criteria

#### Automated Verification

- [ ] `npx vitest run tests/lib/engine/prompts/` — all pass
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm run lint` — clean

#### Manual Verification

- [ ] System prompt text reviewed for quality and accuracy against Story 4.1
- [ ] User prompt template matches LLD section 3.5 structure
- [ ] Prompt builder produces output compatible with `LLMClient.generateStructured()`

**Pause here for manual verification before proceeding to commit.**

---

## Phase 5: Commit, PR, Review

### Changes Required

- Commit all new files referencing issue #25
- Push branch, create PR targeting `feat/assessment-engine`
- Self-review: check design adequacy, verify LLD contracts are met
- Update issue #25 with PR link

### Success Criteria

#### Automated Verification

- [ ] `npx vitest run` — all tests pass (existing + new)
- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] `npx markdownlint-cli2 "**/*.md"` — clean

#### Manual Verification

- [ ] PR is < 200 lines (quality gate)
- [ ] Test file names match source file names
- [ ] No framework imports in `src/lib/engine/prompts/`

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| PR exceeds 200-line limit | Split into two PRs: types+classification (Phase 1-2) and truncation+prompt (Phase 3-4) |
| System prompt text quality | Review against Story 4.1 reference prompts; can iterate prompt text without changing structure |
| Token estimation inaccuracy | chars/4 is conservative; budget (100k of 200k) provides large safety margin |
| `context_files` field needs DB schema change | Out of scope — types support it, but `org_config.context_file_patterns` is a separate issue |

## File Summary

| File | Action |
|------|--------|
| `src/lib/engine/prompts/artefact-types.ts` | New |
| `src/lib/engine/prompts/classify-quality.ts` | New |
| `src/lib/engine/prompts/truncate.ts` | New |
| `src/lib/engine/prompts/prompt-builder.ts` | New |
| `src/lib/engine/prompts/index.ts` | New |
| `tests/lib/engine/prompts/artefact-types.test.ts` | New |
| `tests/lib/engine/prompts/classify-quality.test.ts` | New |
| `tests/lib/engine/prompts/truncate.test.ts` | New |
| `tests/lib/engine/prompts/prompt-builder.test.ts` | New |

## References

- [Issue #25](https://github.com/leonids2005/feature-comprehension-score/issues/25)
- [LLD: Artefact Pipeline](../design/lld-artefact-pipeline.md) — section 3
- [ADR 0011: Artefact Extraction Strategy](../adr/0011-artefact-extraction-strategy.md)
- [V1 Requirements — Story 4.1](../requirements/v1-requirements.md) — lines 405-432
- [V1 Design — Section 4.6](../design/v1-design.md) — LLM prompt contracts
- [LLM Schemas](../../src/lib/engine/llm/schemas.ts) — existing response schemas
