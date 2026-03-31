# Session Log — 2026-03-31 Session 2: LLM Logging (#136)

## Work completed

- **Issue:** #136 — feat: log LLM prompts and responses in FCS service
- **PR:** #152 — merged to `main`
- **Branch:** `feat/feat-llm-logging`

### Changes

1. **`LLMLogger` port interface** (`src/lib/engine/llm/types.ts`) — dependency inversion pattern keeps engine layer pure. Matches Pino's call signature so the real logger can be passed directly.
2. **`OpenRouterClient` logging** (`src/lib/engine/llm/client.ts`) — optional logger wired into config. Logs full prompt before call, response+timing on success, error+context on failure. Refactored `generateStructured` into `callLlm`, `parseAndValidate`, `parseJson` to stay within 20-line complexity budget.
3. **Artefact summary logging** (`src/app/api/fcs/service.ts`) — `logArtefactSummary` logs file count, test file count, artefact quality, question count, and token budget status before rubric generation.
4. **`buildLlmClient` updated** (`src/lib/api/llm.ts`) — accepts optional `LLMLogger` and passes it through to `OpenRouterClient`.
5. **Tests** — 5 client-level tests (prompt logging, response+timing, error logging, exception with HTTP status, no-logger backward compat) + 1 service-level test (artefact summary logged before rubric generation).

## Decisions made

- **Logger as port interface, not import:** Engine layer (`src/lib/engine/`) must remain pure. Rather than importing Pino directly, defined `LLMLogger` as a port interface matching Pino's `(obj, msg)` signature. Injected at the service boundary via `buildLlmClient(logger)`.
- **Log at client level, not pipeline level:** Logging wraps the entire `generateStructured` call (including retries), capturing total wall-clock time. Individual retry attempts are not logged separately — the final result (success or last error) is what matters for debugging.
- **No LLD for this issue:** Covered by ADR-0016 (structured logging). PR review found unspecified functions — added justification comments per project convention.

## Review feedback addressed

- **Blocker:** Exported `LLMLogger` interface lacked justification comment — added in fix commit `e9af78b`.
- **Warning:** `logArtefactSummary` private helper lacked justification comment — added.
- **Warnings (acknowledged):** `logRequest` and `logResult` private methods in `client.ts` — file has no design reference header, acceptable for private helpers.

## Cost retrospective

### Cost summary

- **Final cost:** $5.87
- **Tokens:** 1,452 input / 36,796 output / 5.8M cache-read / 324K cache-write

### Cost drivers

| Driver | Present? | Impact |
|--------|----------|--------|
| Context compaction | No | — |
| Fix cycles | 1 mock fix (GitHubArtefactSource constructor mock) | Low |
| Agent spawns | 2 PR review agents | Medium |
| LLD quality gaps | No LLD for this feature (ADR only) — 1 blocker found | Low |
| Mock complexity | Service-level test required careful mock chain setup | Low |

### Improvement actions

- For logging/observability features covered by ADR only, add a justification comment on exported interfaces upfront to avoid PR review blockers.
- The `GitHubArtefactSource` mock needed a class (not `vi.fn().mockImplementation`) — document this pattern for future service-level tests.

## Next steps

- Issue #136 complete and closed.
- Remaining Phase 2c items: check project board for next observability tasks.
