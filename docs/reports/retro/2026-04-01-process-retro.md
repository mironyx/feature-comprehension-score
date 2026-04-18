# Process Retrospective

**Date:** 2026-04-01
**Period:** 2026-03-28 (after last retro) to 2026-04-01 (today)
**Sessions reviewed:** 2026-03-28-session-1, 2026-03-29-session-1 through session-4,
2026-03-30-session-1-planning, 2026-03-30-session-2-harness, 2026-03-30-session-3,
2026-03-30-session-3-feature-team, 2026-03-31-session-1 through session-3 (multiple sub-sessions),
2026-04-01-session-1 through session-4 (multiple sub-sessions) — 22 session logs total

---

## What went well

- **Highest-velocity period ever: ~19 issues in 4 days.** Delivered: #116 (webhook continued),
  #118 (transactions), #119 (personal account sync), #121 (create assessment UI), #122 (smoke
  test blockers), #130 (rubric status badge), #131 (success feedback), #132 (admin retry),
  #133 (link_participant fix), #134 (world-to-program prompt), #135 (Pino logging), #136 (LLM
  logging), #137 (smoke test checklist), #138 (E2E Playwright), #139 (question depth), #140
  (org context), #142 (/feature-team skill), #157 (PATCH org context), #162 (frontend deps).
  Full MVP Phase 2 demo-ready feature set is complete.

- **Pipeline harness matured significantly.** `/architect` skill built and tested; `/feature-core`
  extracted; `/feature-team` parallel agent skill created and tested with real tmux-based
  multi-agent runs; shared anti-pattern checklist extracted; deprecated skills cleaned up;
  worktree rules formalised in CLAUDE.md with conditional sequential/parallel modes.

- **First successful parallel agent run.** `/feature-team 133 140` ran two teammates
  simultaneously. Teammate-133 implemented and merged independently. Identified concrete
  process gaps (spawn pattern, session tagging, feature-end delegation) — all documented
  with fixes.

