# 0015. Use OpenRouter as LLM Gateway Instead of Anthropic API Directly

**Date:** 2026-03-27
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The original architecture (ADR-0012) binds the `AnthropicClient` adapter directly to `api.anthropic.com` using the Anthropic TypeScript SDK. This works for V1 but creates a hard dependency on a single provider with no escape hatch for:

- **Model switching** — trying a different model (e.g. a Gemini or Mistral variant) requires a new SDK dependency and a new adapter.
- **Fallback routing** — if Anthropic's API is degraded, there is no automated failover.
- **Cost optimisation** — no visibility into per-call costs or the ability to route cheaper calls to a lower-cost provider.
- **Usage analytics** — provider-level dashboards are separate per vendor; there is no unified view.

[OpenRouter](https://openrouter.ai) is a unified LLM gateway that exposes an OpenAI-compatible HTTP API and proxies to 200+ models across providers (Anthropic, Google, Mistral, Meta, etc.). Switching models becomes a config change, not a code change.

## Options Considered

### Option 1: Keep Anthropic SDK (status quo)

Continue using the `@anthropic-ai/sdk` package, calling `api.anthropic.com` directly.

- **Pros:** No new vendor dependency. SDK provides typed request/response objects. Already implemented.
- **Cons:** Single-provider lock-in. Model switching requires new adapters. No unified cost/usage dashboard. Fallback routing requires custom code.
- **Implications:** Technical debt accumulates if the project ever needs multi-model support.

### Option 2: OpenRouter via OpenAI-compatible client

Replace `AnthropicClient` with an `OpenRouterClient` that calls `https://openrouter.ai/api/v1` using the `openai` npm package (which supports custom `baseURL`). Model IDs use OpenRouter's naming convention (e.g. `anthropic/claude-sonnet-4-6`).

- **Pros:** OpenAI-compatible — minimal client code. Model switching is a string change. Fallback routing, cost tracking, and analytics are handled by OpenRouter's infrastructure. No new SDK required beyond `openai` (already a common dependency). `LLMClient` port interface (ADR-0012) is unchanged — only the adapter changes.
- **Cons:** Introduces a new infrastructure dependency (OpenRouter). Adds one network hop (OpenRouter → Anthropic). OpenRouter availability becomes a dependency. Requires an OpenRouter API key in addition to (or instead of) an Anthropic API key.
- **Implications:** Requires updating environment variable names and documentation. The `AnthropicClient` adapter in `src/lib/engine/llm/client.ts` is replaced by `OpenRouterClient`.

### Option 3: Custom provider-agnostic adapter layer

Build an internal abstraction that can route to multiple providers natively, without a third-party gateway.

- **Pros:** No external gateway dependency.
- **Cons:** Significant engineering effort to build what OpenRouter already provides. Premature for a V1 product. Violates YAGNI.
- **Implications:** Not appropriate at current project scale.

## Decision

**Option 2: OpenRouter via OpenAI-compatible client.**

The `LLMClient` port interface defined in ADR-0012 does not change — this is purely an adapter swap. The `AnthropicClient` adapter is replaced by `OpenRouterClient`, which calls OpenRouter's OpenAI-compatible endpoint using the `openai` npm package with a custom `baseURL` of `https://openrouter.ai/api/v1`.

### Model naming

OpenRouter model IDs use the format `provider/model-name` (e.g. `anthropic/claude-sonnet-4-6`). The default model in `OpenRouterClient` will be `anthropic/claude-sonnet-4-6`, maintaining the same underlying model as the previous default while routing through OpenRouter.

### Environment variables

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key (replaces `ANTHROPIC_API_KEY`) |

The `ANTHROPIC_API_KEY` environment variable is no longer required in production. It may be retained in local development if direct Anthropic access is needed for debugging.

### Client implementation pattern

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

The `generateStructured` method implementation remains structurally identical — only the HTTP endpoint and API key change.

## Consequences

- **Easier:** Model switching (e.g. testing Gemini vs Claude) is a one-line config change — no new adapters or SDK dependencies.
- **Easier:** Unified cost and usage analytics across all LLM calls via the OpenRouter dashboard.
- **Easier:** Fallback routing (e.g. if Anthropic is degraded) can be configured in OpenRouter without code changes.
- **Harder:** OpenRouter becomes a new infrastructure dependency. If OpenRouter is unavailable, all LLM calls fail even if Anthropic is healthy.
- **Harder:** Debugging requires checking both OpenRouter and the underlying provider's status.
- **Follow-up:** Remove `@anthropic-ai/sdk` from `package.json`; add `openai` package if not already present.
- **Follow-up:** Update `.env.example`, deployment docs, and CI secrets to replace `ANTHROPIC_API_KEY` with `OPENROUTER_API_KEY`.
- **Follow-up:** Update `src/lib/engine/llm/client.ts` — replace `AnthropicClient` with `OpenRouterClient`.
- **Follow-up:** Update integration tests and fixtures to reflect OpenRouter response shapes (which mirror OpenAI format, not Anthropic's native format).
- **Not doing:** We are not building a multi-provider fallback within the application. OpenRouter handles this at the gateway level.
- **Supersedes:** ADR-0012 in so far as the concrete adapter implementation is concerned. The `LLMClient` interface contract defined in ADR-0012 remains valid and unchanged.

## References

- ADR-0012: LLM Client Interface Design and Model Default (interface contract unchanged; adapter replaced)
- ADR-0010: LLM Response Validation Strategy (Zod validation unchanged)
- `src/lib/engine/llm/client.ts` — `AnthropicClient` to be replaced by `OpenRouterClient`
- `src/lib/engine/llm/types.ts` — `LLMClient` interface (unchanged)
- <https://openrouter.ai/docs> — OpenRouter API documentation
