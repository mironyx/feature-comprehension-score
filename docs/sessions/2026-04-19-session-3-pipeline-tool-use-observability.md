# Session Log — 2026-04-19 (Session 3) — Pipeline integration: tool-use + observability

**Issue:** #246 — feat: pipeline integration — rubric generation with tool-use + observability (§17.1e)
**Parent epic:** #240 — V2 Epic 17: Agentic Artefact Retrieval
**Branch:** `feat/feat-pipeline-tool-use-observability`
**PR:** <https://github.com/mironyx/feature-comprehension-score/pull/269>
**LLD:** `docs/design/lld-v2-e17-agentic-retrieval.md` §17.1e

## Work completed

Threaded the tool-use loop into rubric generation end-to-end. All rubric generations now go
through `generateWithTools` unconditionally; when the org has not opted in via
`tool_use_enabled`, the service passes `tools=[]` and the loop degenerates to a single-shot
call. Observability fields (`inputTokens`, `outputTokens`, `toolCalls`, `durationMs`) flow
from the engine through the `Rubric` response to the 8-arg `finalise_rubric` RPC overload
on every successful generation. The legacy V1 error path is preserved — no new failure modes
are visible to callers.

### Files changed

- `src/lib/engine/generation/generate-questions.ts` — switched from `generateStructured` to
  `generateWithTools`; emits new `GenerateQuestionsData` intersection type carrying flat
  observability fields alongside the question response.
- `src/lib/engine/generation/index.ts` — exported `GenerateQuestionsData`.
- `src/lib/engine/pipeline/assess-pipeline.ts` — added `RubricObservability` type and success
  variant of `GenerateRubricResult`; extended `GenerateRubricRequest` with optional `tools`,
  `bounds`, `signal`.
- `src/lib/engine/pipeline/index.ts` — exported `RubricObservability`.
- `src/app/api/fcs/service.ts` — added `buildRubricTools` + `persistRubricFinalisation`
  helpers; `finaliseRubric` now reads `loadOrgRetrievalSettings`, builds tools + bounds, calls
  `generateRubric`, and persists via the 8-arg RPC.
- `src/lib/github/tools/types.ts` — re-exported `ToolDefinition`/`ToolResult` from
  `@/lib/engine/llm/tools` to resolve a handler variance mismatch when adapter tools are
  passed through engine-generic `GenerateWithToolsRequest`.
- **new** `tests/app/api/fcs-pipeline-tool-use.test.ts` — 8 BDD specs (tool-enabled + disabled
  tool set, `retrieval_timeout_seconds` → `bounds.timeoutMs`, four persistence specs, legacy
  error path) written by the `test-author` sub-agent.
- **new** `tests/evaluation/pipeline-tool-use-observability.eval.test.ts` — 3 adversarial
  tests from the `feature-evaluator` covering token/duration persistence on the tools-disabled
  path.
- `tests/fixtures/llm/mock-llm-client.ts` — added `generateWithTools` path to the shared mock,
  wrapping fixtures in `{ data, usage, toolCalls, durationMs }`.
- `tests/lib/engine/generation/generate-questions.test.ts` — updated two existing tests to
  assert on `generateWithTools` + added observability-pass-through coverage.
- `tests/evaluation/comprehension-depth-story-2-2.eval.test.ts` — added `maybeSingle` to
  mock chains and `observability` to the mocked `generateRubric` resolved value, since
  `finaliseRubric` now reads `loadOrgRetrievalSettings` before generation.

### Verification

- `npx vitest run` — 889 tests pass (8 new BDD + 3 adversarial + mock/fixture updates).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- Silent-swallow grep — clean (one new catch at `service.ts:344` logs + marks
  `rubric_failed`).
- `/pr-review-v2` — 2 warn-level findings, no blockers. Both flag the two new private
  helpers as not in the §17.1e LLD sketch; both carry the required 20-line-budget
  justification comment.
- `/diag` — diagnostics exporter is not active on this worktree (`.diagnostics/` absent);
  CodeScene checks will run when the branch is opened in the main editor.
- CI run 24635295190 — all green (Lint & Type-check, Unit, Integration (Supabase),
  Docker build, E2E (Playwright)).

## Decisions made

- **Flat observability fields vs nested `_usage` object.** The LLD sketch embedded
  observability under `_usage`, `_toolCalls`, `_durationMs` (underscore-prefixed "private"
  convention). Switched to flat `inputTokens` / `outputTokens` / `toolCalls` / `durationMs`
  via an intersection type. The intersection composes cleanly with `QuestionGenerationResponse`
  without a second destructure in every caller, and there is no legitimate reason to hide
  these fields — they are part of the contract now.
