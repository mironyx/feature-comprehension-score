# Session 5 — V6 LLM Output Tolerance Implementation

**Date:** 2026-04-25
**Skill:** feature-team teammate (`/feature-core` + `/feature-end`)
**Issue:** [#336](https://github.com/mironyx/feature-comprehension-score/issues/336) — feat: LLM output tolerance — accept question overshoot and long hints (V6)
**PR:** [#337](https://github.com/mironyx/feature-comprehension-score/pull/337)
**Branch:** `feat/llm-output-tolerance-v6`
**LLD:** [`docs/design/lld-v6-llm-tolerance.md`](../design/lld-v6-llm-tolerance.md)

## Work completed

Implemented two surgical relaxations of overly strict validations in the rubric generation pipeline:

1. **Question count overshoot** — removed strict equality check in `generateQuestions` and `.max(5)` on the questions array Zod schema, so the pipeline now accepts any response with `>= 3` questions.
2. **Hint length overflow** — removed `.max(200)` from the `QuestionSchema` hint field and replaced the "max 200 characters" parenthetical in the system prompt with brevity guidance ("concise — one or two sentences").

Acceptance criteria from the LLD all hold: `>= 3` questions accepted regardless of `question_count`, `< 3` still rejected by Zod, hints of any length pass schema validation, prompt no longer contains a hard char limit but retains brevity guidance.

### Files changed (6 — all under `src/lib/engine/` and `tests/lib/engine/`)

| File | Change |
| --- | --- |
| `src/lib/engine/llm/schemas.ts` | Removed `.max(200)` on hint, `.max(5)` on questions array (2 lines) |
| `src/lib/engine/generation/generate-questions.ts` | Deleted strict equality block (10 lines) |
| `src/lib/engine/prompts/prompt-builder.ts` | Replaced "max 200 characters" with brevity guidance (1 line) |
| `tests/lib/engine/llm/schemas.test.ts` | Flipped 200-char hint test, added > 5 questions accepted, < 3 rejected |
| `tests/lib/engine/generation/generate-questions.test.ts` | Added overshoot acceptance test, dropped obsolete equality-check integration test |
| `tests/lib/engine/prompts/prompt-builder.test.ts` | Flipped "retains max 200 characters" test, added brevity guidance assertion |

Net diff: 75 insertions, 46 deletions. Production-code delta: 3 insertions, 13 deletions across 3 files.

## Decisions made

- **Pressure tier: Light.** ~13 net production-code lines, three files, removal-heavy. Followed the Light-tier path (no test-author or feature-evaluator sub-agent; tests written inline alongside the fix).
- **Dropped the LLD's < 3 questions integration test instead of modifying the mock.** The LLD's "Test updates required" table assumed `createMockLLMClient` validates fixtures via Zod; in reality it returns the fixture as-is. Two options: (a) modify the mock to call `safeParse`, or (b) remove the now-redundant integration test. Chose (b) — schema-level rejection is already covered in `schemas.test.ts`, and modifying the mock would have been out of scope. Surfaced this as a "Design deviations" note candidate; on reflection it's a test-file simplification that doesn't change the LLD's prescribed code edits.
- **lld-sync skipped — small bug fix, no architectural change.** Per the feature-end pressure-adaptive rule (< 30 src lines). The LLD's prescribed edits and the implementation match exactly.

## Verification

- `npx vitest run` — **1369 passed** across 122 test files
- `npx tsc --noEmit` — clean
- `npm run lint` (eslint --max-warnings 0) — clean
- `npx markdownlint-cli2` — pre-existing errors only, in unrelated files
- CI on PR #337 — all jobs green (Lint & Type-check, Unit, Integration (Supabase), E2E (Playwright), Docker build)

Diagnostics-exporter was unavailable in the worktree (the extension tracks the main repo path). The CodeScene MCP server was also not available in this environment. Given the change is removal-heavy with no new branching/conditionals, complexity findings would have been negative-delta at most.

## Review feedback addressed

`/pr-review-v2` ran in single-agent mode (small diff). Verdict: clean, surgical change matching the LLD; zero findings. No fixes required.

## Next steps / follow-up items

- None for this issue. Constraints relaxed end-to-end; existing tests pass with the new tolerant behaviour.
- Consider as a future small chore: add `safeParse` to `createMockLLMClient.generateWithTools` so tests-through-the-mock match production validation behaviour. Out of scope for #336.

## Cost summary

| Stage | Cost | Input | Output | Cache read | Cache write |
| --- | --- | --- | --- | --- | --- |
| At PR creation | $3.3006 | 867 | 17,345 | 3,204,667 | 202,223 |
| Final | $5.7140 | 952 | 25,478 | 5,541,864 | 380,798 |
| Δ post-PR | +$2.4134 | +85 | +8,133 | +2,337,197 | +178,575 |

Time to PR: 6 min.

## Cost retrospective

**Drivers:**

- **Light-tier path saved time and tokens.** Skipping the test-author sub-agent kept the cycle inline; the substantive change was 13 production lines across 3 files. A Standard-tier flow would have spawned an agent that re-read the LLD plus three source files plus three test files — likely $1–2 added cost for no extra signal.
- **Single-agent /pr-review-v2** (diff under the 150-line guide for substantive changes despite 207 raw diff lines including test churn). Saved ≈ $1 vs. the multi-agent path; verdict was unambiguous.
- **CI probe overhead negligible** — background polling agent stayed quiet until completion, pure event-driven.
- **Post-PR Δ ($2.41) was dominated by the /feature-end skill itself** — session log composition, cost queries, and final wrap-up. No fix cycles, no review-driven recommits.

**Improvement actions:**

- Confirm the Light-tier judgement when production-code lines are ≤ 30 even if the total diff (including tests) exceeds 150. The /pr-review-v2 SKILL.md already notes this judgement call; today's run validated it.
- The mock-vs-LLD mismatch (LLD assumed mock validates) cost zero in this run because I caught it during implementation. For future LLDs that touch test infrastructure, a quick "verify mock behaviour" line item in the LLD would prevent ambiguity.
- /diag was a no-op because the diagnostics-exporter tracks the main repo path, not the worktree. Worth filing a follow-up to make the extension worktree-aware, or to point /diag at a sibling diagnostics export path. For now, removal-heavy diffs are safe to commit without /diag.
