# Process Retrospective

**Date:** 2026-04-18
**Period:** 2026-04-12 (after last retro) to 2026-04-18
**Sessions reviewed:** 22 sessions across 6 days — 2026-04-13 sessions 1–3 (scoring analysis/process),
2026-04-14 sessions 1–3 (v3 architect, scoring prompt, null score UI), 2026-04-15 sessions 1–5
(hints #219–#221, depth #222/#224), 2026-04-16 sessions 1–4 + team session (#225, #223, backlog,
architect E11/E17), 2026-04-17 session 4 + team session (E11/E17 design review, 5-teammate E11
wave), 2026-04-18 sessions 1–2 (E11 cancellation, installation_id fix)

---

## What went well

- **Two full epics delivered in 6 days.** Epic #214 (Answer Guidance Hints, 3 stories) and
  Epic #215 (Configurable Comprehension Depth, 4 stories) shipped end-to-end via `/feature`
  and `/feature-team`. All stories followed design-down: LLD → TDD → review → merge.

- **E11 strategic cancellation shows design maturity.** After implementing Epic #233
  (Artefact Quality Scoring, 5 tasks) via parallel `/feature-team`, design review identified
  over-engineering: deterministic signals don't need LLM evaluation, and E17 tool-call logs
  provide organic quality signals. Full revert + LLD rewrite + requirements update executed
  cleanly. Willingness to cancel shipped work is a sign of healthy process.

