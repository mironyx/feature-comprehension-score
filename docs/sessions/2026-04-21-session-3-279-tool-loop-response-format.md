# 2026-04-21 Session 3 — #279 tool-loop `response_format` JSON constraint

**Issue:** [#279 — fix: tool-use path missing response_format JSON constraint](https://github.com/mironyx/feature-comprehension-score/issues/279)
**PR:** [#283](https://github.com/mironyx/feature-comprehension-score/pull/283)
**Branch:** `feat/tool-loop-response-format` (worktree: `../fcs-feat-279-tool-loop-response-format`)
**Parallel team run:** sibling teammates on #280 and #281 (same `/feature-team` invocation).

## Work completed

- Extended `SdkRequest` in `src/lib/engine/llm/tool-loop.ts` with an optional `response_format?: { readonly type: 'json_object' }` field.
- Passed `response_format: { type: 'json_object' }` in the single `chatCall(...)` inside `runToolLoop`, matching `generateStructured` at `client.ts:91`. The constraint now applies to every turn — tool-requesting and finalisation.
- Added three regression tests to `tests/lib/engine/llm/generate-with-tools.test.ts` (Property 17):
  - No-tool path: `chatCall` is invoked with `response_format: { type: 'json_object' }`.
  - Multi-turn turn 1 (tool-requesting): first `chatCall` includes the constraint.
  - Multi-turn turn 2 (finalisation): second `chatCall` includes the constraint (the precise turn that produced prose in production).
- LLD synced: added Change Log entry for 2026-04-21 and an Implementation note + pseudocode update in §17.1c of `docs/design/lld-v2-e17-agentic-retrieval.md`.
- Fixed a pre-existing CI blocker: added an H1 heading to `docs/requirements/bug-report-21-04-26.md` (MD041 was failing all PRs on main since commit `92057f0`).

## Decisions made

- **Parity fix over fallback logic.** Considered three approaches: (1) set `response_format` at the tool-loop layer, (2) inject it only in `client.ts`'s `chatCall` adapter, (3) add prose→JSON salvage. Chose (1) because it mirrors the existing `generateStructured` constraint exactly and makes the contract explicit at the type boundary. Options (2) and (3) would have been indirection or root-cause papering.
- **Independent test authorship.** Used the `test-author` sub-agent in bugfix mode; it enumerated three observable properties and wrote them against the `SdkRequest` type alone, without reading the implementation body. Red before fix, green after — so the constraint check is meaningfully falsifiable.
- **CI fix in scope.** Included the one-line markdown heading fix because the `92057f0` MD041 error was blocking every PR, including this one. Flagged in the PR body and the review comment as an out-of-scope fix so the audit trail is clean.

## Review feedback addressed

- `pr-review-v2` (single-agent, 104-line diff) returned `[]` — no findings.
- CI: first run failed on the pre-existing MD041; second run (after push `d604163`) passed all jobs — lint/type-check, unit, integration (Supabase), E2E (Playwright), Docker build.

## LLD sync (§17.1c)

One correction recorded: the original pseudocode silently assumed the LLM would produce JSON and omitted `response_format: { type: 'json_object' }`. Updated pseudocode + added an Implementation note explaining the parity with `generateStructured`. Change Log entry appended.

## Cost

- **PR creation (Step 8 of `/feature-core`):** $3.99, 9 min, 1,211 in / 18,723 out / 3,834,973 cache-read / 300,947 cache-write.
- **Final total (PR through `/feature-end`):** $7.86, 1,371 in / 35,406 out / 9,777,171 cache-read / 410,050 cache-write.
- **Delta post-PR:** ≈$3.87 — covers CI probe fixes, LLD sync, session log, final cost query.

## Cost retrospective

| Driver | Detected | Impact |
|--------|---------|--------|
| CI pre-existing failure (MD041) | First CI probe failed; required a second push + second probe | Medium — one extra commit, one extra CI run. Not caused by this issue's code; cleanup fix was one line. |
| Test-author + evaluator sub-agents | Two sub-agent spawns | Low — each saw only the signatures/issue; evaluator returned PASS with 0 extra tests. Paying the independence tax deliberately; the alternative is circular test writing. |
| `npm install` in the worktree | First vitest run failed because deps weren't installed; re-ran after install | Low — one-time cost per worktree. |
| No context compaction | N/A | — |

**Improvement actions**

1. **Teach `/feature-team` worktree bootstrap to run `npm install`.** Every teammate in a worktree needs this before the first `npx vitest` call. Currently each teammate discovers the missing deps independently. Could be a post-`git worktree add` step in the skill.
2. **Detect pre-existing CI breakage early.** When a main-branch commit lands a file that breaks `markdownlint-cli2` / ESLint / etc., every downstream `/feature-team` run pays a full CI cycle to find out. A pre-flight `npm run lint` + `npx markdownlint-cli2` in `/feature-core` Step 5 would have caught this before the first push. (Step 5 already runs `npm run lint` — it's just markdown that isn't checked.) Consider adding markdown lint to Step 5's gate.
3. **LLD pseudocode drift from `generateStructured`.** The original §17.1c pseudocode was written without cross-referencing `client.ts`'s non-tool structured path. The missing `response_format` is exactly the kind of sibling-consistency gap `/architect` can catch: when two code paths have the same *contract* (produce structured JSON) they should share their constraints. A checklist item in the `/architect` skill: "for any new structured-output path, compare constraints against the closest sibling path."

## Next steps

- Merge PR #283 via `/feature-end` (this session).
- Follow-ups in flight on sibling teammates: #280 (malformed_response retryability) and #281 (assessments list polling). Both directly observed in the same 2026-04-21 bug report.
