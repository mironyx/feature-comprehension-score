# Session — 2026-04-14 · Session 2 · Scoring prompt scale (#212) + independent test-author process change

## Context

Session started as `/feature 212` to fix the scoring scale bug (all answers being scored 1.00 regardless of rationale). Mid-session, the user flagged a recurring pattern — feature agent writes thin tests, evaluator writes thick adversarial tests — which led to a structural process change. Two PRs resulted:

- **PR #216** — fix for #212 (open, CI green, reviewed clean)
- **PR #217** — `/feature-core` skill change introducing an independent `test-author` sub-agent (merged)

## Work completed

### Issue #212 — scoring scale bug (PR #216)

- Added explicit 0.0–1.0 scale section to `SYSTEM_PROMPT` in `src/lib/engine/scoring/score-answer.ts`: five anchor descriptors (0.0, 0.3, 0.5, 0.8, 1.0) and a guard forbidding 1–5 / 1–10 scales.
- Added one regression test in `tests/lib/engine/scoring/score-answer.test.ts` asserting the prompt contains the 0.0/1.0 anchors.
- Feature-evaluator added 14 adversarial tests in `tests/evaluation/scoring-prompt-scale.eval.test.ts` — this volume became the trigger for the process retro below.
- Full suite (617 tests) passes; `tsc --noEmit`, `npm run lint` clean; all 5 CI checks green.
- PR-review-v2 found no blockers, no warnings.

### Process change — independent test-author (PR #217, merged)

The retro exposed a structural bias in `/feature-core` Step 4: same-agent test-writing ("batch test and implementation in one turn") made the LLM derive assertions from the implementation it was about to write, not from the spec. That's why feature-stage tests were thin and evaluator volume was high — the LLM version of marking its own homework.

Changes landed on `main`:

- New sub-agent `.claude/agents/test-author.md` — reads only spec + interface signatures, enumerates every observable contract property, writes the complete test file. Never reads implementation bodies.
- `feature-core/SKILL.md` Step 4 restructured into 4a (write interface with stub bodies) → 4b (hand off to test-author sub-agent) → 4c (implement against tests, cannot rewrite them) → 4d (coverage self-check).
- Step 6b reframed: feature-evaluator is a coverage auditor now. Writes adversarial tests only on genuine gaps. Volume >3 is a report-only signal in the PR body (never blocks).
- Both sub-agents now receive `requirements_paths` alongside `lld_path` and `issue_number`. Authority order: requirements > LLD > issue. Source-tagging (`[req §X.Y]`, `[lld §Z]`, `[issue]`) makes drift visible in reports each run.

### LLD sync

`docs/design/lld-v3-e2-comprehension-depth.md` updated: `#212` marked **resolved by PR #216** at line 466; noted that Story 2.3 calibration templates can drop their redundant `Score on a scale from 0.0 to 1.0.` line since the base prompt now carries anchors more strongly.

## Decisions made

- **Scope split.** Kept the #212 fix and the process change on separate branches and separate PRs so they could be reviewed in isolation. #216 stays open for the user; #217 merged immediately since it was doc-only.
- **Kept `tests/evaluation/`** as the evaluator's output directory. User explicitly flagged visibility as valuable — without a separate sink, the asymmetry would have been invisible and the retro wouldn't have happened.
- **Volume signal is report-only.** User asked that >3 adversarial tests never block; it flows into the PR body under "process notes" and nothing halts.
- **Requirements, not just LLD.** Added `requirements_paths` to both sub-agents after the user pointed out LLDs can be thin or drifted.

## Review feedback addressed

- **Pattern observation (thin feature tests vs thick evaluator tests):** surfaced the same-agent bias, structural fix landed in #217.
- **`[skip ci]` on doc-only commits:** forgot to add it to #217's three pushes; user flagged it, CI minutes wasted. Saved as feedback memory.
- **Requirements access:** both sub-agents now read requirements as the contract of record.

## Next steps

- User to review and merge PR #216 when ready.
- Next `/feature` run exercises the new Step 4 flow. Observation target: test-author produces comprehensive coverage on first pass; evaluator reports 0–3 adversarial tests with clear category breakdown. If evaluator volume stays high, iterate on the test-author prompt rather than reverting.
- Next downstream consumer is Story 2.3 (depth-aware scoring) in E2 — the calibration templates there should drop the redundant scale line per the LLD note added today.

## Cost retrospective

### Cost summary

Prometheus was unreachable at both PR-creation time and final-query time, so neither the PR body nor this log carries absolute figures. The monitoring stack appears to be down on this host — worth a separate infra check.

### Cost drivers (qualitative)

- **Environment discovery overhead.** Node 22 and Supabase/Docker access weren't immediately available in the shell's PATH / group membership. Burned several turns hunting for `node`, discovering `docker` group gap, and writing `.env.test.local` before the full suite could even run. Not a token-expensive category, but turn-expensive.
- **Process retro mid-feature.** The pattern discussion and #217 implementation happened inside the same session as the #212 fix. This is the largest driver — mid-session context-switch doubled the work envelope. It was the right call here because the pattern was actively visible in the session; doing it in isolation later would have required re-establishing the same context.
- **No context compaction hit** — session stayed within the 1M window.
- **CI waste from missing `[skip ci]`.** Three full CI runs (lint + unit + integration + docker + e2e) on doc-only #217 pushes before the user called it out. Mitigated going forward via memory.

### Improvement actions (for future sessions)

- **Default `[skip ci]` on doc-only pushes** — memory saved (`feedback_skip_ci_on_docs.md`).
- **Check Prometheus availability at session start** if cost telemetry matters — fail fast rather than at PR / final-query time.
- **Watch for mid-feature retros.** If a pattern observation arrives while a feature is mid-flight, consider parking it in an issue rather than implementing inline — unless, like here, the observation is visibly generated by the current session itself.
- **New test-author flow is the real cost bet.** If the independent sub-agent drops evaluator volume and closes the same-agent bias, per-feature token cost should fall despite the extra sub-agent invocation, because implementation-stage fix cycles shrink. Next session will be the first data point.
