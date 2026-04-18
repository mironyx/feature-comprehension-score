# Process Retrospective

**Date:** 2026-03-15
**Period:** 2026-03-14 (previous retro) to 2026-03-15
**Sessions reviewed:** 2026-03-15 sessions 1, 2, 3

## What went well

- **High velocity on core engine.** Four issues completed in a single day: #26 (question generation), #28 (answer scoring), #29 (relevance detection), #30 (aggregate calculation). The assessment engine is now feature-complete except for the orchestrator (#31).
- **Session logs written in real time.** All three sessions produced logs during the session, not backfilled. This directly addresses the regression flagged in the previous retro.
- **Strong TDD discipline maintained.** Test count grew from 76 to 129 across 15 test files. BDD format consistently applied. Red-Green-Refactor cycle followed.
- **PR workflow maturing.** Three PRs (#41, #42, #43) created, reviewed, and merged within the same day. Feature branches used correctly (`feat/question-generation`, `feat/assessment-engine-scoring-aggregate`).
- **Conventional commits with issue references.** Every feature commit references the relevant issue number. Merge commits are clean.
- **User feedback captured and acted on.** Session 2 recorded two pieces of process feedback (issue detail, branch-first workflow) and both were saved to memory for future sessions.
- **Design docs updated alongside implementation.** Session 1 updated `v1-design.md` and `lld-artefact-pipeline.md` when adding `additional_context_suggestions`.

## What needs improving

### Issue lifecycle management — chronic problem

**Observation:** 6 issues are marked Done on the project board but remain Open on GitHub: #18, #23, #25, #27, #35, #36. Issue #23 has been flagged in every retro since 2026-03-12 (three consecutive retros). Issues #35 and #36 were reportedly closed in session 19 but are still open.

**Impact:** The GitHub issue list shows 10 open issues, but only 4 genuinely need work (#22, #31, #33, #37). 60% of "open" issues are actually done. This erodes trust in the backlog as a source of truth.

### PR #43 exceeded size target

**Observation:** Session 3 commit `fba5d71` was 616 lines across 11 files, implementing three issues (#28, #29, #30) in a single PR. The project targets PRs under 200 lines.

**Impact:** Large PRs are harder to review thoroughly and increase merge risk. Three separate PRs would have been more aligned with the process.

### No drift scan since 2026-03-12

**Observation:** The last drift report is `2026-03-12-drift-report.md`. Three sessions of new engine code (generation, scoring, relevance, aggregate) have been added without a drift scan.

**Impact:** Design-to-code drift may be accumulating undetected, especially given the volume of new engine modules.

### Branch-first workflow violated

**Observation:** Session 2 noted that work started on `feat/assessment-engine` before creating a feature branch. The user corrected this. Previous retro action #6 (add "check branch" step to CLAUDE.md) was not implemented.

**Impact:** Without a documented protocol, agents will continue defaulting to working on the integration branch.

### Previous retro actions mostly not addressed

**Observation:** Of 6 actions from the previous retro, only 1 is clearly done (session logs written in real time). 5 are not started. The suggestion to track retro actions as GitHub issues (action #5) was itself not tracked as an issue.

**Impact:** The retro produces analysis but actions are not being executed. This is a pattern across three retros now.

## Actions from previous retro

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Close issue #23 and merge PR #34 | Partial | PR #34 merged (as PR #40). Issue #23 still open. |
| 2 | Write session logs at end of each session | Done | All 3 sessions logged in real time |
| 3 | Add visible status to diagnostics hook | Not started | No evidence of change |
| 4 | Triage #18 and #22 | Not started | #18 is Done on board but open. #22 remains open and untriaged. |
| 5 | Track retro actions as GitHub issues | Not started | Actions still only in markdown |
| 6 | Add "check branch" step to CLAUDE.md | Not started | Branch-first violation recurred in session 2 |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Close all Done-but-Open issues: #18, #23, #25, #27, #35, #36 | Chronic issue lifecycle gap — flagged 3 retros running |
| 2 | Run drift scan before starting #31 (orchestrator) | No drift scan since 2026-03-12; 4 new engine modules added |
| 3 | Add "check branch" step to CLAUDE.md session guidance — create a GitHub issue for this | Branch-first violation + carry-forward from 2 previous retros |
| 4 | Enforce PR size limit: one issue per PR, target under 200 lines | PR #43 was 616 lines / 3 issues |
| 5 | Create GitHub issues for retro actions that are not completed in the current session | 5 of 6 previous actions not started; pattern across 3 retros |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Red | ↓ | 6 Done issues still open on GitHub. 60% of open issues are false positives. #23 flagged for 3 consecutive retros. Was Amber. |
| Definition of done | Amber | → | Work quality is high but issue closure consistently skipped. DoD needs "close the issue" as an enforced step. |
| Commit discipline | Green | → | Conventional commits, issue references, session logs committed. One oversized PR (616 lines) is the only blemish. |
| Session continuity | Green | ↑ | All 3 sessions logged in real time. Regression from previous period corrected. Was Amber. |
| Drift management | Amber | ↓ | No drift scan this period despite 4 new engine modules. Was Green. |
| Multi-agent readiness | Green | → | Feature branches, PRs, clear issue scope. Issues now include source file references per user feedback. |
| Code quality tooling | Green | → | 129 tests, tsc clean, lint clean. Diagnostics pipeline operational. |
| TDD discipline | Green | → | Consistent Red-Green-Refactor. BDD specs for all new modules. |

## Comparison with previous retro

| Metric | Previous (2026-03-14) | Now (2026-03-15) | Target | Status |
|--------|----------------------|-------------------|--------|--------|
| Session logs in real time | 1/4 | 3/3 | All in-session | Met |
| Drift scan frequency | LLD drift found and fixed | No scan run | Every session with code changes | Not met |
| Done issues still open | ~2 (estimated) | 6 confirmed | 0 | Not met |
| PR size | Within target | 616 lines (1 PR) | Under 200 lines | Not met |
| Retro action follow-through | 2/7 done | 1/6 done | All addressed | Not met |
| Commits per task | ~1 | ~1 | 1 | Met |

## Overall assessment

Engineering output this period is strong — four core engine components delivered in one day with solid test coverage, clean commits, and timely session logs. The *building* is excellent.

The persistent weakness is *closing the loop*: issues remain open after work is done, retro actions are identified but not executed, and housekeeping tasks (drift scans, branch protocol documentation) are deferred indefinitely. Issue #23 being open across three consecutive retros is the clearest symptom — it would take 30 seconds to close, but it keeps being deferred.

**Top recommendation:** Before any new feature work, spend 10 minutes closing the 6 stale issues and running a drift scan. Then create GitHub issues for the 3 carry-forward retro actions (#3, #4, #5) so they are tracked in the same system as feature work.
