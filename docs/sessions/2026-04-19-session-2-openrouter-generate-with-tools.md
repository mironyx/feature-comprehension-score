# Session Log — 2026-04-19 (Session 2) — OpenRouter `generateWithTools` implementation

**Issue:** #250 — feat: OpenRouter adapter — generateWithTools implementation (§17.1c)
**Parent epic:** #240 — V2 Epic 17: Agentic Artefact Retrieval
**Branch:** `feat/feat-openrouter-generate-with-tools`
**PR:** <https://github.com/mironyx/feature-comprehension-score/pull/268>
**Session ID:** `7bbb395e-da7e-451e-9f72-23b3a6e71b6c`

## Work completed

Implemented the tool-use loop for `OpenRouterClient.generateWithTools`, replacing the
`'not implemented — see §17.1c'` stub from issue #245. The loop mechanics live in a new
pure module `src/lib/engine/llm/tool-loop.ts`; the adapter `src/lib/engine/llm/client.ts`
is a thin delegator passing a `ChatCallFn` that wraps the OpenAI SDK.

### Files changed

- **new** `src/lib/engine/llm/tool-loop.ts` — loop module: SDK-shape types, signal
  composition, `toOpenAIToolSpec`, `runToolLoop`, internal helpers (`parseToolInput`,
  `runHandler`, `recordOutcome`, `pushToolMessage`, `breach`, `processOneToolCall`,
  `isBudgetBreached`, `validateFinalContent`, `finalise`).
- `src/lib/engine/llm/client.ts` — `generateWithTools` delegates to `runToolLoop`;
  `generateStructured` unchanged.
- **new** `tests/lib/engine/llm/generate-with-tools.test.ts` — 31 contract tests written
  by the `test-author` sub-agent across 16 BDD describe blocks.
- `tests/evaluation/e17-llmclient-tool-loop.eval.test.ts` — 2 adversarial tests added by
  the `feature-evaluator` sub-agent covering the `error` outcome (handler throws /
  unknown tool name).

### Verification

- `npx vitest run` — 844 tests pass (31 new contract + 2 new eval).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- CI run 24617173788: first attempt cancelled mid-execution (GitHub Actions cache service
  outage); rerun all green — Lint & Type-check, Unit tests, Integration (Supabase),
  Docker build, E2E (Playwright).

## Decisions made

The LLD §17.1c pseudocode was a specification sketch rather than a code recipe. Several
divergences came up during implementation and are now recorded in the LLD change log
and as `Implementation note` callouts:

- **Loop extracted to a dedicated module.** Adapter file stayed a thin delegator so
  the 20-line function budget and engine-layer type purity invariants could be enforced
  without forcing the adapter to know about loop internals.
- **SDK-shape types owned by the loop module.** `SdkRequest`, `SdkResponse`,
  `SdkAssistantMessage`, `SdkToolCallRequest`, `SdkUsage`, `ChatCallFn` describe the
  minimal subset of the OpenAI Chat Completions shape the loop needs. No `openai`
  import crosses into the loop.
- **`executeToolCall` decomposed** into `parseToolInput` + `runHandler` +
  `recordOutcome` + `pushToolMessage` + `breach` + `processOneToolCall` to stay under
  the 20-line budget and keep each helper single-responsibility.
- **Budget check switched to predictive heuristic.** `cumulativeBytes +
  lastBytesReturned >= maxBytes` refuses the next call if another result of the last
  call's size would overflow the budget; the strict `>=` form in the pseudocode would
  have allowed a single oversized result to blow past `maxBytes` on the call after it
  landed. Tests agree with the predictive semantics.
- **Manual `setTimeout + AbortController`** instead of `AbortSignal.timeout()` —
  vitest fake timers don't mock `AbortSignal.timeout`, so the abort-in-flight tests
  hung until vitest killed them. The timer is `.unref()`'d so a completed loop doesn't
  hold the Node event loop open.
- **Turn cap `maxCalls + 2`** replaces the `while (true)` sketch. Safeguard against
  an LLM that keeps returning empty `tool_calls`; surfaced as `malformed_response`.
