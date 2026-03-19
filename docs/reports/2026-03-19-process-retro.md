# Process Retrospective

**Date:** 2026-03-19
**Period:** 2026-03-15 (previous retro) to 2026-03-19
**Sessions reviewed:** 2026-03-16-session-1, 2026-03-17-session-1, 2026-03-17-session-2, 2026-03-19-session-1, 2026-03-19-session-2

## What went well

- **Strong delivery.** Four issues completed: #31 (assessment pipeline orchestrator), #45
  (context_file_patterns schema), #46 (ArtefactSource port), #47 (GitHubArtefactSource adapter).
  The artefact extraction layer is now structurally complete.
- **Drift scan run.** The 2026-03-16 drift report was produced before Phase 2 artefact work
  began — directly addressing action #2 from the previous retro. Two critical drift findings
  (W4 context_file_patterns, W7 port/adapter missing) were converted to issues and implemented
  within the same period.
- **Design documentation kept in sync.** ADR-0013 (context file resolution strategy) created
  during session 2026-03-19-session-2. LLD section 2.5 rewritten to reflect the corrected
  implementation. Design review caught a three-part correctness bug before merge.
- **Monitoring stack operational.** OTLP push, Prometheus, Grafana, and node-exporter textfile
  collector all working. Session→feature join queries verified in Prometheus. PR cost/token
  reporting now shows real data (was silently returning 0 due to wrong metric names).
- **Skill tooling significantly improved.** `/feature-end` skill created, `/feature-cont` skill
  added for cross-session continuity, `/feature` skill updated with worktree support and correct
  PromQL metric names.
- **Branch hygiene corrected.** The `feat/assessment-engine` integration branch confusion was
  identified in session 2026-03-17-session-1 and resolved. Future branches now come off `main`
  correctly.
- **Session logs written in real time.** All five sessions produced session logs during the
  session. This is the second consecutive retro period where this holds — the regression has
  been sustainably corrected.

## What needs improving

### Issue lifecycle management — fourth consecutive retro

