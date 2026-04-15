# 2026-04-15 Session 1 — Hint generation in rubric pipeline (#219)

## Work completed

- Implemented Story 1.1 of the Answer Guidance Hints epic (#214).
- Added optional `hint: string | null` (max 200 chars) field to `QuestionSchema` in
  `src/lib/engine/llm/schemas.ts`.
- Extended `QUESTION_GENERATION_SYSTEM_PROMPT` in `src/lib/engine/prompts/prompt-builder.ts`
  with a hint generation instruction covering expected depth/format, non-disclosure of
  reference answer content, and a null fallback when generation is not possible. Added the
  `"hint"` field to the JSON example in the Output Format section.
- Tests:
  - 5 test-author-authored specs appended to existing `tests/lib/engine/llm/schemas.test.ts`
    and `tests/lib/engine/prompts/prompt-builder.test.ts`.
  - 3 evaluator-authored adversarial specs in new
    `tests/evaluation/hint-generation.eval.test.ts` covering the 200-char boundary,
    non-disclosure instruction, and null-fallback instruction.
- Full suite: 644/644 pass.

PR: <https://github.com/mironyx/feature-comprehension-score/pull/226>

## Decisions made

- **Scope held to Story 1.1.** Stories 1.2 (DB column + RPC) and 1.3 (UI display) are tracked
  as separate issues; no database migration or UI wiring in this PR.
- **Prompt wording followed the LLD verbatim** rather than paraphrasing. The LLD drafted
  both the new bullet in the Output Format description and the sample `"hint"` value, so the
  implementation matched exactly.
- **Evaluator's adversarial tests kept**, not discarded. They closed two genuine LLD BDD gaps
  (200-char boundary acceptance; non-disclosure + null-fallback instruction verification
  against Invariant #1). Gaps fed back into the LLD via `/lld-sync`.
- **Package-lock change unstaged.** A platform-dependent `dev: true` recategorisation on
  `fsevents` appeared in `package-lock.json`; unrelated to this PR, left out of the commit.

## Review feedback addressed

- `/pr-review-v2` (single-agent path — src diff ~6 lines) returned no findings.
- CI: all jobs passed (Lint & Type-check, Unit, Integration (Supabase), E2E (Playwright),
  Docker build).

## Next steps

- Merge #226.
- Proceed to Story 1.2 (#220 — store hints in `assessment_questions` via `finalise_rubric`).
  A parallel teammate already has a worktree for #220.
- Story 1.3 (UI) depends on 1.1 and 1.2 both being merged.

## LLD sync outcomes

Updated `docs/design/lld-v3-e1-hints.md` §Story 1.1:

- Tightened the `buildQuestionGenerationPrompt` BDD spec: the original "includes hint
  generation instruction" was too loose to verify Invariant #1 (non-disclosure). Replaced
  with three concrete specs (instruction present, non-disclosure, null fallback).
- Added the 200-char boundary acceptance BDD spec alongside the existing `>200 rejection`
  case.
- Added `tests/evaluation/hint-generation.eval.test.ts` to the test files list.
- Added an Implementation note explaining which sub-agent (test-author vs evaluator) wrote
  each group of tests and why.
- Bumped the Change Log with a 2026-04-15 revision row.

## Cost retrospective

### Cost summary

- PR-creation cost: TBD — Prometheus unreachable at `http://192.168.0.102:9090` at PR
  creation time, TBD placeholders left in the PR body.
- Final cost: TBD — Prometheus still unreachable at session end.
- Delta not measurable this session.

### Cost drivers

| Driver | Observed? | Notes |
|--------|-----------|-------|
| Context compaction | No | Single uncompacted conversation. |
| Fix cycles | No | Implementation passed tests on first green run. |
| Agent spawns | 4 | test-author, feature-evaluator, pr-review (1 general-purpose), ci-probe (background). Minimal for an LLD-guided change. |
| LLD quality gaps | Yes (minor) | BDD spec phrasing for the prompt instruction under-specified Invariant #1 — evaluator caught it and added 2 tests; `/lld-sync` folded the correction back. |
| Mock complexity | No | Pure Zod schema + string constant; no mocks needed. |
| Framework version gotchas | No | Existing Zod patterns extended by one optional field. |

### Improvement actions

- **Tighten BDD specs for prompt contents** in future LLDs: if an invariant names the prompt
  as its verification mechanism, the BDD spec should name the exact property (e.g. "does not
  reveal X", "falls back to null when Y") rather than "includes instruction". Captured in the
  revised LLD; worth reusing the phrasing when drafting E2 / E3 prompts.
- **Diagnostics in worktrees:** `.diagnostics/` was not populated in the feature worktree;
  CodeScene gate relied on eyeball judgement that a one-line Zod addition + prose prompt text
  was low-risk. If the diagnostics extension is expected to work across worktrees, that
  pipeline needs investigation — otherwise future worktree-based features can't satisfy the
  Step 6 blocking gate rigorously.
- **Prometheus reachability from remote worktree host:** cost telemetry was unavailable for
  this session because the host running this worktree cannot reach the Prometheus endpoint
  configured in `.env`. Worth either exposing the endpoint to all worktree hosts or making
  the cost step degrade with a clearly-marked "cost: unmeasured (monitoring unreachable)"
  rather than leaving TBD placeholders in the PR body.
