# 0012. LLM Client Interface Design and Model Default

**Date:** 2026-03-16
**Status:** Partially superseded by [ADR-0015](0015-openrouter-as-llm-gateway.md) (adapter implementation replaced; interface contract unchanged)
**Deciders:** LS, Claude

## Context

The assessment engine makes LLM calls for question generation, answer scoring, and relevance detection. Each call requires structured JSON output validated against a Zod schema (ADR-0010). The engine needs a port interface (`LLMClient`) that abstracts the LLM provider and a concrete adapter (`AnthropicClient`) that binds to the Anthropic API.

Two design decisions need recording:

1. **Why does `generateStructured` take a `ZodType` schema parameter** rather than a simpler contract (e.g., separate methods per response type)?
2. **What is the V1 default model**, and why is it hardcoded in the adapter rather than being mandatory configuration?

## Options Considered

### Interface design

#### Option A: Schema-parameterised generic method

A single `generateStructured<T>(request)` method where callers pass a Zod schema. The method returns `LLMResult<z.infer<T>>` — the schema both validates the response and infers the return type.

- **Pros:** One method handles all response types. Adding a new response type requires only a new schema — no interface changes. Type safety flows from schema to caller automatically. Aligns with ADR-0010's "schema as source of truth" principle.
- **Cons:** Callers must import and pass schemas. The interface is more abstract than a purpose-built method per call type.

#### Option B: Separate methods per response type

`generateQuestions()`, `scoreAnswer()`, `detectRelevance()` — each with its own return type.

- **Pros:** Simpler call sites — no schema parameter needed.
- **Cons:** Interface changes every time a new LLM call type is added. Schema and type must be kept in sync manually. Violates Open/Closed principle — the port interface itself must be modified for new engine capabilities.

### Model default

#### Option C: Mandatory model parameter (no default)

Every caller must specify a model string.

- **Cons:** Boilerplate at every call site. The engine should not need to know which Claude model version to use — that is an infrastructure concern.

#### Option D: Default in adapter, overridable per call

The adapter defaults to a specific model (currently `claude-sonnet-4-20250514`), but callers can override via an optional `model` parameter.

- **Pros:** Clean separation — engine code never mentions a model. The default is centralised in the adapter constructor or method. Easy to change the default in one place.
- **Cons:** The default model is not visible to callers without reading the adapter source.

## Decision

**Option A (schema-parameterised interface) + Option D (default in adapter).**

### Interface contract

```typescript
interface LLMClient {
  generateStructured<T extends ZodType>(request: {
    prompt: string;
    systemPrompt: string;
    schema: T;
    model?: string;
    maxTokens?: number;
  }): Promise<LLMResult<z.infer<T>>>;
}
```

The schema parameter serves three purposes simultaneously:
1. **Runtime validation** — parsed JSON is validated against the schema before being returned.
2. **Type inference** — `z.infer<T>` eliminates manual type annotations on the result.
3. **Documentation** — the schema is the contract for what the LLM must produce.

This aligns with ADR-0010's decision to use Zod as the single source of truth for LLM response shapes.

### V1 default model

> **Superseded:** The concrete adapter is now `OpenRouterClient` (see [ADR-0015](0015-openrouter-as-llm-gateway.md)). The default model is `anthropic/claude-sonnet-4-6` (OpenRouter format). The interface contract and model-default rationale below remain valid.

The adapter defaults to a specific Claude Sonnet model. This is the V1 production model, selected for:

- **Cost/quality balance** — Sonnet provides strong reasoning for scoring and question generation at lower cost than Opus-class.
- **Structured output reliability** — tested against all three response schemas (question generation, scoring, relevance) with acceptable first-attempt success rates.
- **Availability** — generally available model with predictable latency.

When this model identifier becomes stale (new Claude model versions), update the default in `OpenRouterClient` and re-run the engine test suite to verify schema compliance. The model string is intentionally not externalised to environment configuration in V1 — it is a tested, validated default, not an arbitrary setting.

## Consequences

- **Easier:** New LLM call types (e.g., scoring prompt builders, re-assessment) require only a new Zod schema — the `LLMClient` interface does not change.
- **Easier:** Mock clients for testing need only implement one method regardless of how many call types exist.
- **Easier:** Model default is centralised — changing the production model is a one-line change with a clear test verification path.
- **Harder:** The schema-parameterised interface is more abstract than purpose-built methods. New contributors must understand that the schema serves as both validator and type source.
- **Follow-up:** When Anthropic releases new model versions, update the default in `AnthropicClient` and document the change in release notes. Consider externalising to environment configuration in V2 if multi-model support is needed.
- **Follow-up:** If Anthropic tool-use (API-enforced JSON mode) is adopted in V2 (deferred per ADR-0010), the `generateStructured` method signature remains unchanged — only the adapter implementation changes.

## References

- ADR-0010: LLM Response Validation Strategy (Zod as source of truth)
- `src/lib/engine/llm/types.ts` — `LLMClient` interface, `LLMResult<T>`
- `src/lib/engine/llm/client.ts` — `OpenRouterClient` adapter (formerly `AnthropicClient`, replaced per ADR-0015)
- Requirements: Story 4.1 (question generation), Story 4.2 (answer scoring)