- **Re-export adapter `ToolDefinition` from engine.** The adapter had its own
  `ToolDefinition<TInput>` type in `src/lib/github/tools/types.ts`. When composed through
  `readonly ToolDefinition[]` in the engine's `GenerateWithToolsRequest`, TypeScript could not
  unify the concrete `ZodObject<{path: ZodString}>` handler with the generic `ZodType`
  handler (contravariance on the input parameter). The fix was a one-line re-export — both
  declarations were already structurally compatible except for `readonly` modifiers. The
  LLD §17.1b implementation note from #249 predicted this migration; it ships now because
  §17.1e is the first call site that composes both layers.
- **`maxExtraInputTokens` derivation from cost cap deferred.** The LLD sketch contained a
  comment "derive `maxExtraInputTokens` from cost cap if set" but no concrete formula. The
  cost cap is persisted (§17.1d) and read through the retrieval-settings API, but it is not
  yet threaded into `bounds`. Only `timeoutMs` is set; the rest fall through to
  `DEFAULT_TOOL_LOOP_BOUNDS`. Tracked for a follow-up issue — this session did not block on
  spec-ambiguity around what the derivation formula should be.
- **`finaliseRubric` decomposition.** The new helpers (`buildRubricTools`,
  `persistRubricFinalisation`) were not in the LLD sketch — the sketch presented the service
  change monolithically. They were introduced to keep `finaliseRubric` under the 20-line
  function budget after the observability-threading added four new lines.

## Review feedback addressed

- None — the two `/pr-review-v2` warnings were both expected (helpers not in LLD sketch,
  justification comments present) and did not require code changes. Resolved by the LLD sync
  (§17.1e Change Log entry).

## Next steps

- Issue to file: thread `rubric_cost_cap_cents` → `bounds.maxExtraInputTokens`. Blocked on
  a product decision about what the conversion formula should be (cents per 1K input tokens
  at the current OpenRouter price?).
- Epic #240 wave 2 continues: §17.2b (Results page: collapsible "Retrieval details" + "Missing
  artefacts" summary) depends on §17.1e observability fields — now available.

## Feature cost

- **PR-creation cost (from PR body):** $9.0103 — 23 min to PR.
- **Final cost (post-merge):** $13.9488 — delta $4.9385 = LLD sync + session log + merge.
- **Tokens:** 3,550 input / 99,720 output / 16.5M cache-read / 711K cache-write.

## Cost retrospective

- **Context compaction hit mid-implementation.** Session was resumed from a compact after
  test-author finished but before typecheck ran. Re-summarisation of a 1,300-line diff
  drives the cache-write figure (711K) — for a session that ran ~50 agent turns that's
  modest, but still ~30% of the delta between PR and final.
- **Three agent spawns were cheap.** `test-author`, `feature-evaluator`, and the two
  parallel `pr-review-v2` agents (A + C) each re-read the full diff. No Agent B spawned —
  `PATTERNS_NEEDED` was false (no `package.json` or config file changes).
- **Zero RED→fix cycles on the main feature code.** Only two small adjustments:
  (1) TypeScript variance error on `ToolDefinition` — fixed with a one-line re-export, one
  re-typecheck. (2) Two mock-chain updates to `comprehension-depth-story-2-2.eval.test.ts`
  when `loadOrgRetrievalSettings` was added to the call chain.
- **LLD sketch was materially wrong in two places** (schema name, observability field
  shape). Neither blocked implementation but both caused the feature-evaluator to flag gaps
  and both required a post-hoc LLD sync edit. For future §17.x tasks the LLD author should
  state the actual schema names (not paraphrase "Rubric..." when "Question..." is in the
  code) and commit to concrete field names in the output contract.

### Improvement actions

- Future LLDs citing an engine function should copy the actual exported type from
  `src/lib/engine/llm/schemas.ts` rather than using a memorable near-name.
- When a follow-up issue is required (the cost-cap deferral here), file the issue in the
  same session as the merge — the context is hotter than trying to reconstruct it later.
- The adapter-to-engine re-export in `src/lib/github/tools/types.ts` could be made up-front
  for the remaining §17.x integrations; worth adding a line in the wave-3 kickoff task to
  audit other adapter types (`octokit-contents.ts` `RepoRef`, etc.) against engine ports.