**Observation:** The six issues flagged in the 2026-03-15 retro (#18, #23, #25, #27, #35, #36)
remain open on GitHub. All are marked Done on the project board. No evidence of action taken.

**Impact:** This is now the fourth consecutive retro raising this finding. 60% of the open issue
list is false positives. The backlog cannot be trusted as a source of truth.

**Root cause:** The action requires manual effort (6 `gh issue close` commands) that is always
deferred because feature work feels more urgent. Without it being encoded as a DoD check or
automated, it will keep being skipped.

### Drift report findings not actioned

**Observation:** Of the 2026-03-16 drift report's findings, W4 and W7 were addressed. The
remaining 7 findings (C1, W1, W2, W3, W5, W6, W8) have no GitHub issues and no evidence of
being addressed. In particular:

- **C1** (no ADR for LLMClient interface): still unaddressed — now two drift cycles.
- **W2** (`RawArtefactSetSchema.min(1)` rejects empty file arrays): runtime failure risk.
- **W5** (sequential scoring loop blocks performance): will matter at production scale.
- **W6** (question schema min(1) vs min(3)): schema and business rule diverge.

**Impact:** Drift findings that are not tracked as issues get forgotten. The drift scan is only
useful if its output feeds the backlog.

### Infrastructure churn from monitoring stack

**Observation:** The OTel/Prometheus stack required three fix passes across session-1 (metric
names wrong in `/feature`, textfile collector missing from docker-compose, CRLF line endings
from Python on Windows). Each was discovered post-implementation rather than during a review.

**Impact:** Monitoring infrastructure consumed a significant share of session time this period.
The fixes are sound, but earlier incremental testing (query Prometheus before writing the skill,
verify textfile format before wiring the collector) would have found these faster.

### No drift scan at end of period

**Observation:** No drift scan was run after the 2026-03-19-session-2 changes (ADR-0013, LLD
2.5 rewrite, GitHubArtefactSource code fixes). The 2026-03-16 drift report is now 3 days old
with significant new code.

## Actions from previous retro (2026-03-15)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Close all Done-but-Open issues: #18, #23, #25, #27, #35, #36 | Not started | Fourth retro raising this. |
| 2 | Run drift scan before starting #31 | Done | 2026-03-16 drift report produced. |
| 3 | Add "check branch" step to CLAUDE.md | Partial | Corrected in practice (2026-03-17-session-1); CLAUDE.md not updated. |
| 4 | Enforce PR size limit: one issue per PR, under 200 lines | Done | PRs #64, #67, #68, #69 each cover one issue. |
| 5 | Create GitHub issues for retro actions | Not started | Actions remain markdown-only. |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Close #18, #23, #25, #27, #35, #36 on GitHub (`gh issue close`) | Chronic backlog hygiene — **fourth retro** |
| 2 | Create GitHub issues for each unresolved drift finding: C1, W1, W2, W3, W5, W6, W8 | Drift findings falling through the cracks |
| 3 | Run a fresh drift scan now (period since 2026-03-16 has added ADR-0013, LLD 2.5, `GitHubArtefactSource`) | No scan at end of period |
| 4 | Update `CLAUDE.md` session guidance to include "check branch is off main before starting work" | Action #3 carry-forward — partial resolution not durable |
| 5 | Create a GitHub issue for the Supabase declarative schema workflow (#65 exists — verify it is tracked and prioritised) | Noted in session log 2026-03-17-session-1, not yet linked to a board action |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Red | → | 6 Done issues still open on GitHub. Fourth consecutive retro. Board and GitHub out of sync. |
| Definition of done | Amber | → | Work quality is high. Issue closure and drift tracking still skipped at session end. |
| Commit discipline | Green | → | Conventional commits, issue references throughout. PR size limit honoured this period. |
| Session continuity | Green | → | All 5 sessions logged in real time. `/feature-cont` skill added for cross-session handoff. |
| Drift management | Amber | ↑ | Drift scan run at period start (improvement). 7 of 9 findings not tracked as issues (gap). No end-of-period scan. Was Amber↓. |
| Multi-agent readiness | Green | ↑ | Worktree support in `/feature`. `/feature-cont` for session handoff. Monitoring operational. Issues single-scoped. |
| Code quality tooling | Green | → | 133+ tests, tsc clean, lint clean, diagnostics pipeline active. |
| TDD discipline | Green | → | Design review caught multi-bug in `GitHubArtefactSource` before merge. Tests added for all three scenarios. |

## Comparison with previous retro (2026-03-15)

| Metric | Previous (2026-03-15) | Now (2026-03-19) | Target | Status |
|--------|----------------------|-------------------|--------|--------|
| Session logs in real time | 3/3 | 5/5 | All in-session | Met |
| Drift scan run | Not run | Run 2026-03-16 | Every period | Met |
| Done issues still open | 6 | 6 | 0 | Not met (4th retro) |
| PR size | 1 oversized (616 lines) | All within target | Under 200 lines | Met |
| Retro action follow-through | 1/6 done | 2/5 done | All addressed | Improving |
| Drift findings tracked as issues | 0/9 | 2/9 | All | Partial |

## Overall assessment

Delivery this period is strong — four issues completed, design review caught a significant
correctness bug before merge, and the monitoring stack is now operational and verified. The
`/feature` toolchain is materially more capable than it was two weeks ago.

The persistent weakness remains closing the loop. Issue #18 has been open on GitHub for at
least four retros. The six stale issues take minutes to close and have been deferred for weeks.
Separately, 7 of 9 drift findings from 2026-03-16 have no GitHub issues — they will be
forgotten by the next drift scan cycle.

**Top 3 actions:**

1. **Now (5 minutes):** `gh issue close 18 23 25 27 35 36` — end the four-retro streak.
2. **Before next session's feature work:** Convert C1, W2, W5, W6 from the 2026-03-16 drift
   report into GitHub issues. These are the highest-impact untracked findings.
3. **After next session's changes:** Run `/drift-scan` — the current codebase (ADR-0013,
   LLD 2.5, `GitHubArtefactSource`) has not been scanned.