- **Message ordering corrected.** Assistant message (with `tool_calls`) is pushed
  before the `role:'tool'` responses, per the OpenAI Chat Completions requirement;
  the pseudocode had the order inverted.

## Review feedback addressed

`/pr-review-v2` raised three warnings. Two addressed in follow-up commit `f07dae4`:

- `makeTimeoutSignal`: timer was never `.unref()`'d — would keep the Node event loop
  alive past loop return on early exit. Fixed.
- `isBudgetBreached`: predictive heuristic was load-bearing but uncommented. Added an
  explanatory comment.

The third (double cast at the SDK-adapter boundary) was acknowledged as load-bearing —
the whole point of the loop module is to stay framework-pure, so the adapter has to
swallow the type mismatch somewhere. Noted for future follow-up if the pattern spreads.

The `feature-evaluator` (Step 6b) verdict was **PASS WITH WARNINGS**: all 16 original
acceptance criteria covered, 2 adversarial tests added for the `error` outcome path
(both pass — no implementation defect; spec-enumeration gap in the test-author prompt
where the §17.1c BDD list named only four of the six `ToolCallOutcome` literals).

The evaluator also flagged a minor observability note on the `parseToolInput` JSON-parse
catch: the error is surfaced via the outcome log but not via `logger.error`. Added a
comment clarifying that malformed LLM args degrade to the `error` outcome and are fed
back to the LLM.

## Next steps

- **#251 / §17.1e** — pipeline integration: route rubric generation through
  `generateWithTools` unconditionally (tool-use-disabled orgs pass `tools=[]`).
- Possible follow-up: extract a typed SDK adapter to eliminate the `as unknown as
  Promise<SdkResponse>` double-cast in `client.ts`. Deferred — load-bearing in one
  place and the fix duplicates the SDK's request/response types.

## Final cost

Prometheus unreachable at time of `/feature-end` (monitoring stack runs on a Windows
machine; not reachable from the current Linux environment). PR body carries TBD
placeholders. Known limitation — recorded in auto-memory.

## Cost retrospective

Cost figures unavailable. Qualitative cost drivers observed during the session:

| Driver | Observed | Action for next time |
|--------|----------|----------------------|
| Context compaction | Yes — session context ran over before commit; pre-compact draft captured snapshot. | Break features into two issues when the contract exceeds ~15 BDD properties. §17.1c had 16 properties. |
| Fix cycles | 2 — (1) two timeout tests hanging on `AbortSignal.timeout` + vitest fake timers, fixed by manual timer. (2) Budget test contradicted LLD strict `>=` semantics, fixed by predictive heuristic. | Surface "vitest + AbortSignal.timeout" in test-author prompt as a known gotcha. Clarify budget semantics in LLD before test authorship. |
| Agent spawns | 4 — test-author, feature-evaluator, diagnostics-checker, 2× ci-probe, 1 × general-purpose for PR review. | diagnostics-checker was a no-op (extension not active in worktree) — consider skipping when `.diagnostics/` is missing. |
| LLD quality gaps | Yes — pseudocode used `AbortSignal.timeout` (not testable), strict `>=` budget (didn't match acceptance test), and message ordering contradicting the OpenAI API requirement. | LLD sync fed these back; next §17.1 sub-task starts from corrected text. |
| Mock complexity | Low — OpenAI mock was straightforward; only wrinkle was `resp?.choices?.[0]?.message` optional chain after abort. | Keep. |
| Zod/framework gotchas | None. | — |

Improvement actions captured:

- Test-author prompt: enumerate **all** literals of a union type when a `ToolCallOutcome`-like
  alias exists — the evaluator had to backfill `error`-outcome coverage the test-author
  missed because the BDD spec list named only four of six literals.
- LLD: call out vitest / fake-timer incompatibilities with `AbortSignal.timeout`
  explicitly in any future spec that uses abort signals.
- `/diag` skill: gracefully no-op when the diagnostics extension is not running in the
  worktree — currently the skill spawns a sub-agent that has to discover the extension
  is absent before reporting nothing.
