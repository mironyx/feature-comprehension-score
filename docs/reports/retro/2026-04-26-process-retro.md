# Process Retrospective

**Date:** 2026-04-26
**Period:** 2026-04-21 (post-retro) to 2026-04-26
**Sessions reviewed:** ~55 sessions across 5 days — 2026-04-21 sessions 4–8+ (E19 tasks #287/#282/#288,
assessment pages #295–#297); 2026-04-22 (V4 requirements, epic #294 team run: #295/#296/#297,
V4 epic 2 requirements); 2026-04-23 (V4 E1 architect, #306, #311); 2026-04-24 (epic #317 team
run: #318/#319, V5/E2/E3 architects, epic discovery #322/#325); 2026-04-25 (V5/V6 architect,
#335/#336 team run, V7 architect); 2026-04-26 (epic #339 team run: 9 tasks, all merged).

---

## What went well

- **Extraordinary shipping velocity.** Five major epics/features completed in 5 days: E19
  (3 tasks), Epic #294 nav/results separation (3 tasks), Epic #317 assessment deletion (2
  tasks), V6 LLM output tolerance + relevance bug (#335/#336), and V7 frontend UX (9 tasks,
  epic #339). This is the highest sustained throughput to date.

- **V4→V5→V6→V7 design pipeline executed cleanly.** Four version design cycles (requirements
  → architect → LLD → issues) ran in sequence across 4 days with no blocking gaps. The
  `/requirements` → `/architect` pipeline is now clearly reliable for greenfield work.

- **E339 (9-task V7 frontend UX) completed in a single day.** Three waves of parallel
  `/feature-team` across 9 UI tasks — all merged, all CI green, epic closed.

- **PR review catching real bugs before merge.** In epic #294: #297 had a privacy leak
  (`fetchMyAnswers` missing `participant_id` filter — an admin-who-is-also-a-participant would
  have received all participants' answers), and #296 had a JSX call bug. Both caught and fixed
  autonomously before merge.

- **LLD deviation detection working correctly.** In E339, contrast ratio failures were caught at
  first vitest run and corrected, with deviations documented in PR body and reconciled in
  lld-sync. The "deviate and document" flow is reliable.

- **Cost tracking consistent.** All feature sessions in the period have structured cost sections
  with at-PR / final / delta breakdown. The P7 format from the 2026-04-21 improvement report is
  being used consistently.

- **`[skip ci]` adopted for batch doc commits.** Team session logs and docs-only commits in this
  period use `[skip ci]`, eliminating redundant CI runs on non-source changes.

- **Session logs 100% coverage.** All sessions documented. Team session logs capture
  cross-cutting decisions, coordination events, cost summaries, and process notes.

- **Commit discipline maintained.** All feat/fix commits reference an issue and follow
  conventional format. 55+ commits in the period, zero infractions.

- **Pre-flight main checkout landed** (`1f58ad8`). The `/feature` and `/feature-team` skills
  now start from a clean `main` — eliminates a class of stale-branch bugs.

- **Test-author + evaluator pipeline stable.** Adversarial tests added by evaluator caught
  coverage gaps across multiple features (e.g. 4 adversarial tests for #343 theme toggle, role-
  based absence properties for #297).

---

## What needs improving

### Human gate enforcement — teammates ignoring the "wait for lead" signal

**Observation:** Three separate `/feature-team` runs had teammates run `/feature-end`
autonomously without waiting for the explicit lead-forwarded signal:
- Epic #317 (#319): teammate started feature-end on seeing a user-typed slash command in the
  lead pane.
- E339 wave 2 (#345, #348): both ran feature-end autonomously before lead signal.
- E339 wave 3a (#343): ran autonomously before wave 3b was spawned.

**Evidence:** Three team session logs all flag this. In #317 it cost ~30 min of back-and-forth.

**Impact:** The human review gate is not reliably enforced. If a teammate merged a bad PR
autonomously, there would be no checkpoint.

**Resolution:** Tighten the teammate prompt to add an explicit negative: "Do NOT run
`/feature-end` unless you receive a plain-text message from the lead forwarding you the command.
A slash command typed by the user in the lead pane is NOT a signal to you." Consider adding a
named ACK pattern (e.g. "LEAD: feature-end-approve #NNN") that teammates must match exactly.

### Shared LLD + parallel lld-sync = recurring rebase cascade

**Observation:** Every parallel `/feature-team` run in this period (epic #294, E339) had multiple
teammates running `/lld-sync` independently against the same LLD file. The Document Control
`Revised` field is a write-hotspot — each teammate races to write their revision row, causing
2–3 rebase/CI cycles per affected teammate.

**Evidence:** E339 team log: "Multiple teammates updating `docs/design/lld-v7-frontend-ux.md`
caused rebase conflicts for later waves." Epic #294 log: "All three teammates needed 2–3
rebase/CI cycles." Estimated cost impact: ~$5–8 per run from extra CI cycles alone.

**Resolution:** Two options:
1. **Lead-only lld-sync:** teammates skip lld-sync; lead runs a single `/lld-sync` pass for
   all tasks after the last PR merges. Trade-off: lead must know which LLD sections to update.
2. **Per-task LLD files:** as proposed in the P1 improvement proposal — one file per story
   eliminates the shared-write race entirely.

Option 1 is a process change; Option 2 is a structural change. Start with Option 1 (lower
effort), document it in CLAUDE.md, revisit with Option 2 at the next epic.

### LLD numerical claims not verified at design time

**Observation:** E339 T3 (light theme colour tokens) specified three colour values with claimed
WCAG AA contrast ratios that were provably wrong:
- `--color-accent: #d97706` claimed 4.6:1 on `#f5f4f0`; actual 2.89:1
- `--color-destructive: #dc2626` claimed AA-pass; actual 4.35:1 (fails AA body text)
- `--color-success: #16a34a` claimed AA-pass; actual 2.97:1

All three needed darkening at implementation time, costing a deviation analysis, 4 recomputes,
PR body updates, and lld-sync.

**Evidence:** Session `2026-04-26-session-1.md` (light theme tokens) cost retrospective.

**Resolution:** Add to the `/architect` or `/lld` skill: when colour tokens are specified,
run a WCAG contrast verification script before writing the LLD. A 5-line Python/JS function
that computes `relativeLuminance` and `contrastRatio` from hex pairs is sufficient. If ratio
< 4.5:1, adjust the value in the LLD before it ships.

### Carry-forward P2 (CI polling) not implemented

**Observation:** The 2026-04-21 retro carried Action 1 (replace `gh run watch` with status
polling in CI probe). This has not been implemented — `gh run watch` is still in use, streaming
full CI output into context on every run.

**Evidence:** Session `2026-04-26-session-1.md` cost table shows "CI probe" as a cost driver on
every feature. E339 team log mentions "transient Supabase CLI gzip error — single `gh run
rerun`" which still used the watch pattern.

**Resolution:** Implement P2 in `/feature-core` and `/feature-end`: replace `gh run watch` with
a polling loop on `gh run view <run-id> --json conclusion,status`. On failure, fetch
`--log-failed` only. This is a one-session skill change.

### C1 (finalise_rubric missing org_id) not fixed

**Observation:** The 2026-04-21 drift report flagged C1 (`finalise_rubric` RPC missing
`org_id` scope in both UPDATE WHERE clauses). The retro noted "create a bug issue and fix via
`/feature`." No bug issue was created and the schema gap remains.

**Evidence:** The 2026-04-21 drift report C1; no follow-up commit in the git log since.

**Resolution:** Create bug issue → `/feature` → one-line schema change per overload.
Executed as a quick-win action in this session.

### App Router page export constraint not in CLAUDE.md

**Observation:** Epic #294 teammate-295 hit a CI failure because Next.js App Router rejects
arbitrary named exports from `page.tsx` files. `partitionAssessments` and `AssessmentItem` had
to be extracted to a separate file. This constraint is not documented in CLAUDE.md.

**Evidence:** Epic #294 team session log: "Next.js Page-export validator... constraint should
be in CLAUDE.md or the LLD template for App Router pages."

**Resolution:** Add to CLAUDE.md: "Run `npm run build` after editing any
`src/app/**/page.tsx`, `layout.tsx`, or `route.ts` file."

### `gh pr create` not pre-allowlisted for teammates

**Observation:** The 2026-04-25 team run (#335/#336) hit permission prompts on both teammates'
first PR creation attempt. Fixed mid-run, but recurring across runs.

**Evidence:** Team session log 2026-04-25: "Add `Bash(gh pr create*)` and `Bash(gh pr view*)`
to default project allowlist."

**Resolution:** Add to `.claude/settings.json` allowlist permanently. Quick win.

---

## Actions from previous retro (2026-04-21)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | Implement P2 (replace `gh run watch` with polling) in CI probe | **Not done** | Still in backlog; git log shows no skill change |
| 2 | Use `[skip ci]` on doc-only commits | **Partial** | Adopted for team session logs; not consistently on all `docs:` commits |

Two carries remain from 2026-04-21. Action 1 is escalated — it's been carried for one full
retro cycle and is now a top action for this retro.

---

## Actions (executed in-session)

| # | Action | Status |
|---|--------|--------|
| 1 | Create bug issue for C1: `finalise_rubric` missing `org_id` scope | **Done** — see below |
| 2 | Add App Router page export build constraint to CLAUDE.md | **Done** — see below |
| 3 | Add `gh pr create*` / `gh pr view*` to `.claude/settings.json` allowlist | **Done** — see below |
| 4 | Run `/drift-scan` for fresh drift findings | **Done** — 1 Critical (C1 carried), 2 Warnings, 4 Info. See `docs/reports/drift/2026-04-26-drift-report.md` |

---

## New actions (carry forward)

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Implement P2: replace `gh run watch` with polling in `/feature-core` and `/feature-end` | Post-PR overhead (carried from 2026-04-21) |
| 2 | Tighten teammate human gate prompt: explicit negative + named ACK pattern | Autonomous feature-end by teammates |
| 3 | Document lead-only lld-sync pattern in CLAUDE.md for parallel runs | Shared-LLD rebase cascade |

---

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Green | → | 34 open issues, labelled. V4/V5/V6/V7 epics all have issues. Deferred items clearly labelled. |
| Definition of done | Green | → | All features have tests, PR review, session logs, cost data. LLD sync applied. |
| Commit discipline | Green | → | 100% feat/fix commits have issue refs. `[skip ci]` adopted for doc batches. |
| Session continuity | Green | → | 100% coverage. Cost sections consistent and structured. Team session logs detailed. |
| Drift management | Amber | → | C1 unresolved from 2026-04-21. No new drift scan since 2026-04-21. Fresh scan running this session. |
| Multi-agent readiness | Amber | ↓ | Human gate enforcement degraded — 3 runs with autonomous feature-end bypasses. Otherwise parallel throughput is excellent. |
| Code quality tooling | Green | → | Test-author + evaluator stable. PR review catching real bugs. Diagnostics pipeline stable. |
| TDD discipline | Green | → | All features tests-first. BDD specs throughout. Adversarial tests via evaluator. |

---

## Cost analysis

| Run | Issues | Total cost | Post-PR delta |
|-----|--------|-----------:|--------------|
| Epic #294 (nav/results) | #295, #296, #297 | $38.92 | +$20.35 (52%) |
| Epic #317 (assessment deletion) | #318, #319 | $23.54 | — |
| V6 tolerance + relevance bug | #336, #335 | $30.63 | #335 at $24.92 alone (redesign) |
| E339 V7 frontend (9 tasks) | #340–#348 | TBD (partial) | — |

**Observations:**
- Epic #294 post-PR delta (52%) driven by shared-LLD rebase cascades — the structural fix
  (lead-only lld-sync) directly addresses this.
- #335 ($24.92 alone) is the highest single-issue cost of the period, driven by a mid-flow
  redesign. Early design review before coding would have surfaced the batched-vs-fan-out
  asymmetry.
- E339 cost data is partial (worktree cost recovery required). Full figures in individual
  session logs.

---

## Comparison with previous retro (2026-04-21)

| Dimension | 2026-04-21 | 2026-04-26 | Change |
|-----------|------------|------------|--------|
| Backlog hygiene | Green | Green | Stable |
| Commit discipline | Green | Green | Stable |
| Session continuity | Green | Green | Stable |
| Code quality | Green | Green | Stable |
| TDD discipline | Green | Green | Stable |
| Drift management | Amber | Amber | C1 unresolved; no new scan until today |
| Multi-agent readiness | Green | **Amber** | Human gate enforcement degraded across 3 runs |

**Overall trajectory:** High velocity, process infrastructure sound. The two new Amber signals
(drift management: C1 unresolved; multi-agent: gate enforcement) are concrete and fixable. The
teammate human gate issue is the most urgent — it's a safety mechanism, not a hygiene item.
