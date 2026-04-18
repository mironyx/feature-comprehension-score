# Session Log — 2026-04-19 Session 1: LLMClient.generateWithTools port + tool loop types

## Context

Implementation of issue #245 (§17.1a from LLD E17 Agentic Artefact Retrieval) — the
engine-layer port extension for the bounded tool-use loop. Pure types + one runtime
constant; runtime loop behaviour is deferred to §17.1c (separate task).

Branch: `feat/feat-llmclient-generate-with-tools` → merged via PR #263.

## What was done

### Source additions

- **`src/lib/engine/llm/tools.ts`** (new) — `ToolDefinition`, `ToolResult`,
  `ToolLoopBounds`, `ToolCallLogEntry`, `ToolCallOutcome`, `GenerateWithToolsRequest`,
  `GenerateWithToolsData`, `DEFAULT_TOOL_LOOP_BOUNDS`. Zero framework/I/O imports; only
  `zod` type imports.
- **`src/lib/engine/llm/types.ts`** — `LLMClient` extended with `generateWithTools<T>(req)`
  alongside existing `generateStructured`. No breaking change to either.
- **`src/lib/engine/llm/client.ts`** — `OpenRouterClient.generateWithTools` stub that
  throws `not implemented — see §17.1c`. Preserves the port contract; runtime logic
  ships in a separate PR.
- **`tests/fixtures/llm/mock-llm-client.ts`** + inline `LLMClient` literals in
  `tests/lib/engine/pipeline/assess-pipeline.test.ts` — matching stubs so the interface
  is implemented everywhere.

### Tests added

- **`tests/lib/engine/llm/tools.test.ts`** (new, 31 tests) — authored by the `test-author`
  sub-agent against the LLD/issue spec only, before implementation. Covers every
  contract property: default values, discriminated-union exhaustiveness, outcome enum
  members, `Partial<ToolLoopBounds>` bounds merging, port satisfaction, engine-isolation
  import check on `tools.ts`, `ToolDefinition` structural shape, and
  `GenerateWithToolsData<T>` shape.
- **`tests/evaluation/e17-llmclient-tool-loop.eval.test.ts`** (new, 1 test) — adversarial
  test from the `feature-evaluator` sub-agent extending the engine-isolation import
  check to `types.ts` (test-author scoped it to `tools.ts` only).

Full suite: 759/759 pass.

### Doc fix

- `docs/reports/retro/2026-04-18-process-retro.md` — pre-existing MD018 markdownlint
  failure (`#236` at line start) rewritten to `Issue #236` per feature-core's
  "pre-existing failures are your problem" rule.

### LLD sync

`docs/design/lld-v2-e17-agentic-retrieval.md` §17.1a updated post-implementation:
- `ToolCallOutcome` promoted from inline literal union to named type alias in the spec
  block.
- Change Log row added.
- Implementation note recording the `readonly` hardening and the `not implemented` stub
  approach for §17.1c separation.

## Commits

- `af867cf` — feat: LLMClient.generateWithTools port + tool loop types #245

## Decisions

- **Stub `OpenRouterClient.generateWithTools` rather than implement in this PR.** LLD
  §17.1a's contract is "types only"; runtime behaviour is §17.1c, a separate task with
  its own ACs and test matrix. Splitting the PR keeps the diff scoped and makes the
  contract change reviewable independently of the loop mechanics.
- **Named `ToolCallOutcome` type alias** — ergonomic improvement not strictly required
  by the spec. Consumers (`ToolCallLogEntry`, future UI renderers) reference the outcome
  set by name, so changes to the enum propagate consistently.
- **All type fields `readonly`.** The tool-loop types are value objects flowing through
  the port boundary — immutability at the type level prevents accidental mutation in
  adapter code.
- **Test-author sub-agent with architectural isolation check on `tools.ts` only.**
  Correct scoping at the time (only `tools.ts` was a new file), but the AC says "engine
  layer still has zero framework/I/O imports", and `types.ts` was also modified. The
  `feature-evaluator` caught this partial coverage and added the second assertion —
  working as intended (evaluator as coverage auditor, not backfill factory).

## Review feedback

`pr-review-v2` returned one informational warning: ADR-0023 says `≤ 60 s` wall-clock
while LLD/requirements/issue/PR all say 120 s (per v0.5 requirements alignment on
2026-04-18). Pre-existing doc drift, not introduced by this PR. Reconciliation is out
of scope here — flagged for a future ADR patch.

## Cost retrospective

### Cost summary

Prometheus unreachable from the Linux workstation (monitoring stack on Windows), so
actual figures are unavailable for both the PR-creation snapshot and the final total.
Both are marked TBD in the PR body and cost comment was not posted.

### Cost drivers (estimated from session shape)

| Driver | Evidence | Impact |
|--------|----------|--------|
| Agent spawns | 1× `test-author`, 1× `feature-evaluator`, 1× `pr-review` (single-agent path), 1× `ci-probe` | Moderate — four agent spawns, each re-reads context |
| Fix cycles | Zero failing-then-passing iterations on `tools.ts` itself; one lint fix (`Schema` unused var in test); one pre-existing MD018 fix | Low |
| Context compaction | No compaction observed | None |
| LLD quality | LLD §17.1a spec block was accurate — zero corrections needed, only additions (`readonly`, named `ToolCallOutcome`) | Low |

### Improvement actions

- **Feature-tests scoped the isolation check too narrowly.** `test-author` covered
  `tools.ts` only for AC-3, missing `types.ts`. Future `test-author` briefs for "engine
  layer isolation" ACs should list every file modified in the AC scope, not just the
  new file. (One adversarial eval test would have been avoided.)
- **`pr-review-v2` single-agent path worked well for this diff.** 669-line diff but
  mostly test content — the judgement-based single-agent fallback was the right call
  per the skill's own guidance. Keep doing this for heavily test-file diffs.
- **`.diagnostics/` folder not produced in ephemeral worktrees.** The diagnostics-exporter
  extension needs the workspace to be open in the editor; a fresh worktree with a new
  branch does not trigger it. For pure-types PRs this is fine (no logic to smell), but
  for logic-heavy work the teammate should open the worktree as a workspace before
  editing. Consider adding this to `/feature-team` teammate setup.

## Next steps

- **§17.1c — OpenRouter adapter: `generateWithTools`** is now unblocked (depends on
  §17.1a which just shipped). Issue #246.
- **§17.1b — path-safety + `readFile` + `listDirectory` tool handlers.** Already in
  progress by another teammate (issue #249).
- **ADR-0023 stale-timeout patch** — reconcile `≤ 60 s` → `120 s` wall-clock, or link
  forward to the LLD/requirements v0.5 update.

## References

- PR: <https://github.com/mironyx/feature-comprehension-score/pull/263>
- Issue: <https://github.com/mironyx/feature-comprehension-score/issues/245>
- LLD: `docs/design/lld-v2-e17-agentic-retrieval.md` §17.1a
- ADR: `docs/adr/0023-tool-use-loop-rubric-generation.md`
