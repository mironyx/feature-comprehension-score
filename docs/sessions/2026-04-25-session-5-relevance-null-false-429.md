# Session log — 2026-04-25 session 5: #335 relevance null/false conflation + 429 thundering herd

Session ID: `5b0cc60c-a374-47c3-9cf8-2979ffd6ee93`
PR: [#338](https://github.com/mironyx/feature-comprehension-score/pull/338)
Issue: [#335](https://github.com/mironyx/feature-comprehension-score/issues/335)
Branch: `fix/fix-relevance-null-false-429`

## Work completed

Four bugs reported in #335 plus one architectural redesign mid-flow:

1. **Bug 1 — no logger to LLM client.** `buildLlmClient(logger)` now receives the pino instance so retry/backoff events are observable.
2. **Bug 2 — 429 thundering herd.** `Promise.all` over per-answer relevance calls hammered the OpenRouter free tier. Initial fix was sequentialisation; final design replaced fan-out with a **single batched call** that classifies every Q/A pair in one round-trip.
3. **Bug 3 — redundant relevance during scoring.** `processAnswer` in `assess-pipeline` no longer calls `detectRelevance`. Scoring is score-only; the API route pre-filters on persisted `is_relevant === true`.
4. **Bug 4 — `null`/`false` conflation.** Service approval check `!is_relevant` (which evaluates `!null === true`) replaced with `is_relevant !== true`. Frontend `RelevanceWarning` gained a `variant: 'irrelevant' | 'evaluation_failed'` prop so LLM-evaluation failure shows a distinct message ("We could not evaluate your answer — please try again.").

Also: tightened the relevance classifier system prompt (`detect-relevance.ts`) to require some subject connection but bias toward leniency — borderline answers go through to scoring, which judges correctness/depth.

## Decisions made

- **Mid-flow redesign — batched relevance.** First PR shipped per-answer sequential calls. User rightly pushed back: relevance is checked per question but questions are generated in one call — the asymmetry was wrong. Force-pushed `b15c580` collapsing to one batched call. Net code reduction: removed `evaluateRelevance` helper, `skipRelevance` flag, sequential for-of in scoring; relevance call removed from `processAnswer` entirely.
- **Permissive relevance prompt.** Per user direction, the bar is "any genuine attempt with some connection to the subject" — scoring handles correctness. "When in doubt, mark relevant."
- **Per-item missing → relevant.** If the batched LLM response omits an item, default `is_relevant: true` (scoring sorts it out). Whole-batch failure → all answers `is_relevant: null` (preserves attempts via `resolveAttemptNumber`).

## Review feedback addressed

- pr-review-v2 (Agent C, design conformance) flagged `checkOne` and `evaluateRelevance` as unspecified private helpers without `// Justification:` comments. Fixed in commit `b6ec941` before redesign; the helpers were removed entirely by the batched-call redesign.

## LLD sync

`docs/design/lld-phase-2-web-auth-db.md` §2.4 updated (1.0 → 1.1):
- Flow step 5 reworded: "single batched LLM call" instead of "for each answer".
- `runRelevanceChecks` helper signature note updated.
- New Implementation note (issue #335) items 13–18 covering: batched `detectRelevance`, no-relevance-in-scoring, logger injection, `RelevanceWarning.variant`, frontend approval check.

## Cost retrospective

| Stage | Cost | Tokens (out) | Notes |
|-------|------|--------------|-------|
| PR-creation (b15c580) | recorded in PR body | — | First per-answer attempt + redesign |
| Final | $24.92 | 121k out / 33.4M cache-read | Includes redesign push, prompt tweak, PR comments |

**Cost drivers**

| Driver | Detected via | Action for next time |
|--------|--------------|----------------------|
| Mid-flow redesign | First PR submitted per-answer sequential; user requested batched call → full rewrite | Pause earlier when fix size grows past the bug's blast radius — relevance is per-question whereas generation is batched; that asymmetry should have flagged the design before coding |
| Context compaction × 2 | Two summaries during this session | Sub-issues for redesign would have kept each PR small |
| Agent spawns (5) | 1× pr-review (2 agents), 3× ci-probe | ci-probe count is structural — one per push; cannot reduce without skipping redesign |
| 11× vitest runs | Standard for TDD bug fix + redesign | Run target file (`-- <file>`) for incremental loops; full suite reserved for Step 5 |

**Improvement actions**
- When a "small bug fix" (Bug 2) requires touching the engine signature, classify as a redesign trigger and surface the design question before writing code.
- For batched-vs-fan-out decisions, derive symmetry with sibling pipelines (generation, scoring) at design time.

## Next steps

- `/feature-end` will merge #338 and clean up.
- LLD §2.4 implementation notes 13–18 are now the source of truth — future relevance work should treat the contract as: one batched call per submission, per-item missing → relevant, whole-batch failure → null.
- Follow-up to consider: heuristic pre-filter for empty/junk answers before the LLM relevance call (would avoid an LLM call when the answer is obviously empty). Not in this PR's scope.
