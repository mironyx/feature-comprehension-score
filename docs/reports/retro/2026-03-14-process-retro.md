# Process Retrospective

**Date:** 2026-03-14
**Period:** 2026-03-12 (previous retro) to 2026-03-14
**Sessions reviewed:** Sessions 17, 18, 19, 20

## What went well

- **Design-first approach adopted for feature work.** Session 17 produced an LLD (`lld-artefact-pipeline.md`), ADR-0011 (artefact extraction strategy), and implementation plan *before* writing any code for issue #25. Multiple design review iterations with the user. This is the design-down process working as intended.
- **Full PR review cycle completed.** PR #34 went through: creation (session 17) → automated code review with 3 actionable findings (session 18) → feedback issues created (#35, #36, #37) and fixes implemented (session 19) → second review pass confirming merge-readiness (session 20). This is a mature review workflow.
- **Design feedback loop working.** Session 20 explicitly checked whether the LLD was still accurate after implementation and found three areas of drift (section ordering, missing `truncation_notes`, stale quality classification). All were fixed in the same session. This addresses the "no feedback loop from implementation back to design" problem identified in the previous retro.
- **CodeScene warnings resolved proactively.** Session 19 eliminated Complex Method (cc=11) in `classifyArtefactQuality` via lookup table and Brain Method in `truncateArtefacts` via decomposition into 5 focused functions. The diagnostics pipeline is driving real quality improvements.
- **Strong TDD discipline.** 41 new BDD tests in session 17, extended to 54 after review feedback in session 19 (76 total across the engine). Tests written before implementation, covering edge cases like negative budget, empty descriptions, and the new `code_and_design` quality variant.
- **Review feedback creates trackable issues.** Rather than ad-hoc fixes, review findings became issues #35, #36, #37 with clear scope. #35 and #36 were closed in the same session. #37 was explicitly deferred as tech debt.
- **Comprehension dogfooding attempted.** Session 20 generated Naur-framework questions against PR #34 artefacts. Score was low (~0.32), which surfaced the insight that proper dogfooding needs the full product pipeline — valuable product learning.

## What needs improving

### Session logs not written in real time

**Observation:** Sessions 17, 18, and 19 did not produce session logs at the time. All three were backfilled in session 20. The previous retro rated session continuity as Green based on consistent logs, but this period shows regression.

**Impact:** If session 20 had not backfilled, three sessions of context would be lost. Backfilled logs rely on memory and git history rather than in-the-moment capture, potentially missing nuance.

### Issue #23 still not closed