- **Pre-existing CI blockers finally resolved.** `GITHUB_WEBHOOK_SECRET` placeholder added to
  CI env (#133 session), markdownlint errors fixed across multiple docs, Next.js PageProps
  constraint fixed. CI is now reliably green on `main`.

- **Session logs 100%.** Sixth consecutive period at 100%. Parallel agent sessions produce
  separate logs per teammate. Session naming convention now includes issue numbers for clarity.

- **Cost retrospectives in most sessions.** Enables data-driven process improvement. Post-PR
  cost ratios improved for small features (e.g. #134: $0.00 post-PR delta, #119: $2.73 total,
  #162: $2.95 total).

- **All commits conventional with issue references.** 51 commits in this period, all following
  the convention. No noise commits.

- **LLD sync running consistently.** Every feature session runs `/lld-sync` and documents
  deviations.

---

## What needs improving

### Done-but-Open issues: eighth consecutive retro

**Observation:** #18, #27, #35, #36, #37 remain open on GitHub. All five have
`deferred-post-mvp` labels.

**Root cause update:** These are genuinely deferred work items, not "done but forgot to close."
The correct action is not `gh issue close` — it is to confirm their board status matches their
label (should be in a "Backlog" or "Blocked" column, not "Done"). The action has been
mis-specified in every retro since 2026-03-09 because the distinction between "done" and
"deferred" was never clarified.

**Resolution:** Reclassify this action. These issues should remain open with `deferred-post-mvp`
labels. Verify they are NOT in the "Done" column on the project board. Remove this item from
future retro tracking — it is not a process failure but a labelling question.

### No drift scan since 2026-03-28 (third consecutive period)

**Observation:** 19 issues delivered since the last drift scan. Major new subsystems include:
transaction functions, Pino logging, LLM logging, organisation context (read + write paths),
admin retry, E2E test infrastructure, and frontend bootstrap. The 2026-03-28 drift report had
4 Critical and 9 Warning items.

**Impact:** C1 (stale Anthropic mock), C2 (stale LLD references), C3 (invalid enum in test
fixture) — all from the last scan — are likely still unfixed. New code may have introduced
additional drift, particularly around the organisation context feature which added a new table,
RLS policies, and API routes not present in any prior scan.

**Resolution:** Run `/drift-scan` immediately after this retro.

### Worktree rule still violated despite CLAUDE.md + memory

**Observation:** Three sessions violated the no-worktrees rule:
- 2026-03-29-session-2 (#119): worktree created, required user correction and restart
- 2026-03-29-session-4 (#122): worktree created, vitest hung for 6 minutes (no node_modules)
- 2026-04-01-session-3-137 (#137): worktree used, cost data unavailable

Each violation added $0.50-$1.00 in avoidable overhead from npm install, env file copying,
and restart cycles.

**Root cause:** The worktree code was already removed from `/feature` in session
2026-03-30-session-2-harness. The violations are agents not following the CLAUDE.md rule
despite it being explicit. This is a model compliance issue, not a skill code issue.

**Resolution:** No skill change needed. The rule is already in CLAUDE.md and memory. Monitor
whether violations continue; if so, consider adding a pre-step assertion in `/feature` that
checks `git worktree list` and aborts if more than the main worktree exists.

### /feature-end for parallel teammates skips mandatory steps

**Observation:** In session 2026-03-31-session-3:
- teammate-139 skipped `/lld-sync` (Step 1.5) and session log (Step 2)
- teammate-132 overwrote the existing combined session log with a thin replacement

**Impact:** LLD sync and cost retrospective data lost for two features.

**Root cause:** Teammates treat `/feature-end` as merge+cleanup, not as a documentation step.
They have limited context about the broader session and the lead's expectations.

**Resolution:** The `/feature-team` skill already mandates these steps in the teammate spawn
instructions (SKILL.md lines 127-128). The issue is teammate compliance. Add a lead
verification gate: after each teammate reports feature-end complete, the lead checks that
the session log and LLD sync output exist before marking the feature done.

### Cost tracking broken in worktree/parallel mode

**Observation:** Four sessions report "cost data unavailable":
- 2026-03-31-session-1-success-feedback (#131): shared lead session tag
- 2026-04-01-session-3-137 (#137): worktree mode
- 2026-04-01-session-3-patch-org-context (#157): worktree mode
- 2026-04-01-session-2 (process session): no implementation

**Impact:** Cannot calculate accurate per-feature cost metrics for parallel runs. The
Prometheus/OTel pipeline works in sequential mode but breaks in parallel mode.

**Root cause:** Two separate issues: (1) The Prometheus textfile path for WSL was fixed via
`FCS_FEATURE_PROM_DIR` env var (already implemented in `tag-session.py` and set in WSL to
`/mnt/c/projects/feature-comprehension-score/monitoring/textfile_collector`). (2) JSONL session
detection in parallel mode uses content-based search (implemented 2026-03-30) but has not been
validated end-to-end with real parallel runs writing to Prometheus.

**Resolution:** Validate the full pipeline in the next parallel run: does `tag-session.py` with
`FCS_FEATURE_PROM_DIR` + content-based JSONL search produce correct per-teammate cost metrics
in Prometheus? If not, identify which link in the chain is broken.

### Post-PR cost still variable (but improving)

**Observation:**

| Issue | At PR | Final | Ratio | Primary driver |
|-------|-------|-------|-------|----------------|
| #118 transactions | $9.19 | $13.45 | 1.5× | Context compaction + mock fixes |
| #121 create UI | $2.60 | $5.72 | 2.2× | Context compaction + 3 review agents |
| #133 link_participant | $1.10 | $5.92 | 5.4× | Pre-existing CI fix cycles (dominant) |
| #140 org context | $5.23 | $8.73 | 1.7× | Context compaction + user Q&A |
| #134 prompt fix | ~$0 | ~$0 | 1.0× | Clean single-file change |
| #136 LLM logging | — | $5.87 | — | Normal |
| #162 frontend deps | $1.51 | $2.95 | 2.0× | CI markdownlint fix cycle |

Best cases (#134, #119, #162) show post-PR ratios approaching 1.0×–2.0×. Worst case (#133)
was driven entirely by pre-existing CI failures, now fixed. The pipeline improvements are
working — features with clean LLD specs and green CI have low post-PR overhead.

### Vitest test isolation bug still untracked

**Observation:** Action 4 from the last retro (create GitHub issue for vitest mock-caching bug)
was not done. The bug (`installation-handlers.test.ts` + `github.test.ts` fail when run
together) was noted in session 2026-03-28-session-1 but no issue exists.

---

## Actions from previous retro (2026-03-28)

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | `gh issue close 18 27 35 36 37` | Reclassified | These are genuinely deferred (`deferred-post-mvp` label), not done. Should remain open. Verify board status is not "Done". |
| 2 | Add automated Done-but-Open close to `/feature-end` | Not needed | Reclassified per Action 1. |
| 3 | Run `/drift-scan` | Not done | Third consecutive period without a scan. **Urgent.** |
| 4 | Create GitHub issue for vitest test isolation bug | Not done | Still untracked. |
| 5 | Update `/feature`: `gh run watch` inline | Partial | `/feature` skill was heavily reworked (feature-core extraction, worktree removal). CI monitoring approach changed but inline `gh run watch` not confirmed. |
| 6 | Add #118 to board as mvp-blocking | **Done** | #118 was implemented, merged (PR #141), and closed. |
| 7 | Create issues for W1/W5 drift findings | Not done | Third consecutive retro carrying this action. |

---

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | Run `/drift-scan` — **immediately after this retro** | No scan since 2026-03-28; 19 issues delivered |
| 2 | ~~Remove worktree from `/feature`~~ — **already done** (2026-03-30-session-2-harness removed all worktree code from `/feature`). Violations this period were agent non-compliance with CLAUDE.md, not skill code. No action needed. | Resolved |
| 3 | Create GitHub issue for vitest test isolation bug (installation-handlers + github tests fail together) — **do it now** | Carried from last retro; still untracked |
| 4 | Validate full parallel cost pipeline end-to-end: `FCS_FEATURE_PROM_DIR` (implemented, set in WSL) + content-based JSONL search (implemented 2026-03-30) → do per-teammate Prometheus metrics appear correctly in the next real parallel run? | Cost tracking unvalidated in parallel mode |
| 5 | `/feature-team` already mandates lld-sync + session log in teammate spawn instructions (SKILL.md lines 127-128). Failure is teammate compliance. Add a **lead verification gate**: lead checks each teammate's session log and LLD sync output before marking feature-end complete. | Teammate `/feature-end` skips mandatory steps |
| 6 | Verify #18, #27, #35, #36, #37 are NOT in "Done" on the project board; confirm board status matches `deferred-post-mvp` label | End the eight-retro tracking cycle |
| 7 | Create issues for W1 (HLD stale `user_github_tokens` DDL) and W5 (email service ADR) — carried from 2026-03-24 | Untracked drift findings (third carry) |

---

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Amber | → | 25 open issues, 4 unlabelled (#163-#166 frontend bootstrap). `deferred-post-mvp` labelling is clean. Priority ordering maintained. |
| Definition of done | Green | → | LLD sync every session; diagnostics checked; cost retrospective in most sessions. Parallel teammates occasionally skip steps — lead compensation needed. |
| Commit discipline | Green | → | 51 commits, all conventional with issue refs. No noise commits. |
| Session continuity | Green | → | 100% session logs, sixth consecutive period. Parallel sessions produce separate logs. Naming convention improved (issue numbers in filenames). |
| Drift management | Red | → | Third consecutive period without a scan. 19 issues delivered since last scan. 4 Critical items from 2026-03-28 likely still open. |
| Multi-agent readiness | Amber | ↑ | First successful parallel run. Concrete process gaps identified and documented: spawn pattern, session tagging, feature-end delegation. Infrastructure partially ready; needs env var fix and lead-driven documentation. |
| Code quality tooling | Green | → | Complexity budget gate, design-conformance agent, diagnostics pipeline — all stable and consistently used. |
| TDD discipline | Green | → | All features implemented tests-first. BDD specs throughout. Test count grew from ~344 to ~407+. |

---

## Comparison with previous retro (2026-03-28)

| Metric | Previous (2026-03-28) | Now (2026-04-01) | Target | Status |
|--------|-----------------------|------------------|--------|--------|
| Session logs in real time | ~12/12 | ~22/22 | All in-session | Met |
| Drift scan run | Not run | Not run | Every period | **Not met (3rd consecutive)** |
| Done-but-Open issues | 4–5 | 5 (reclassified as deferred) | Correctly categorised | Reclassified |
| Retro actions followed through | 1/7 | 1/7 | All | → Same |
| PR size | All within target | All within target (except #118: 1224 lines) | Under 200 lines | Mostly met |
| Post-PR cost ratio | 2.6–8.5× | 1.0–5.4× (median ~2.0×) | ≤ 1.5× | Improving |
| Issues without GitHub issues | 0 | 1 (vitest isolation) | 0 | Not met |
| Parallel agent capability | Not available | First successful run | Working | New capability |

---

## Overall assessment

This is the most productive period in the project's history. The full MVP Phase 2 feature set
was delivered in 4 days across 22 sessions. The pipeline harness matured significantly with
`/architect`, `/feature-core`, and `/feature-team` skills. The first successful parallel agent
run validated the multi-agent architecture, while also surfacing concrete process gaps that
now have documented fixes.

The **chronic failure** is drift scanning — three consecutive periods without a scan, despite
being listed as an action in every retro. This is now urgent: 19 issues delivered since the
last scan, including new subsystems (transactions, logging, org context, E2E infrastructure)
that have no drift coverage.

The **retro action completion rate** (1/7) is concerning. Most incomplete actions are low-effort
tasks (create an issue, run a scan) that are repeatedly deferred in favour of feature work.
This suggests the retro output is treated as informational rather than binding. Consider
creating GitHub issues for each retro action so they appear on the project board and compete
for priority alongside feature work.

**Top 3 actions:**

1. **Now (15 min):** Run `/drift-scan` — 19 issues delivered since last scan. Critical items
   accumulating.
2. **Done:** Created issue #170 for vitest test isolation bug — carried from two retros.
3. **Before next parallel run:** Validate cost tracking in parallel mode (is content-based
   JSONL search sufficient?). Add lead verification gate for teammate session logs and LLD sync.
