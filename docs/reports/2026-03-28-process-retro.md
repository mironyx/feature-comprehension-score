# Process Retrospective

**Date:** 2026-03-28
**Period:** 2026-03-24 (after last retro) to 2026-03-28 (today)
**Sessions reviewed:** 2026-03-24-session-4, 2026-03-24-session-5, 2026-03-25-session-1 through 3,
2026-03-26-session-1 through 5, 2026-03-27-session-1 through 4, 2026-03-28-session-1

---

## What went well

- **Highest-velocity period to date.** ~13 issues delivered in four days: Vault migration fix (#85),
  LLD internal decomposition (#96), complexity budget gate (#98), design-conformance agent (#97),
  `POST /api/fcs` (#102), scoring integration (#103), `POST /api/assessments/[id]/answers` (#59),
  navigation layout (#62), FCS results page (#104), assessment answering page (#61),
  OpenRouter replacement (#112), reference answer gate (#109), GitHub App webhook handler (#116).
  The end-to-end MVP flow is now visible across the stack.

- **Internal decomposition in LLD resolves post-PR design pivot root cause.** Session
  2026-03-25-session-1 added `#### Internal decomposition` sections to all five unimplemented
  routes, with named helpers, line budgets, and `Do NOT` constraints. The `ApiContext`/service
  pattern was formalised. This was Action 5 from the previous retro and was fully executed.
  Immediately downstream issues (answers, FCS creation, webhook) implemented the pattern from day
  one.

- **Complexity budget added as a hard gate.** Issue #98 added function/file/nesting limits to
  `CLAUDE.md` and made `/diag` a blocking step in `/feature`. CodeScene findings are now
  caught in-session rather than in PR review.

- **Design-conformance agent added to `/pr-review`.** Issue #97 adds a third parallel agent that
  checks SOLID/Clean Architecture/ADR compliance. First PR to use it (#99) caught four
  architectural findings during review.

- **`/simplify` prohibited in `/feature`.** Saves ~2 agent runs per feature (~$1–2). Confirmed
  working since 2026-03-28-session-1 which noted cost savings.

- **Diagnostics on test files now enforced.** `/diag` and `/feature` Step 6 both explicitly
  include `tests/`. Fixes repeated pattern from prior period where CodeScene Code Duplication on
  test files was caught only after user prompted.

- **Pre-compact hook writes draft session log.** Prevents session context loss when context limit
  is hit mid-implementation. Continuation sessions can orient quickly from the draft.

- **Session logs 100% in real time.** Fifth consecutive period at 100%.

- **All commits conventional with issue references.** No noise commits.

---

## What needs improving

### Done-but-Open streak: still unresolved (seventh consecutive retro)

**Observation:** #18, #27, #35, #36, #37 remain open on GitHub. #23 and #25 appear to have been
closed (no longer in the open issue list), which is partial progress. But the core set (#18, #27,
#35, #36) has appeared in every retro since 2026-03-09.

**Impact:** The open issue list includes ~30% false positives, corrupting priority decisions. The
action has been listed in every retro for seven weeks without full execution.

**Root cause:** The action was marked "not started" in the 2026-03-24 retro and was not run before
the next feature session. It requires manual `gh issue close` execution.

**Resolution:** `gh issue close 18 27 35 36 37` — run right now, before the next feature.
Then add automated Done-but-Open close to `/feature-end`.

### No drift scan run since 2026-03-24

**Observation:** The period delivered ~13 issues including the full PRCC webhook handler, FCS
creation endpoint, scoring integration, answering UI, results page, and navigation. No drift scan
was run.

**Impact:** At the 2026-03-24 scan, two Critical items and nine Warnings were open. C2 (six API
routes absent) is now partially resolved (answers, fcs, webhook, nav all delivered), but C1 (model
string inconsistency) was unfixed, and W9 (no integration tests for assessment API routes) was
unresolved. New code may have introduced fresh drift.

**Resolution:** Run `/drift-scan` immediately after this retro.

### Post-PR cost ratio remains high

**Observation:**

| Issue | At PR creation | Final | Ratio | Primary driver |
|-------|---------------|-------|-------|----------------|
| #104 FCS results page | $1.48 | $6.26 | 4.2× | Diagnostics fix cycles ×3 |
| #61 answering page | $0.94 | $8.03 | 8.5× | Context compaction + 12 agent spawns |
| #116 webhook handler | $5.23 | $13.86 | 2.6× | Mock complexity + 14 agent spawns |
| #109 reference gate | $1.68 | $6.02 | 3.6× | Diagnostics missed ×2 + compaction |

Despite the `/simplify` prohibition and internal decomposition improvements, the post-PR delta
remains 2–8× the pre-PR cost. Key drivers are context compaction (sessions regularly crossing the
limit) and CodeScene/diagnostics cycles on test files.

**Improvement:** The diagnostics miss on test files (the #109 driver) should be resolved by the
skill update. Context compaction is structural — features with >10 test iterations will hit the
limit. The most actionable intervention is the `/pr-review` local pre-push pass noted in
session 2026-03-26.

### Pre-existing test isolation bug untracked

**Observation:** Session 2026-03-28-session-1 notes: "`installation-handlers.test.ts` and
`github.test.ts` fail when run together but pass individually. Pre-existing vitest mock-caching
issue." No GitHub issue was created.

**Impact:** `npx vitest run` is unreliable. CI may mask failures or pass spuriously.

**Resolution:** Create a GitHub issue, reproduce the failure, and fix it before it causes a false
green.

### CI probe subagent hits permission prompts

**Observation:** Session 2026-03-27-session-1 notes two CI probe subagents failed due to Bash
permission errors, requiring inline `gh run watch` as a fallback. Wasted ~3 agent invocations.

**Impact:** Minor cost; more significant is that the failure pattern recurs despite being noted in
prior sessions.

**Resolution:** Update `/feature` SKILL.md to use inline `gh run watch` directly, not a background
subagent, for CI monitoring.

### Issue #118 (transaction safety) not in board priority

**Observation:** Issue #118 was created in session 2026-03-28-session-1 as a follow-up for
multi-step Supabase writes lacking transaction safety. It is open but status on the board is
unclear.

**Impact:** `handleInstallationCreated` can leave the DB in a partial state on failure.

**Resolution:** Add #118 to the board in Todo with `mvp-blocking` label.

---

## Actions from previous retro (2026-03-24)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | `gh issue close 18 23 25 27 35 36` | Partial | #23 and #25 closed; #18, #27, #35, #36 still open. **Seventh consecutive retro.** |
| 2 | Add automated Done-but-Open close step to `/feature-end` | Not started | No skill change in this period. |
| 3 | Create issues for W1 (linked-issue dedup) and W5 (email ADR) | Not started | No evidence in session logs. |
| 4 | Run `/drift-scan` | Not done | No new drift report since 2026-03-24. |
| 5 | Before implementing: confirm LoC/cc bounds in LLD | **Done** | Internal decomposition sections added in session 2026-03-25-session-1. Line budgets explicit in all five routes. |
| 6 | Clarify `.claude/settings.json` OTEL state | Not resolved | No evidence of follow-up. |

---

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | `gh issue close 18 27 35 36 37` — **before the next feature session** | Done-but-Open seventh streak |
| 2 | Add automated Done-but-Open close step to `/feature-end` | Prevent eighth retro |
| 3 | Run `/drift-scan` immediately after this retro | No scan since 2026-03-24 |
| 4 | Create GitHub issue for vitest test isolation bug (installation-handlers + github tests fail together) | Untracked pre-existing bug |
| 5 | Update `/feature` SKILL.md: use `gh run watch` inline rather than a ci-probe subagent | CI probe permission failures |
| 6 | Add issue #118 to board as `mvp-blocking` Todo | Transaction safety gap |
| 7 | Create issues for W1 (linked-issue dedup uses title not number) and W5 (email service ADR) — carried from 2026-03-24 | Untracked drift findings |

---

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Amber | ↑ | #23/#25 closed (improvement); #18, #27, #35, #36, #37 still open. Deferred-post-mvp tagging is clean. |
| Definition of done | Green | ↑ | LLD sync every session; diagnostics on test files now in skills; internal decomposition in LLD. |
| Commit discipline | Green | → | All conventional with issue refs. No noise commits. |
| Session continuity | Green | → | 100% in-session logs; pre-compact hook covers context limit edge case. |
| Drift management | Red | → | No scan since 2026-03-24 despite 13 issues delivered. C1 (model string) still unfixed. |
| Multi-agent readiness | Amber | → | CI probe permission failures recur; test isolation bug untracked; issues are single-scoped. |
| Code quality tooling | Green | ↑ | Complexity budget hard gate; design-conformance agent; `/simplify` prohibited in `/feature`. |
| TDD discipline | Green | → | All issues implemented tests-first; BDD specs throughout. |

---

## Comparison with previous retro (2026-03-24)

| Metric | Previous (2026-03-24) | Now (2026-03-28) | Target | Status |
|--------|-----------------------|------------------|--------|--------|
| Session logs in real time | 8/8 | ~12/12 | All in-session | Met |
| Drift scan run | Not run | Not run | Every period | **Not met (2nd consecutive)** |
| Done issues still open | 6 | 4–5 | 0 | Partial improvement |
| Retro actions followed through | 1/6 | 1/6 | All | → Same |
| PR size | All within target | All within target | Under 200 lines | Met |
| Post-PR cost ratio | 2.7–4.5× | 2.6–8.5× | ≤ 1.5× | Not met |
| Issues without GitHub issues | 1 | 0 | 0 | Met |

---

## Overall assessment

This is the most productive four-day period in the project. The full MVP flow — org setup,
webhook ingestion, FCS creation, answering, scoring, results — is now visible end-to-end.
The LLD internal decomposition improvement directly reduced post-PR design pivots on new routes.
Code quality tooling (complexity budget, design-conformance agent, diagnostics on tests) is now
mature and embedded.

The two chronic failures are unchanged: Done-but-Open issues (seventh retro) and no drift scan.
Neither has a technical blocker — both require 5 minutes of manual execution. The drift scan gap
is now urgent: with 13 new issues delivered since the last scan, including the webhook handler,
FCS creation, and scoring integration, the codebase has diverged significantly from the last scan
baseline.

**Top 3 actions:**

1. **Now (2 minutes):** `gh issue close 18 27 35 36 37` — end the seven-retro streak.
2. **Now (15 minutes):** Run `/drift-scan` — 13 issues delivered since last scan. C1 (model string)
   is still unfixed. The webhook + FCS endpoints are new and unscanned.
3. **This session:** Add automated Done-but-Open close to `/feature-end` so this action never
   recurs.
