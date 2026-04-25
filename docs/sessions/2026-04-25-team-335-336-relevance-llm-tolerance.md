# Team Session — 2026-04-25 — Issues #335 & #336

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|-------|-------|----|--------|--------|
| #336 | feat: LLM output tolerance — accept question overshoot and long hints (V6) | [#337](https://github.com/mironyx/feature-comprehension-score/pull/337) | feat/llm-output-tolerance-v6 | 2026-04-25 (035dc65) |
| #335 | fix: relevance check conflates LLM failure (null) with irrelevance (false) on 429 | [#338](https://github.com/mironyx/feature-comprehension-score/pull/338) | fix/fix-relevance-null-false-429 | 2026-04-25 |

## Cross-cutting decisions

- **`gh pr create` / `gh pr view` added to allowlist** mid-run — teammates were hitting permission prompts when creating PRs. Added to `.claude/settings.json` during the run; takes effect for future teammate sessions.
- **No wave dependencies** — both issues touched entirely separate files (`schemas.ts`, `generate-questions.ts`, `prompt-builder.ts` for #336 vs `answers/service.ts`, `assess-pipeline.ts`, `answering-form.tsx`, `question-card.tsx`, `relevance-warning.tsx` for #335). True parallel execution with no merge conflicts.

## Coordination events

- #336 finished first (~6 min to PR, CI green before #335 was complete). Feature-end was held at human gate until user triggered it.
- #335 went through a mid-cycle redesign (per-answer relevance collapsed to batched call); CI re-ran on commit b15c580 and passed. PR body updated with `## Design deviations` section flagging LLD §2.4 for lld-sync.
- LLD §2.4 synced to v1.1 by teammate-335 during feature-end (notes 13–18 cover all deviations).
- teammate-336 skipped lld-sync (removal-heavy change, LLD prescription already matched — reasonable call).
- Shutdown of teammate-336 required two rounds: first shutdown_request was queued behind an idle notification; second acknowledgement came ~30 s later.

## What worked / what didn't

**Worked:**
- True parallel execution — no file collisions, both CIs green independently.
- teammate-335 self-corrected after /pr-review-v2 blocker (missing `// Justification:` comment) without lead intervention.
- Design deviation surfaced proactively in PR body before merge.

**Didn't:**
- `gh pr create` not pre-allowlisted — caused permission prompt on both teammates' first PR attempt. Fix applied mid-run but worth adding to the standard allowlist template.
- teammate-336 was still alive after shutdown_request due to idle notification race; terminated ~30 s later after acknowledgement.

## Process notes for `/retro`

- Add `Bash(gh pr create*)` and `Bash(gh pr view*)` to the default project allowlist so future feature-team runs don't hit permission prompts at PR creation time.
- The "redesign mid-cycle + update PR body with deviations + lld-sync at feature-end" flow worked well for #335 — good pattern to reinforce.
- #335 cost $24.92 (33.4M cache-read tokens) vs #336 at $5.71 — 4-bug fix with frontend changes is substantially more expensive than a schema relaxation. Expected, but worth noting for cost forecasting.