- **Independent test-author sub-agent (PR #217).** Separated test writing from implementation
  in `/feature-core` (Step 4a–4d). Reduced evaluator over-generation and improved test
  independence from implementation details.

- **ADR-0022 (Tiered Feature Process) formalised.** Bug → `/feature`; Feature → `/requirements`
  → `/architect` → `/feature`; Epic → add `/kickoff`. Codifies the graduated process that
  evolved organically.

- **ADR-0023 (Tool-Use Loop for Rubric Generation).** E17 rearchitected from deterministic
  orchestrator to agentic tool-use loop. Clear separation: E17 augments V1 artefact assembly,
  doesn't replace it.

- **C1 drift finding fixed (#261).** `fetchRepoInfo` select string missing `installation_id` —
  the highest-priority item from the 2026-04-12 drift report — was fixed with test assertions
  added. `/baseline` skill created to verify such discrepancies.

- **Session logs 100%.** Eighth consecutive period. Team sessions documented separately.
  Crashed/compacted sessions recovered from git history.

- **Feature evaluator catching real gaps.** Missed retry path in #223 caught by evaluator;
  AC-3 gap in #221 caught by BDD spec review. The independent test-author + evaluator
  pipeline is proving its value.

- **500+ tests added across the period.** Test count growing with every feature. Fixture
  reuse guidance propagated to both test-author and feature-evaluator sub-agents.

---

## What needs improving

### Drift scan cadence is retro-only

**Observation:** Drift scan was run after the last retro (2026-04-12). The natural cadence
has settled on "once per retro" rather than the originally intended per-session or per-epic
scans. This is adequate — the 2026-04-12 scan caught C1 which was fixed (#261).

**Resolution:** Formalise: run `/drift-scan` as part of every `/retro`. Drop the expectation
of proactive per-session scans — they never happened and the retro cadence is sufficient.

### Prometheus cost telemetry was down for most of the period (now fixed)

**Observation:** ~10 of 22 sessions noted "Prometheus unavailable" or "TBD" for cost figures.
Two parallel `/feature-team` runs (E15 3-teammate, E11 5-teammate) produced limited cost metrics.
Fixes landed in `78378b1` and `14b2c99` (query fixes for session ID detection, Prometheus
reachability). Telemetry is now operational.

**Resolution:** Resolved. Validate cost data is flowing in the next session. No further action.

### Harness/skill commits still lack issue references (55% of commits)

**Observation:** 37 of 67 commits since the last retro have no issue reference. These are
predominantly skill improvements (`docs(skill): ...`, `chore: ...`, `docs(sessions): ...`).
The previous retro's Action #4 asked for a decision on tracking these — no decision was made.

**Resolution:** Document in CLAUDE.md that `docs(sessions):`, `docs(skill):`, and `chore:`
scope commits for harness/skill work are exempt from the issue requirement. This matches
actual practice and eliminates a recurring amber finding.

### `/feature-team` protocol gaps — premature `/feature-end`

**Observation:** Multiple instances of teammates auto-running `/feature-end` before lead
instruction (documented in E15 and E11 team sessions). Premature lead `/feature-end` on
issue #236 also occurred. The `/feature-team` skill was updated with a human review gate,
but enforcement is inconsistent.

**Resolution:** The skill update is the right fix. Monitor in next period. If it recurs,
add an explicit "wait for lead" instruction in the teammate spawn prompt.

### Context compaction causing shallow session logs

**Observation:** Two sessions (#222, #221) hit context compaction mid-way. Compaction drafts
were written to the main repo instead of the worktree in one case. Recovery was possible but
decision arcs in session logs become shallow when compaction discards earlier context.

**Resolution:** Accept as an inherent limitation. The `/remember` skill and session log
templates already mitigate this. No further action unless compaction frequency increases.

---

## Actions from previous retro (2026-04-12)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Run `/drift-scan` immediately | **Done** | Ran after retro. C1 finding (#261) fixed. Cadence settled on once-per-retro. |
| 2 | Move #18, #27 out of "Done" on board | **Not done** | #18 still on board (status unclear from `gh project` output). |
| 3 | Create issues for W1/W5 drift findings | **Not done** | Fifth consecutive carry. W1 (`installer_github_user_id`) still unresolved in `lld-onboarding-auth-webhooks.md`. |
| 4 | Decide on harness commit tracking | **Not done** | No decision made. 55% of commits still lack refs. |
| 5 | Create GitHub issues for retro actions >5 min | **Not done** | No retro action issues created. |
| 6 | Validate parallel cost pipeline or defer | **Done** | Prometheus fixes landed (`78378b1`, `14b2c99`). Telemetry now operational. |

---

## Actions (executed in-session)

All actions executed during the retro session — no carries.

| # | Action | Status |
|---|--------|--------|
| 1 | Add CLAUDE.md exemption for harness/skill/session commits. | **Done** — added to Conventions section. |
| 2 | Mark `installer_github_user_id` as "descoped" in `lld-onboarding-auth-webhooks.md`. | **Done** — AC updated with rationale (descoped per cutover LLD §6). |
| 3 | Remove #18, #27 from project board (deferred-post-mvp, incorrectly in Done). | **Done** — removed from board. |

---

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Amber | → | 33 open issues, well-labelled. Epic structure working. #18/#27 still incorrectly in Done (third carry). E11 cleanup (close/reopen) executed cleanly. |
| Definition of done | Green | ↑ | E11 cancellation included full cleanup: revert code, update requirements, close issues, update LLDs. Feature evaluator catching gaps in DoD. |
| Commit discipline | Amber | → | 67 commits, all conventional format. 30/67 (45%) have issue refs. Harness/session/skill commits are the cause — not a real problem, just needs a documented exemption. |
| Session continuity | Green | → | 100% coverage, eighth consecutive period. Team sessions documented. Compaction recovery working. |
| Drift management | Amber | ↑ | Drift scan ran after last retro; C1 fixed (#261). Cadence settled on once-per-retro. C3 (HLD sign-off) and W1/W5 still open — both blocked on human decisions, not process gaps. |
| Multi-agent readiness | Green | → | Two successful parallel runs (3 teammates for E15, 5 for E11). Protocol gap (premature `/feature-end`) identified and skill updated. Prometheus now fixed. |
| Code quality tooling | Green | → | Independent test-author + feature evaluator pipeline maturing. Diagnostics pipeline stable. `/baseline` skill added for discrepancy verification. |
| TDD discipline | Green | → | All features tests-first. 500+ tests added. BDD specs throughout. Evaluator adversarial tests adding coverage. |

---

## Process improvement proposals

### 1. Stop carrying actions — do them now or drop them

The pattern of carrying actions across 4–5 retros is the real process problem, not the
individual actions themselves. New rule:

- **Quick actions** (<5 min, e.g., "move #18 off Done"): execute during the retro session.
  Don't carry — just do them now.
- **Process changes** (e.g., "add CLAUDE.md exemption"): apply the change in the same commit
  as the retro report. The retro IS the trigger.
- **Blocked on human** (e.g., "obtain HLD sign-off"): note as a known limitation, not an
  action. If the human hasn't done it after two carries, it's not a priority — drop it from
  the action list and flag it only in the drift report.

**No GH issues for retro actions.** Most actions are small process tweaks. A GH issue adds
tracking overhead without unblocking anything. The retro report itself is the tracking
mechanism. If an action is big enough to need a GH issue, it's a feature, not a retro action.

### 2. Limit to 3 actions max

Previous retros carried 6–7 actions. Most were not completed. Cap at 3 — forces
prioritisation and increases completion rate. Anything that doesn't make the top 3 is
either not important (drop it) or quick enough to do in-session.

### 3. Add `/drift-scan` as a built-in step in `/retro`

The natural cadence is once per retro. Make it explicit in the skill definition so it
runs automatically rather than being listed as a separate action.

### 4. Run quick-win actions during the retro itself

Actions #1 and #3 from this retro (CLAUDE.md exemption, move #18/#27) can be done right
now. The retro should end with those changes committed, not listed as future work.
