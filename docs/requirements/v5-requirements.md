# Token Budget Enforcement — V5 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 |
| Status | Draft — Complete |
| Author | LS / Claude |
| Created | 2026-04-24 |
| Last updated | 2026-04-24 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-24 | LS / Claude | Initial draft — structure |
| 0.2 | 2026-04-24 | LS / Claude | Acceptance criteria for all stories |

---

## Context / Background

The 2026-04-24 assessment of epic #240 (7 child issues, 7 merged PRs, 33 files) failed with a 400 error: the assembled artefacts totalled ~326K tokens against the model's 163K context limit. The `truncateArtefacts()` function exists in `src/lib/engine/prompts/truncate.ts` with a 100K default budget and priority-based truncation logic, but it is never called in the pipeline — `token_budget_applied` is hardcoded to `false` in `extractArtefacts()` ([service.ts:564](src/app/api/fcs/service.ts#L564)).

For small PRs and single-issue assessments, the artefact set fits comfortably within context limits. Epic-scale assessments with multiple child issues and PRs routinely exceed them. V4 Epic 2 (epic-aware discovery) made this worse by correctly discovering more artefacts — but the pipeline has no mechanism to fit them within the model's context window.

The strategy is: **truncate to fit, surface the loss, let the user enable agentic retrieval to compensate**. The existing `truncateArtefacts()` function provides the truncation machinery; this epic wires it into the pipeline with a model-aware budget and smart prioritisation rules. V2 Epic 17 (agentic retrieval) provides the compensating mechanism — the LLM can use `readFile`/`listDirectory` tools to fetch content that was truncated, guided by the file listing which is always preserved in full.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Token budget** | The maximum number of estimated tokens the assembled artefact set may consume before being passed to the LLM. Derived from the model's context limit minus a reserve for system prompt and output tokens. |
| **Context limit** | The maximum input + output token count a model supports. Model-specific; configured per model identifier. |
| **Budget reserve** | The portion of the context limit held back for system prompt, output tokens, and tool-use overhead. Default: 20% of context limit. |
| **Truncation** | The process of reducing artefact content to fit within the token budget by dropping or shortening lower-priority content sections. |

Terms from V1–V4 (artefact, assembled artefact set, file listing, linked issue, agentic retrieval, tool-use loop) remain as defined there.

---

## Design Principles / Constraints

1. **Model-aware budget.** The token budget is derived from the model's context limit, not a fixed constant. Different models have different limits; the budget must adapt.
2. **Budget = contextLimit × 0.8.** The 20% reserve covers the system prompt (~2K tokens), output tokens (4K default), and tool-use message overhead when agentic retrieval is active. This ratio is a default, not configurable per-assessment.
3. **Truncation is lossy, not silent.** When truncation occurs, the system must surface what was dropped so the user understands why questions may not cover the full feature.
4. **File listing is never truncated.** The file listing (paths + change stats) is cheap and serves as the LLM's "table of contents" for agentic retrieval. It must always be included in full.
5. **Agentic retrieval compensates for truncation.** The LLM can use tools to fetch content that was truncated. This is opt-in (user enables it) — the system surfaces a message recommending it when truncation is significant.

---

## Roles

Unchanged from V4:

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | Creates assessments, configures retrieval settings. |
| **System** | Internal | Assembles artefacts, applies truncation, generates rubric. |

---

## Epic 1: Model-Aware Token Budget Enforcement [Priority: High]

Wire the existing `truncateArtefacts()` function into the pipeline with a token budget derived from the model's context limit. Surface truncation details to the user so they can make an informed decision about enabling agentic retrieval.

**Priority rationale:** Without this, any epic-scale assessment fails with a 400 error. This is a blocking bug for the primary use case (assessing epics/features spanning multiple PRs).

**Dependency:** `truncateArtefacts()` in `truncate.ts` (V1, already implemented). Agentic retrieval (V2 Epic 17, already implemented). Epic-aware discovery (V4 Epic 2, already implemented).

### Story 1.1: Model context limit lookup from OpenRouter

**As the** system,
**I want to** fetch the context limit for the configured model from the OpenRouter API,
**so that** the token budget is automatically derived from the model's actual capacity without maintaining a hardcoded map.

OpenRouter exposes `context_length` per model via `GET /api/v1/models`. The pipeline can query this at rubric generation time (cached) rather than maintaining a local model → limit mapping.

**Acceptance Criteria:**

- Given the configured model identifier (e.g. `anthropic/claude-sonnet-4-6`), when the pipeline needs the token budget, then it fetches the model's `context_length` from the OpenRouter `GET /api/v1/models` endpoint.
- Given a successful API response, when the model is found in the response `data` array by matching `id`, then `context_length` is returned as an integer.
- Given a successful API response, when the model is not found in the response (unknown model ID), then the system falls back to a conservative default context limit of 100,000 tokens and logs a warning with the unrecognised model ID.
- Given the OpenRouter API returns `context_length: null` for the model, then the system falls back to the same conservative default (100,000 tokens) and logs a warning.
- Given the OpenRouter API call fails (network error, non-2xx response), then the system falls back to the conservative default and logs a warning — rubric generation is not blocked by a metadata API failure.
- Given the context limit has been fetched for a model, when the same model is used again within the same process lifetime, then the cached value is used (no repeated API call).

**Notes:** The `OPENROUTER_API_KEY` already in use for LLM calls authenticates this endpoint. The response is a list of all models — filter by `id` matching the configured model string. Cache in-memory (module-level `Map<string, number>`).

---

### Story 1.2: Wire truncation into the artefact pipeline

**As the** system,
**I want to** apply `truncateArtefacts()` to the assembled artefact set before passing it to rubric generation,
**so that** the artefact set fits within the model's context window and rubric generation does not fail with a 400 error.