**Observation:** The previous retro (action #3) identified that issue #23 (LLM client wrapper) should be closed — the work was completed in session 15. Two days later, it remains open. Issue #24 was closed but #23 was not.

**Impact:** Board state does not reflect reality. This is a recurring theme — work gets done but lifecycle management (closing issues, updating board) lags.

### PR #34 still not merged after two review passes

**Observation:** PR #34 was created in session 17 (2026-03-13), reviewed in session 18, feedback addressed in session 19 (via PR #38), and approved in session 20 (2026-03-14). It is still open. The branch `feat/artefact-types-prompt-builders` has uncommitted requirements changes (`docs/requirements/v1-requirements.md` modified per git status).

**Impact:** Long-lived feature branches accumulate merge risk. The work is review-approved but not landed.

### Stale issues #18 and #22 not triaged

**Observation:** Previous retro action #6 asked to triage issues #18 (architecture fitness functions) and #22 (harness improvement roadmap). Neither appears to have been addressed — no session log mentions them and both remain open.

**Impact:** Stale open issues create noise on the board and obscure actual priorities.

### Previous retro actions partially addressed

**Observation:** Of 7 actions from the previous retro, only 2 are clearly done (drift agent update, design adequacy check). 1 is partial (#24 closed but #23 not). 4 are not started or unknown (diagnostics hook visibility, check-branch protocol, VS Code diff investigation, #18/#22 triage).

**Impact:** Retro actions lose value if they are not tracked and completed. The retro produces good analysis but follow-through is inconsistent.

## Actions from previous retro

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Update drift agent to scan `src/` and `tests/` | Done | Agent definition now includes `src/` scanning (confirmed in file) |
| 2 | Add visible status output to diagnostics hook | Not started | No evidence of change to hook output |
| 3 | Close issue #23 and #24 | Partial | #24 closed, #23 still open |
| 4 | Add "check branch" step to session start protocol | Not started | No evidence of CLAUDE.md update |
| 5 | Investigate VS Code diff display settings | Not started | No session log mentions this |
| 6 | Triage #18 and #22 | Not started | Both issues remain open, no triage discussion |
| 7 | Add design adequacy check to PR review | Done | Session 20 explicitly checked LLD against implementation and updated design docs |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Close issue #23 (LLM client — work completed session 15) and merge PR #34 | Stale board state, long-lived branch |
| 2 | Write session logs at end of each session, not backfilled later | Session continuity regression |
| 3 | Carry forward: add visible status to diagnostics hook (even when 0 issues) | Previous retro action #2, still unaddressed |
| 4 | Carry forward: triage #18 and #22 — close or re-scope | Previous retro action #6, still unaddressed |
| 5 | Track retro actions as GitHub issues to prevent them being forgotten | 4 of 7 previous actions not started |
| 6 | Carry forward: add "check branch" step to session start in CLAUDE.md | Previous retro action #4, still unaddressed |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Amber | ↓ | #23 still open despite completion. #18, #22 still untriaged. Board status lags reality. Was Green. |
| Definition of done | Amber | → | PR review findings tracked as issues with clear scope. But issue closure and PR merge lag behind work completion. |
| Commit discipline | Green | ↑ | Conventional commits with issue references. `4f5c5e2 fix: address PR #34 review feedback (#35, #36)` and `6d568a2 refactor: resolve CodeScene warnings`. Clean. |
| Session continuity | Amber | ↓ | 3 of 4 sessions backfilled rather than written in real time. Was Green. |
| Drift management | Green | → | Session 20 found and fixed LLD drift. Design feedback loop is now operational. |
| Multi-agent readiness | Green | → | PR workflow mature. Automated review + human review. Feature branches used correctly. |
| Code quality tooling | Green | → | CodeScene warnings actively resolved. Diagnostics pipeline driving improvements. |
| TDD discipline | Green | → | 54 new tests this period. Red-Green-Refactor followed. Edge cases covered after review feedback. |

## Comparison with previous retro

| Metric | Previous (2026-03-12) | Now (2026-03-14) | Target | Status |
|--------|----------------------|-------------------|--------|--------|
| Session orientation time | Minimal | Minimal (when logs exist) | Minimal | Met |
| Drift report critical items | 1 found, 1 fixed | LLD drift found and fixed in-session | 0 within one session | Met |
| Commits per completed task | ~1.5 | ~1 (2 commits for review feedback is reasonable) | 1 | Met |
| Branch + PR workflow | Established but inconsistent | Consistent — PR #34 with full review cycle | Consistent | Met |
| Design feedback loop | None | Operational (session 20) | Active | Met |
| Retro action follow-through | N/A (first check) | 2/7 done, 1 partial, 4 not started | All addressed | Not met |
| Session logs written in session | Yes (8/8) | 1/4 in-session, 3/4 backfilled | All in-session | Not met |

## Overall assessment

The development *workflow* has matured significantly: design-first with LLD and ADR, full PR review cycles with automated and manual passes, design feedback loop closing the gap between implementation and documentation, and strong TDD discipline. The quality of engineering work this period is high.

The weakness is *housekeeping*: closing issues when work is done, merging approved PRs promptly, writing session logs in real time, and following through on retro actions. These are low-effort tasks that compound when neglected — stale board state, long-lived branches, and lost context.

**Top recommendation:** Track retro actions as GitHub issues (action #5). The retro produces good analysis but actions evaporate between sessions because they live only in a markdown file that may not be read.
