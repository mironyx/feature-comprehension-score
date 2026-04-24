# Session Log — 2026-04-22 Session 3

## Summary

Built a session profiler (`scripts/profile-session.py`) to analyse token cost by
feature-core step, then used its findings to optimise the pipeline.

## Work completed

### Session profiler (`scripts/profile-session.py`)

- Reads Claude Code JSONL session files and attributes token usage to feature-core steps
- Detects step boundaries from tool calls (Skill, Agent, Bash patterns)
- Outputs: per-step token table, weighted totals, aggregated phase summary, file read frequency
- Weighted scoring: input x1.0, output x5.0, cache_write x1.25, cache_read x0.1
- Modes: `--list` (browse sessions), `--latest`, `<session-id>` (profile specific session)

### Pipeline optimisations (informed by profiler data)

1. **Removed Step 5b** (silent-swallow grep) from feature-core — was 14–41% of session
   cost across profiled sessions. The grep scanned all of `src/` (41 matches) instead of
   just changed files, triggering multi-turn fix loops. Redundant with pr-review-v2 which
   already checks for silent catches in Agent Q and Agent C.

2. **Scoped vitest in Step 4c** — added explicit instruction to run only the target test
   file during implementation, never the full suite. Full suite runs once in Step 5.

3. **Batched Step 5 verification** — vitest + tsc + lint + markdownlint in a single Bash
   call. Added reasoning for the LLM explaining why (each call = full context round-trip).

4. **Replaced `gh run watch` with polling** in ci-probe agent (P2 from process improvement
   report). `gh run view --json` polls every 30s with near-zero token cost. Logs fetched
   only on failure via `--log-failed`.

## Profiler findings

Analysed 3 feature-core sessions from WSL. Consistent cost drivers:

| Phase | Range | Root cause |
|-------|-------|------------|
| Read context | 13–40% | Re-reading source files (types.ts read 7x in one session) |
| Silent-swallow check | 9–41% | Grep scanning entire src/, agent fixing pre-existing matches |
| Push + PR + cost | 6–18% | Post-push work misattributed to push step |
| Test runs (vitest) | 6–14% | Full suite run on every edit instead of scoped |
| Verification (tsc/lint) | 4–15% | Separate Bash calls instead of batched |

## Decisions made

- Prometheus is not redundant — provides pre-computed USD costs and cross-session aggregation.
  JSONL provides per-turn granularity for profiling. They're complementary.
- Silent-swallow should be a SAST tool concern, not an LLM grep step.
- LLM reasoning in skill instructions (e.g. "each call adds a full context round-trip")
  helps compliance — the agent needs to understand *why* to follow the instruction.

## Files changed

- `scripts/profile-session.py` — new, session profiler
- `.claude/skills/feature-core/SKILL.md` — removed Step 5b, scoped vitest, batched Step 5
- `.claude/agents/ci-probe.md` — replaced `gh run watch` with polling
- `.claude/skills/feature-end/SKILL.md` — minor: Read tool guidance for background tasks