**Dependency:** Story 1.1 (context limit must be available to compute the budget).

**Acceptance Criteria:**

- Given an assembled artefact set from `extractArtefacts()`, when the pipeline prepares for rubric generation, then `truncateArtefacts()` is called with `tokenBudget` set to `Math.floor(contextLimit * 0.8)` where `contextLimit` comes from Story 1.1.
- Given an artefact set that fits within the token budget without truncation, when `truncateArtefacts()` runs, then all content is preserved unchanged, `token_budget_applied` is `false`, and `truncation_notes` is `undefined`.
- Given an artefact set that exceeds the token budget, when `truncateArtefacts()` runs, then content is truncated following the existing priority ordering: test files dropped first, then file contents dropped from tail, then diff truncated, then context files truncated. PR description, linked issues, and file listing are never truncated.
- Given truncation occurs, when the `AssembledArtefactSet` is returned, then `token_budget_applied` is `true` and `truncation_notes` contains one or more human-readable strings describing what was dropped (e.g. "12 of 33 file contents dropped", "Code diff truncated", "All 16 test files dropped").
- Given the artefact set previously had `token_budget_applied` hardcoded to `false` in `extractArtefacts()`, when this story is complete, then that hardcoded value is removed and the field reflects actual truncation state from `truncateArtefacts()`.
- Given truncation is applied, when the artefact summary log is emitted, then it includes `tokenBudgetApplied: true`, the `truncation_notes` array, the computed `tokenBudget`, and the model `contextLimit` that drove it.

**Notes:** The call site is in `extractArtefacts()` in `service.ts`. The `truncateArtefacts()` function already returns an `AssembledArtefactSet` with the correct fields — the change is wiring it between `mergeIssueContent()` and the return value. The `question_count` must be passed through `TruncationOptions`.

---

### Story 1.3: Surface truncation details on assessment results

**As an** Org Admin,
**I want to** see what content was truncated when viewing assessment results,
**so that** I understand the scope of information the LLM had access to and can decide whether to enable agentic retrieval for richer coverage.

**Dependency:** Story 1.2 (truncation must produce the data to display).

**Acceptance Criteria:**

**Schema:**

- Given the `assessments` table, then two new nullable columns are added: `token_budget_applied boolean` and `truncation_notes jsonb` (array of strings).
- Given rubric generation completes (success or failure), when the assessment row is updated, then `token_budget_applied` and `truncation_notes` are persisted from the `AssembledArtefactSet`.

**Results page:**

- Given an assessment where `token_budget_applied` is `true`, when the Org Admin views the results page, then a "Truncation details" section is visible showing each note from `truncation_notes` as a list item.
- Given an assessment where `token_budget_applied` is `true` and agentic retrieval was not enabled, when the Org Admin views the truncation details, then a message is displayed recommending: "Some artefacts were truncated to fit the model's context window. Enable retrieval in organisation settings to let the LLM fetch additional content on demand."
- Given an assessment where `token_budget_applied` is `false` or `null`, when the Org Admin views the results page, then no truncation section is shown.
- Given an assessment where both truncation and retrieval details exist, when the Org Admin views the results page, then both sections are visible — truncation details appear above retrieval details.

**Notes:** The truncation section can be added to the existing results page alongside `RetrievalDetailsCard`. The `truncation_notes` column uses `jsonb` (not `text[]`) for consistency with `rubric_tool_calls`. Migration: add columns, no data backfill needed (existing assessments get `null`).

---

## Cross-Cutting Concerns

### Truncation priority ordering

The existing `truncateArtefacts()` function defines a priority ordering (test files → file contents → diff → context files → file listing → linked issues → PR description). This ordering should be reviewed against epic-scale artefact sets where linked issues (epic + child issue bodies) may be disproportionately large. V4 Story 2.3 specifies: child comments truncated before child bodies, child bodies before epic body.

### Interaction with agentic retrieval

When truncation drops file contents, the LLM loses inline access to those files but retains the file listing. With agentic retrieval enabled, the LLM can `readFile` to fetch any file it needs. The truncation message should make this connection explicit: "N files truncated — enable retrieval to let the LLM fetch them on demand."

### Logging

Truncation events should be logged with the same structured format as existing artefact summary logs: `tokenBudgetApplied`, `truncation_notes`, budget used vs available, and the model context limit that drove the budget.

---

## What We Are NOT Building

- **Auto-enabling agentic retrieval** — truncation surfaces a recommendation; the user decides.
- **Configurable budget reserve ratio** — the 20% reserve is a default. Making it configurable adds complexity without clear value.
- **Per-assessment token budget override** — the budget is derived from the model. No UI to override it.
- **Smarter-than-truncation strategies** — no summarisation, no multi-pass generation, no relevance scoring. Truncation + agentic retrieval is the strategy.
- **Configurable per-model context limit overrides** — the system fetches limits from OpenRouter automatically. No local override mechanism.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | Should truncation priority treat linked issues (epic + child bodies) differently from PR-sourced content for epic assessments? | For epics, issue bodies contain acceptance criteria and design context — often higher signal than individual file diffs. Current priority puts linked issues above file contents but below PR description. | A) Keep current priority (issues > files). B) Elevate issue bodies above PR diff for epic artefact types. | Affects which content survives truncation for large epics. |
| ~~2~~ | ~~Where should model context limits be stored?~~ | Resolved: Fetch from OpenRouter `GET /api/v1/models` endpoint, which returns `context_length` per model. Cache to avoid repeated API calls. | Decided: Auto-detect from OpenRouter API. | Story 1.1 fetches and caches the context limit. No local mapping needed. |
