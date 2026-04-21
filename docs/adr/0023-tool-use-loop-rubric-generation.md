# ADR-0023: Tool-Use Loop for Rubric Generation

- Status: Accepted
- Date: 2026-04-16 (proposed), 2026-04-21 (accepted — E17 fully shipped, PRs #263–#270)
- Deciders: LS / Claude
- Supersedes: N/A
- Related: ADR-0015 (OpenRouter as LLM gateway), [V2 Epic 17](../requirements/v2-requirements.md)

## Context

V1 rubric generation assembles a fixed artefact set upfront (PR diff, PR body, linked issue bodies, a handful of commit messages) and issues a single structured LLM call. When the model notices critical context is missing it can only emit hints via `additional_context_suggestions` — passive metadata that we persist but never act on within the same assessment.

The V2 Epic 17 requirements originally proposed bridging that gap with a deterministic **orchestrator-over-strategies** design: the LLM would emit a list of requested artefact types, deterministic code would match each request to a `RetrievalStrategy` implementation, fetch the artefacts, and re-issue the LLM call with an enriched payload. A feasibility study (Story 17.1) was scoped to validate the approach before implementation.

This framing has two problems:

1. **It is a 2023 architecture in a 2026 codebase.** Every production coding agent (Claude Code, Cursor, Aider, Codex, etc.) uses tool-use loops rather than batch-suggest-then-fulfil pipelines. The ecosystem has converged; a feasibility study reads as anachronistic.
2. **It inherits the wrong primitive from V1.** Treating `additional_context_suggestions` as the authoritative signal pushes the design toward batch orchestration. With tool-use, the LLM does not need to emit suggestion strings at all — it simply calls a tool when it wants a file.

We need an architectural decision before rewriting the Epic 17 LLD and task issues.

## Decision

Extend the `LLMClient` port with a tool-use-capable method and implement rubric generation as a **single multi-turn LLM call with bounded tool-use**, not a two-phase orchestrator. The existing artefact set (PR diff, PR body, linked issues, commits) remains the primary context; tools augment it when the LLM determines the provided information is insufficient.

### Tool set (initial)

Two read-only tools, scoped to the assessment's repository:

```ts
readFile(path: string): { content: string } | { error: 'not_found', similar_paths: string[] }
listDirectory(path: string): { entries: Array<{ name: string, kind: 'file' | 'dir' }> }
```

- All paths are repo-relative. Absolute paths, `..` traversal, and symlinks outside the repo are rejected at the tool-handler level with a typed `forbidden_path` error.
- Implementations delegate to the existing Octokit adapter — no new GitHub scopes are required (the V1 `contents:read` permission already covers them).

### Loop bounds

- **≤ 5 tool calls** per rubric generation.
- **≤ 64 KiB** total bytes returned via tool calls.
- **≤ 10 000** extra input tokens from tool results.
- **≤ 60 s** wall-clock; enforced via `AbortSignal`.

Any bound exceeded returns a typed error to the LLM; the LLM is expected to finalise with whatever it has. The assessment is never aborted by the tool loop.

### Observability (non-negotiable)

Every rubric generation persists on the assessment row:

- `rubric_input_tokens: int`
- `rubric_output_tokens: int`
- `rubric_tool_call_count: int`
- `rubric_tool_calls: jsonb` — ordered array of `{ tool_name, argument_path, bytes_returned, outcome }`
- `rubric_duration_ms: int`

These fields are added unconditionally (not gated on the retrieval feature flag) because single-call metrics are useful even without tool use.

### Scope

- **In:** Rubric generation (question generation from artefacts).
- **Out:** Per-answer scoring — already has a reference answer, adding tools would explode cost for no signal gain. Relevance detection — trivially small inputs, no benefit.

### Artefact quality feedback — tool-call log (E11 cancelled)

E11 (Artefact Quality Scoring) was cancelled (2026-04-18). Rather than scoring artefact quality via a separate or combined LLM call, the tool-call log itself serves as the feedback mechanism. When the LLM attempts to read artefacts that do not exist (e.g., ADRs, design docs), `not_found` outcomes in the log are surfaced as a brief "Missing artefacts" summary on the results page, giving the Org Admin actionable signals about what to create or improve. No separate quality scoring system is required.

## Options Considered

### Option A: Deterministic orchestrator over a strategy registry (original LLD)

LLM emits structured list of wanted artefact types → our code matches each to a `RetrievalStrategy` → re-run LLM with enriched context.

**Pros:**
- Predictable execution path; easy to reason about cost and failures.
- Strategy registry is a clean extension point.

**Cons:**
- **Inverts agency.** LLM proposes, code disposes. Every time the LLM needs something we did not anticipate, the strategy registry must be extended. This is the exact failure mode tool-use was designed to eliminate.
- Requires an upfront **suggestion taxonomy** study; artefact types the LLM did not ask for during the V1 window are unreachable.
- Two-phase execution doubles round-trip latency compared to a single multi-turn call.
- Diverges from the industry pattern — onboarding engineers familiar with agentic systems will find the design surprising.

**Rejected** because the cons are structural, not incidental.

### Option B: Tool-use loop with `readFile` + `listDirectory` only (chosen)

LLM calls tools in-flight; our code supplies answers within bounds; LLM finalises.

**Pros:**
- Matches the 2026 agentic-system pattern; no architectural surprise.
- Minimal tool set — two tools cover every artefact type V1's suggestion-log survey would have identified (ADRs, design docs, runbooks, source files in repo). Expanding the set is cheap and data-driven.
- Single multi-turn call — lower latency than two-phase generation.
- No suggestion taxonomy needed up-front.

**Cons:**
- Harder to bound cost *exactly* ahead of time; we use caps + typed errors to keep it tight.
- LLM can waste calls on irrelevant files; mitigated by a small directory index in the system prompt and by the 5-call cap.

**Chosen.**

### Option C: Rich tool set (issue fetcher, PR searcher, ADR lister, etc.)

Tool set extended beyond `readFile` + `listDirectory` from day one.

**Pros:** Richer call semantics for common cases.

**Cons:** Premature. The 80% case is files; adding tools speculatively violates the simplicity-first principle in [CLAUDE.md](../../CLAUDE.md#2-simplicity-first). We start minimal and add tools when the call log shows consistent gaps.

**Rejected** as premature; revisited when 17.1 has produced a call-log dataset.

### Option D: RAG pipeline with embeddings

Embed all repo artefacts; retrieve top-K on a query derived from the PR; pass to LLM.

**Pros:** Cheap at inference time.

**Cons:** Heavy upfront indexing infrastructure; stale when code changes; does not match the agentic mental model. No existing embedding infrastructure in this repo — would be a large net-new capability.

**Rejected** on cost and fit.

## Consequences

### Positive

- Rubric generation aligns with the agentic-system industry pattern.
- `additional_context_suggestions` becomes a diagnostic/analytics artefact, not load-bearing infrastructure. It can stay in the LLM schema as an optional output for post-hoc analysis.
- Observability lands alongside the feature rather than as a follow-on story — we will have token and call-log data from day one.
- Two concrete tools + one bounded loop replace a registry + taxonomy + multiple strategy implementations; the E17 LLD and issue list collapse significantly.
- Tool-call log provides organic artefact quality signal (`not_found` outcomes) without a dedicated quality-scoring system (E11 cancelled).

### Negative

- The `LLMClient` port gains a second method (`generateWithTools`). This is a widening of a load-bearing interface; adapters other than OpenRouter (if any are added later) must implement it.
- Tool-use introduces non-determinism in the number of LLM round-trips per assessment. Latency and cost vary per generation; dashboards must show percentiles, not just means.
- Path allow-listing is security-critical. A single slip (e.g. following a symlink out of the repo) is a path-traversal vulnerability. Implementation must have dedicated unit tests for the path-safety layer.

### Neutral

- OpenRouter already supports tool-use natively (it proxies to providers that do). No gateway change required.
- Scoring and relevance detection keep their single-shot structured-output paths; `generateStructured` remains the primary method on the port.

## Implementation Notes

- Engine-layer types for the tool loop live in `src/lib/engine/llm/tools.ts` (new file): `ToolDefinition`, `ToolCall`, `ToolResult`, `ToolLoopBounds`.
- Tool handlers live in the adapter layer (`src/lib/github/tools/*.ts`) so the engine stays I/O-free.
- The path-safety layer is its own module (`src/lib/github/tools/path-safety.ts`) with exhaustive unit tests covering absolute paths, `..` traversal, symlink escape, Windows-style paths, and case-sensitivity edge cases.
- Schema additions (tokens, tool-call log, duration) are applied declaratively via `supabase/schemas/tables.sql` and generated as a migration per the workflow in [CLAUDE.md § Database Migration Workflow](../../CLAUDE.md#database-migration-workflow).

## References

- [V2 requirements — Epic 17](../requirements/v2-requirements.md#epic-17-agentic-artefact-retrieval)
- [LLD for E17](../design/lld-v2-e17-agentic-retrieval.md)
- [ADR-0015: OpenRouter as LLM gateway](0015-openrouter-as-llm-gateway.md)
- Anthropic tool-use documentation — standard multi-turn tool-call pattern
- Storey (2026) — triple-debt framing: intent debt and the motivation for enriched context retrieval
