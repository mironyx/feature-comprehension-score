# 0016. Structured Logging with Pino

**Date:** 2026-03-30
**Status:** Proposed
**Deciders:** LS / Claude

## Context

The codebase has 35+ ad-hoc `console.error` calls with no structured output, no request context, and no correlation IDs. When issues occur in Cloud Run, logs are not machine-parseable and debugging requires guessing. The first smoke test (2026-03-29) demonstrated this gap: diagnosing the `link_participant` bug (#133) and prompt drift (#134) required manual code tracing because there was no visibility into LLM requests or response payloads.

We need a logging solution that:

- Outputs structured JSON to stdout (Cloud Run / GCP Logging compatible)
- Includes request context (`requestId`, `userId`, `assessmentId`)
- Logs LLM prompts and responses for debugging question quality
- Is compatible with a future OpenTelemetry integration path
- Works with Next.js App Router (both server components and API routes)

## Options Considered

### Option 1: Pino

Fast, low-overhead structured logger. JSON output by default. First-class support for child loggers (request context), redaction, and serialisers.

- **Pros:** Fastest Node.js logger (benchmarks), native JSON output, `pino-opentelemetry-transport` exists for future OTel integration, widely adopted in production Node.js services, `pino-pretty` for local development, child logger pattern fits request-scoped context naturally
- **Cons:** Requires a transport for pretty-printing in development, no built-in Next.js integration (we wire it ourselves)
- **Implications:** Create a `src/lib/logger.ts` factory. Use child loggers in API route handlers for request context. Pretty-print in development via `pino-pretty` (dev dependency only).

### Option 2: Winston

Feature-rich, highly configurable. Multiple transports built in.

- **Pros:** Mature, flexible transport system, built-in formatters
- **Cons:** Significantly slower than Pino (3-5x in benchmarks), heavier dependency tree, OTel integration less straightforward, JSON output requires explicit configuration
- **Implications:** More configuration boilerplate, slower hot path in request handling.

### Option 3: console.* with a wrapper

Wrap `console.log/error/warn` in a structured output function.

- **Pros:** Zero dependencies, simple
- **Cons:** No child loggers (request context requires manual threading), no redaction, no transport system, no OTel path, reinventing what Pino already does
- **Implications:** Accumulates tech debt; we'd likely replace it with Pino later anyway.

## Decision

**Pino** (Option 1). It is the fastest option, has native JSON output for Cloud Run, and the `pino-opentelemetry-transport` provides a clear migration path when we add OTel in a future phase. The child logger pattern fits naturally with Next.js API route handlers for request-scoped context.

### Log levels convention

| Level | Usage | Examples |
|-------|-------|---------|
| `error` | Failures that need attention | LLM call failed, DB write failed, auth error |
| `warn` | Degraded paths that still succeed | Artefact truncated, retry succeeded, fallback used |
| `info` | Significant lifecycle events | Assessment created, LLM call started/completed, rubric generated |
| `debug` | Detailed debugging (off in production) | Full prompt content, raw LLM response, query details |

### Log format

All logs are JSON objects to stdout. Key fields:

```json
{
  "level": 30,
  "time": 1711785600000,
  "msg": "LLM question generation completed",
  "requestId": "uuid",
  "userId": "uuid",
  "assessmentId": "uuid",
  "latencyMs": 2340,
  "tokenEstimate": 8500,
  "questionCount": 5
}
```

### LLM logging

- **Before call:** `info` — artefact summary (file count, token estimate, quality classification, question count)
- **Full prompt:** `debug` — complete system + user prompt (large; only in development or when explicitly enabled)
- **Response:** `info` — LLM response summary (question count, artefact quality, latency). Full response at `debug`.
- **On failure:** `error` — HTTP status, error code, response snippet, full context

### Next.js integration

- `src/lib/logger.ts` exports a base Pino instance
- API route handlers create child loggers: `const log = logger.child({ requestId, userId })`
- Server components use the base logger (no request context available)
- No client-side logging (Pino is server-only)

### OTel readiness

- Design the logger factory so a transport can be swapped in later
- Do not add `pino-opentelemetry-transport` dependency in Phase 2
- When OTel is added: configure the transport in `logger.ts`, existing log calls remain unchanged

### Development experience

- Add `pino-pretty` as a dev dependency
- In development: pipe through `pino-pretty` for human-readable output
- In production (Cloud Run): raw JSON to stdout, GCP Logging parses natively

## Consequences

- All 35+ `console.error` calls must be migrated to Pino — this is a large, mechanical change (#135)
- LLM prompts will appear in server logs at `debug` level — acceptable for server-side logs but must not be exposed to non-admin users
- Two new dependencies: `pino` (production), `pino-pretty` (development)
- Future OTel integration becomes a transport swap, not a rewrite
- No `console.log/error/warn` in production code paths — enforce via lint rule or review check
