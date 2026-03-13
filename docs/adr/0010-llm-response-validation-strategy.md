# 0010. LLM Response Validation Strategy

**Date:** 2026-03-12
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The engine calls Claude for question generation, answer scoring, and relevance detection — each expecting structured JSON. LLMs do not guarantee valid, well-shaped output. A missing field in a scoring response would silently corrupt aggregate calculations with no error signal. Runtime validation is required.

## Options Considered

### Option 1: Zod schema validation with typed results
Parse JSON then validate against a Zod schema. Return `{ success: true, data: T } | { success: false, error: LLMError }` — no thrown exceptions. TypeScript types inferred from schemas.
- **Pros:** Runtime type safety. Types cannot drift from schemas. Forces callers to handle errors. Consistent error format across all response types.
- **Cons:** `zod` runtime dependency. Schema definition per response type.

### Option 2: Manual type guards
Ad-hoc guard functions per response shape.
- **Cons:** Guards drift from types over time. No consistent error format. More boilerplate per type.

### Option 3: TypeScript type assertions (`as T`)
- **Cons:** Compile-time only — no runtime guarantee. Silent `undefined` fields in scoring calculations. Unacceptable for a correctness-critical system.

## Decision

**Option 1: Zod schema validation.**

Incorrect scores with no error signal is a defect in the core product. Types inferred from schemas eliminates drift. The `LLMResult<T>` discriminated union makes error handling mandatory at the call site.

Both JSON parse failures and schema validation failures are **retryable** — LLMs occasionally produce near-correct output that a retry resolves.

Anthropic tool-use (API-enforced JSON) is deferred to V2 — it would reduce failure rates but adds prompt complexity not needed for V1.

## Consequences

- **Easier:** Schema drift caught immediately. Error paths are first-class, not exceptions. New response type = define schema, infer type.
- **Harder:** Zod schema required per LLM response type.
- **Follow-up:** Response schemas (`QuestionGenerationResponse`, `ScoringResponse`, `RelevanceResponse`) defined in `src/lib/engine/llm/schemas.ts`; types inferred from them.

## References

- Implementation plan: Phase 1.1 — LLM Client Wrapper
- ADR-0009: Test Diamond Strategy
- `src/lib/engine/llm/types.ts` — `LLMResult<T>`, `LLMError`
