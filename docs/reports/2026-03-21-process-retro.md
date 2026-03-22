# Process Retrospective

**Date:** 2026-03-21
**Period:** 2026-03-19 (after session-2) to 2026-03-21
**Sessions reviewed:** 2026-03-19-session-3, 2026-03-20-session-1, 2026-03-20-session-2,
2026-03-20-session-3, 2026-03-21-session-1, 2026-03-21-session-2

## What went well

- **Strong delivery.** Six issues completed: #52 (Supabase SSR clients — review pass), #50 (participant_answers
  columns), #51 (seed data), #65 (declarative schema workflow), #76 (LF normalisation), #53 (GitHub OAuth
  sign-in). Issue #53 is a major Phase 2 milestone: the full auth flow — sign-in page, PKCE callback,
  pgsodium token encryption, middleware, sign-out — is complete and merged.
- **Drift scan run AND critical findings fixed in the same period.** The 2026-03-20 drift scan
  found two critical ADR contradictions (C1: ADR-0008 vs deployed schema; C2: ADR-0013 wrong table
  name). Both were corrected inline via commit `852d4d5` within the same session. This is the first
  retro period where critical drift has been resolved without carrying over. Drift management trend
  reverses from Amber to Green.
- **W7 (supabase/schemas/ not created) pre-emptively resolved.** The declarative schema workflow
  (#65, PR #75) was completed before it became a blocker for Phase 2 database work. The 2026-03-20
  drift report confirmed `db diff` is clean.
- **/lld-sync skill created and wired into /feature-end.** LLD sync is now an automatic step in the
  feature wrap-up flow (Step 1.5), reducing the risk of design documentation falling out of sync with
  implementation. The lld-sync for §2.2 (SSR clients) was produced and updated the LLD in-place.
- **Tool reliability improvements.** `gh-project-status.sh` was rewritten to use a GraphQL query
  (board item lookup was silently failing for every `/feature-end` call). `/feature-end` steps 5–6
  batched into a single Bash call (addresses user feedback on approval prompt count).
- **ci-probe background agent added.** A background CI agent launches after every PR push, watches
  the GitHub Actions run, and reports failures asynchronously. Eliminates manual CI polling.
- **Session logs for all six sessions.** Third consecutive retro period with 100% in-session log
  completion.
- **14 commits in the period; all follow conventional commit format with issue references.** No
  untracked noise commits.

## What needs improving

### Issue lifecycle management — fifth consecutive retro

**Observation:** Issues #18, #23, #25, #27, #35, #36 remain open on GitHub. All are marked Done on
the project board. The backlog list (21 open issues) contains these six false positives — nearly 30%.

**Impact:** This is now five consecutive retros raising the same finding. The number has not changed.
The backlog cannot be used as an authoritative task list without mental filtering.

**Root cause unchanged:** The action requires six `gh issue close` commands. It is deferred every
session because feature work takes priority. Without encoding it as a DoD gate it will not happen.

**Proposed resolution:** Add a one-liner to the `/feature-end` skill: after board update, check
`gh issue list --state open --json number` against known Done-but-open issue IDs and close them.
Or: close them right now — this session, before any other work.

### 2026-03-20 drift findings not yet tracked as issues

**Observation:** Of the 2026-03-20 drift report's nine findings, C1 and C2 were fixed inline and W7
was already resolved by #65. The remaining six (W1–W6 excluding W7) have no GitHub issues:

- **W1** — linked-issue deduplication uses `title` not `number` (runtime correctness risk)
- **W2** — ADR-0012 stale model string in Options Considered (internal inconsistency)
- **W3/W4** — Phase 2 app and integration tests not started (expected; flag as Phase 2 delivery requirements)
- **W5** — no ADR or LLD for email service (design gap before Phase 3)
- **W6** — OAuth scope discrepancy between Story 5.1 and ADR-0003 (may have been resolved during #53 — needs verification)

**Impact:** Without issues, these findings compete poorly against feature work and will not be addressed
before the relevant implementation begins.

### Uncommitted settings.json changes

**Observation:** Session 2026-03-21-session-1 notes that `.claude/settings.json` contains uncommitted
OTEL configuration changes that were excluded from PR #77 to keep the scope clean.

**Impact:** If the next session starts from a different context or the file is accidentally reset, the
OTEL config changes are lost. Uncommitted work is a fragility.

## Actions from previous retro (2026-03-19)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Close #18, #23, #25, #27, #35, #36 on GitHub | Not started | **Fifth consecutive retro.** |
| 2 | Create GitHub issues for unresolved drift findings C1, W1, W2, W3, W5, W6, W8 (2026-03-16 report) | Partial | Drift scan re-run (2026-03-20). New C1/C2 fixed inline. Old 2026-03-16 findings (sequential scoring, question schema min) still without issues. |
| 3 | Run fresh drift scan | Done | 2026-03-20 drift report produced. |
| 4 | Update CLAUDE.md with "check branch is off main before starting work" | Not verified | No session log evidence of CLAUDE.md update for this point. |
| 5 | Verify #65 tracked and prioritised | Done | Issue #65 completed (PR #75 merged). |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | `gh issue close 18 23 25 27 35 36` — end the five-retro streak | Chronic backlog hygiene |
| 2 | Create GitHub issues for W1 (linked-issue dedup) and W5 (email service ADR) — highest impact remaining 2026-03-20 findings | Drift findings without issues |
| 3 | Verify or close W6 (OAuth scope Story 5.1 vs ADR-0003): check whether the #53 implementation used `user:email` or `read:user`, update whichever is wrong | OAuth scope drift |
| 4 | Commit (or explicitly discard) the uncommitted `.claude/settings.json` OTEL changes | Uncommitted work fragility |
| 5 | Add `gh issue close <done-but-open IDs>` step to `/feature-end` skill as a standing hygiene gate | Prevent sixth retro on same finding |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Red | → | Six Done issues still open. Fifth consecutive retro. Board and GitHub out of sync. |
| Definition of done | Amber | ↑ | Drift fixes now resolved inline (improvement). Stale issues and uncommitted work still leak through. |
| Commit discipline | Green | → | 14 commits, conventional messages throughout, issue references on all feature commits. |
| Session continuity | Green | → | All six sessions logged in-session. `/feature-cont` and `/lld-sync` provide strong cross-session continuity. |
| Drift management | Green | ↑ | Drift scan run. Critical findings (C1, C2) resolved same period — first time this has happened. W7 pre-emptively resolved. Trend reverses from Amber. |
| Multi-agent readiness | Green | → | ci-probe background agent operational. Issues remain single-scoped. Worktrees removed (better human visibility). |
| Code quality tooling | Green | → | 158 unit tests green, tsc clean, lint clean, /lld-sync keeps design docs current. |
| TDD discipline | Green | → | All six issues implemented with tests-first discipline maintained. |

## Comparison with previous retro (2026-03-19)

| Metric | Previous (2026-03-19) | Now (2026-03-21) | Target | Status |
|--------|----------------------|-------------------|--------|--------|
| Session logs in real time | 5/5 | 6/6 | All in-session | Met |
| Drift scan run | Run (2026-03-16) | Run (2026-03-20) | Every period | Met |
| Critical drift fixed same period | 0/2 | 2/2 | All | **Met (first time)** |
| Done issues still open | 6 | 6 | 0 | Not met (5th retro) |
| Retro actions followed through | 2/5 | 3/5 | All | Improving |
| PR size | All within target | All within target | Under 200 lines | Met |

## Overall assessment

This is the strongest process period to date. Six issues completed (including the major GitHub OAuth
milestone), drift scan run and critical findings resolved within the period, four new process tools
added (/lld-sync, ci-probe, /feature-end reliability, gh-project-status GraphQL fix), and session
logs written for all six sessions.

The one persistent failure is the six Done-but-Open issues. Five consecutive retros have not shifted
this — it will not move without automation or a deliberate five-minute close-out.

**Top 3 actions:**

1. **Now (2 minutes):** `gh issue close 18 23 25 27 35 36` — close the five-retro streak.
2. **Before Phase 2 API work begins:** Create issues for W1 (linked-issue dedup) and W5 (email
   service ADR). W1 is a correctness bug that will affect artefact assembly; W5 is a design gap that
   will block Phase 3 implementation.
3. **Today:** Commit (or discard) the uncommitted `.claude/settings.json` OTEL changes.
