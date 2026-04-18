# Process Retrospective

**Date:** 2026-04-12
**Period:** 2026-04-01 (after last retro) to 2026-04-12 (today)
**Sessions reviewed:** 2026-04-02-session-1-158, 2026-04-06-session-1-epic-task-organisation,
2026-04-07-session-1 through session-4, 2026-04-08-session-1 through session-4 (including
parallel sub-sessions for #187, #188, #189, #190, #191), 2026-04-09-session-1-kickoff-skill,
2026-04-10-session-1 through session-3 (including parallel sub-sessions for #180, #181, #182),
2026-04-10-session-2-onboarding-guide, 2026-04-11-session-1 through session-3 — 22 session
logs total

---

## What went well

- **Full onboarding-auth epic delivered end-to-end.** Epic #176 (10 tasks: #177–#192 minus
  gaps) completed across 11 days. Every task followed the design-down process: ADR-0020 →
  HLD (#186) → per-task LLDs → TDD implementation → PR review → merge. The epic model
  (ADR-0018) proved its value — clear parent/child references, one LLD per task, checklist
  tracking on the epic issue.

- **Epic/task organisation formalised (ADR-0018).** Work is now structured as epics containing
  tasks, with `lld-<epic-slug>-<task-slug>.md` naming. This was the first epic to use the
  model and it worked smoothly.

- **Pipeline skills expanded significantly.** `/kickoff`, `/discovery`, and `/requirements`
  skills created, completing the full pipeline from idea to implementation. The engineering
  process document (`docs/process/engineering-process.md`) now describes the entire lifecycle.
  LLD template restructured into Part A/B with diagrams and invariants.

- **Parallel `/feature-team` runs for docs tasks.** Sessions 2026-04-08-session-2 ran four
  parallel teammates (#187, #188, #189, #190) for documentation tasks. All completed and
  merged. Crash recovery improvements (`cf49af8`) and auto-tick parent epic checklist
  (`5f4d71f`) hardened the parallel workflow.

- **Session logs 100%.** Seventh consecutive period at full coverage. Naming convention
  consistently uses `YYYY-MM-DD-session-N-<topic-or-issue>.md`. Parallel teammate sessions
  produce separate logs.

- **All 68 commits follow conventional format.** Zero non-conventional commits. 32 of 68
  include explicit issue references (the remaining 36 are harness/skill/docs commits where
  no issue exists — acceptable per process).

- **25 issues closed in 11 days.** Consistent delivery pace maintained from the previous
  period. Mix of feature implementation (#178, #179, #180, #181, #182, #192), documentation
  (#183, #186, #187, #188, #189, #190, #191), and harness improvements.

- **Design-down discipline held under pressure.** The #178 implementation (resolveUserOrgsViaApp)
  discovered systemic drift between v1-design.md, ADR-0020, and the codebase. Rather than
  patching and moving on, the team paused feature work, created 6 reconciliation tasks
  (#186–#191), and resolved the drift before continuing. This is exactly the right behaviour.

---

## What needs improving

### No drift scan since 2026-03-28 (fourth consecutive period)

**Observation:** Zero drift scans in this period despite being the #1 action from the last
retro. 25 more issues delivered since the last scan. The onboarding-auth epic introduced
new API routes, RLS policies, webhook handlers, and token management — all high-drift-risk
areas.

**Impact:** The manual discovery of design↔code drift during #178 (session 2026-04-07-session-4)
validates the concern. That drift was caught by accident during implementation, not by a scan.
Critical items from the 2026-03-28 scan (stale Anthropic mock, stale LLD references, invalid
enum in test fixture) remain unverified.

**Resolution:** Run `/drift-scan` immediately after this retro. **This action has been carried
for four consecutive retros.** Consider making it a blocking step in `/feature-end` or
`/retro` to prevent further deferral.

### Harness commits lack issue references

**Observation:** 36 of 68 commits have no issue reference. Most are harness/skill changes
(e.g., `fix(harness): ...`, `docs(harness): ...`, `chore: ...`). While these don't correspond
to tracked issues, the CLAUDE.md rule says "No work without an issue."

**Root cause:** Harness and skill improvements are treated as infrastructure that doesn't need
tracking. This creates a blind spot — significant effort goes into harness work (crash recovery,
epic checklist automation, LLD template redesign, three new skills) with no issue trail.

**Resolution:** Create a standing "harness improvements" issue or use a `harness` label on
individual issues. Alternatively, accept that harness commits are exempt from the issue
requirement and document this exception in CLAUDE.md.

### Retro action completion rate still low

**Observation:** From the 7 actions in the 2026-04-01 retro, completion is mixed (see table
below). The drift scan action has now been carried across four retros. The vitest isolation
bug issue (#170) was created but not fixed. Drift finding issues (W1/W5) still not created
(fourth carry).

**Root cause:** Retro actions compete with feature work and consistently lose. They are not
on the project board, so they are invisible to the prioritisation process.

**Resolution:** Create GitHub issues for retro actions that require more than 5 minutes of
work. Add them to the project board so they compete fairly with feature work.

### Deferred issues #18 and #27 still in "Done" column

**Observation:** Action 6 from the last retro asked to verify deferred issues are NOT in
"Done" on the board. #18 and #27 are still in "Done". #35, #36, #37 are not on the board
at all.

**Resolution:** Move #18 and #27 out of "Done" to a backlog state, or remove them from the
board entirely since they have `deferred-post-mvp` labels.

### Cost tracking not validated in parallel mode

**Observation:** Action 4 from the last retro (validate parallel cost pipeline) was not done.
The 2026-04-08 parallel run (4 teammates) and 2026-04-10 parallel run (3 teammates) both
occurred without validating per-teammate cost metrics. Session 2026-04-10-session-1-180
explicitly notes "teammate session not registered in prom file — known gap."

**Resolution:** This is now blocking accurate cost data for parallel runs. Validate before
the next parallel run or accept that parallel cost tracking is deferred.

---

## Actions from previous retro (2026-04-01)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Run `/drift-scan` immediately | **Not done** | Fourth consecutive carry. No scan since 2026-03-28. |
| 2 | Remove worktree from `/feature` | Done (prior) | Already resolved before last retro. No violations this period. |
| 3 | Create GitHub issue for vitest isolation bug | **Done** | #170 created. Not yet fixed. |
| 4 | Validate parallel cost pipeline end-to-end | **Not done** | Two parallel runs occurred without validation. Known gap persists. |
| 5 | Add lead verification gate for teammate `/feature-end` | **Partial** | Crash recovery and auto-tick improvements added (`cf49af8`, `5f4d71f`), but no explicit lead verification gate for session logs/LLD sync. |
| 6 | Verify deferred issues not in "Done" on board | **Not done** | #18 and #27 still in "Done". |
| 7 | Create issues for W1/W5 drift findings | **Not done** | Fourth consecutive carry. |

---

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Run `/drift-scan` — **immediately after this retro**. If deferred again, add drift scan as a blocking step in `/retro` skill itself. | Fourth consecutive carry; 25+ issues since last scan |
| 2 | Move #18, #27 out of "Done" on project board (or remove from board). They are `deferred-post-mvp`. | Deferred issues incorrectly in Done |
| 3 | Create issues for W1 (stale `user_github_tokens` DDL in HLD) and W5 (email service ADR) drift findings — or verify they were resolved by the auth reconciliation work (#186–#191). | Fourth consecutive carry |
| 4 | Decide on harness commit tracking: either create issues for harness work or document an explicit exemption in CLAUDE.md for `(harness)` scope commits. | 53% of commits lack issue references |
| 5 | Create GitHub issues for retro actions that take >5 min, and add to project board. | Retro actions consistently deprioritised |
| 6 | Validate parallel cost pipeline or formally defer it. Two parallel runs produced no cost data. | Cost tracking broken in parallel mode |

---

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Amber | → | 25 open issues, mostly well-labelled. `deferred-post-mvp` set is clean. #18/#27 incorrectly in "Done" on board. Epic #176 tracking worked well. |
| Definition of done | Green | → | Epic #176 fully delivered with all design-down levels. LLD sync, diagnostics, and review consistently applied. |
| Commit discipline | Green | → | 68 commits, all conventional. Issue refs present on all feature/fix commits. Harness commits lack refs (see action #4). |
| Session continuity | Green | ↑ | 100% coverage, seventh consecutive period. Parallel sessions documented separately. Crash-recovered sessions reconstructed from git history. |
| Drift management | Red | → | Fourth consecutive period without a scan. Manual drift discovery during #178 validates the risk. Auth reconciliation (#186–#191) was reactive, not proactive. |
| Multi-agent readiness | Green | ↑ | Two successful parallel runs this period (4 teammates on 2026-04-08, 3 on 2026-04-10). Crash recovery hardened. Auto-tick parent epic. Cost tracking remains the gap. |
| Code quality tooling | Green | → | Diagnostics pipeline stable. Feature evaluator (ADR-0019) wired into feature-core. |
| TDD discipline | Green | → | All feature implementations tests-first. BDD specs throughout. |
