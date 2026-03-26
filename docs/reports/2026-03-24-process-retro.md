# Process Retrospective

**Date:** 2026-03-24
**Period:** 2026-03-21 (after retro) to 2026-03-24
**Sessions reviewed:** 2026-03-21-session-2, 2026-03-23-session-1, 2026-03-23-session-2,
2026-03-24-session-1, 2026-03-24-session-2, 2026-03-24-session-3, 2026-03-24-session-4,
2026-03-24-session-5

## What went well

- **Exceptional velocity.** Eight issues delivered in three days: #82 (OAuth smoke test fixes),
  #81 (Supabase key rename), #54 (org membership sync), #55 (org selection UI), #56 (API
  utilities), #57 (GET /api/assessments list), #58 (GET /api/assessments/[id] detail), plus
  exploratory test #80. Phase 2 API routes are now taking shape.
- **OAuth smoke test caught real bugs.** Running #80 against live credentials exposed three
  defects: implicit vs PKCE flow, dynamic env var access at compile time, and OAuth scopes not
  propagated from client code. All fixed in #82 before the implementation reached downstream
  consumers.
- **ADR-0014 created proactively.** The user identified that API routes were not self-contained
  — no reader could understand a route without opening the design doc. ADR-0014 now requires
  inline JSDoc + contract type interfaces on every `route.ts`. All subsequent routes (#92, #93,
  #94) implement this pattern. Design thinking embedded in the workflow.
- **Integration tests enabled in CI.** The integration job was scaffolded but commented out since
  Phase 0.5. Issue #57 session activated it, with credentials exported from `supabase start`
  and `build` depending on both unit and integration checks.
- **Cost tracking script fixed and extracted.** The `/feature` Step 8 cost script was
  over-counting (reading all session IDs, not filtered by `feature_id`). Extracted to
  `scripts/query-feature-cost.py`, shared between `/feature` and `/feature-end`, and the bug
  was fixed. Cost labels are now applied to both the PR and the issue.
- **Design complexity caught and handled.** The `GET /api/assessments/[id]` endpoint grew to
  ~350 lines with cc > 20. The root cause — mixing metadata retrieval with post-submission
  answer processing — was identified and the endpoint was split by responsibility. Issue #95
  created for the descoped `my_scores` concern. The right outcome, reached efficiently.
- **All eight sessions have logs.** Fourth consecutive retro period with 100% in-session log
  completion.
- **12 commits; all conventional with issue references.** No noise commits, no Co-Authored-By
  trailers. Merge conflict resolution commit (`d0cd34e`) is the only one without an issue
  reference — appropriate for a chore.

## What needs improving

### Done-but-Open issues — sixth consecutive retro

**Observation:** Issues #18, #23, #25, #27, #35, #36 remain open on GitHub and Done on the
project board. The count is unchanged from the last five retros.

**Impact:** The open issue list (21 items) includes ~29% false positives. Sprint planning and
priority decisions are made against a corrupted backlog.

**Root cause:** Action 1 of every retro since 2026-03-09 has been `gh issue close 18 23 25 27
35 36`. It has not been executed once. The action is deferred because feature work takes priority
and there is no enforcement gate.

**This must be the last time it appears here.** Concrete resolution: run `gh issue close 18 23
25 27 35 36` right now, then add a check to `/feature-end` that closes any Done-but-Open issues
automatically.

### Work without issues

**Observation:** PR #81 (Supabase key rename) was submitted with no linked issue. The session
log notes this explicitly: "No linked issue — user-initiated chore (CLAUDE.md requires issues;
noted as a process gap)."

**Impact:** CLAUDE.md states "No work without an issue." When a chore touches 20+ files and
multiple CI/CD paths, the absence of an issue removes traceability and breaks the project board.

**Proposed resolution:** When the user initiates ad-hoc work, create the issue first (even
retroactively), link it, and close it with the merge. This takes 30 seconds and preserves the
audit trail.

### Post-PR rework cost ratio

**Observation:** Both #93 and #94 show a ~3× cost multiplier between PR creation and final
close:

| Issue | At PR creation | Final | Ratio |
|-------|---------------|-------|-------|
| #57 (assessments list) | $2.87 | $8.50 | 3.0× |
| #58 (assessment detail) | $2.88 | $7.78 | 2.7× |
| #56 (API utilities) | $1.02 | $4.56 | 4.5× |

The post-PR work includes: design pivots, CodeScene resolution, LLD sync, regression tests,
CI integration. Some of this is unavoidable. But the `my_scores` pivot ($4.90 delta on #58)
suggests the LLD did not specify the complexity boundary clearly enough before implementation.

**Proposed improvement:** Before implementing an endpoint, confirm the expected handler LoC and
cc bounds are explicit in the LLD. If the spec bundles unrelated concerns (metadata + FCS
self-view), call it out before writing code.

### Drift scan not run this period

**Observation:** The last drift report is from 2026-03-20. This period delivered four new API
routes, enabled CI integration tests, and made significant LLD changes (§2.3 v0.5→0.7, §2.4
v0.7→1.0). No drift scan was run.

**Impact:** Design↔code drift accumulates silently. The 2026-03-20 scan found two critical ADR
contradictions; similar issues could be present now.

**Proposed resolution:** Run a drift scan now (end of retro session). Add it explicitly to the
retro checklist as a pre-condition for writing the report.

### Actions from previous retro (2026-03-21) — 3/5 not started

| # | Action | Status | Notes |
|---|--------|--------|-------|
| 1 | `gh issue close 18 23 25 27 35 36` | Not started | **Sixth consecutive retro.** |
| 2 | Create issues for W1 (linked-issue dedup) and W5 (email ADR) | Not started | No evidence in session logs. |
| 3 | Verify/close W6 (OAuth scope Story 5.1 vs ADR-0003) | Done | Fixed in #82: `user:email read:user` added to `signInWithOAuth` in `SignInButton.tsx`. |
| 4 | Commit/discard uncommitted `.claude/settings.json` OTEL changes | Partial | Session 2026-03-24-session-2 restored 6 auto-approve entries. OTEL-specific changes from the orphaned branch (#84) are untracked — status unclear. |
| 5 | Add `gh issue close Done-but-Open` step to `/feature-end` | Not started | No skill change in this period. |

## New actions

| # | Action | Addresses |
|---|--------|-----------|
| 1 | `gh issue close 18 23 25 27 35 36` — six-retro streak ends now | Done-but-Open issues |
| 2 | Add automated Done-but-Open close step to `/feature-end` | Prevent seventh retro |
| 3 | Create issues for W1 (linked-issue dedup uses title not number) and W5 (email service ADR) | Untracked 2026-03-20 drift findings |
| 4 | Run `/drift-scan` — period had four new routes and major LLD changes | Drift scan gap |
| 5 | Before implementing any new endpoint: confirm expected LoC/cc bounds are in the LLD spec | Post-PR rework cost ratio |
| 6 | Clarify `.claude/settings.json` OTEL state — commit or document as intentionally uncommitted | Uncommitted work fragility |

## Process health scorecard

| Dimension | Rating | Trend | Notes |
|-----------|--------|-------|-------|
| Backlog hygiene | Red | → | Six Done issues still open. Sixth consecutive retro. Count unchanged. |
| Definition of done | Amber | → | LLD sync consistent; post-PR rework high; chore without issue (#81). |
| Commit discipline | Green | → | 12 commits; all conventional with issue refs. One merge conflict commit is exception-appropriate. |
| Session continuity | Green | → | All 8 sessions logged in-session. Fourth consecutive period at 100%. |
| Drift management | Amber | ↓ | No drift scan run this period despite 4 new routes and major LLD changes. Last scan: 2026-03-20. |
| Multi-agent readiness | Green | → | ci-probe operational; cost tracking shared; issues single-scoped. |
| Code quality tooling | Green | → | CodeScene warnings resolved in every PR. ADR-0014 added API contract discipline. Integration tests now in CI. |
| TDD discipline | Green | → | All eight issues implemented tests-first; BDD specs in every test file. |

## Comparison with previous retro (2026-03-21)

| Metric | Previous (2026-03-21) | Now (2026-03-24) | Target | Status |
|--------|----------------------|------------------|--------|--------|
| Session logs in real time | 6/6 | 8/8 | All in-session | Met |
| Drift scan run | Run (2026-03-20) | Not run | Every period | **Not met** |
| Critical drift fixed same period | 2/2 | N/A (no scan) | All | N/A |
| Done issues still open | 6 | 6 | 0 | Not met (6th retro) |
| Retro actions followed through | 3/5 | 1/5 | All | **Regression** |
| PR size | All within target | All within target | Under 200 lines | Met |
| Issues without GitHub issues | 0 | 1 (PR #81) | 0 | **Not met** |

## Overall assessment

This is the highest-velocity period in the project: eight issues completed in three days,
including the full org membership + UI flow and the first three API endpoints. Code quality
discipline (CodeScene, TDD, LLD sync) is consistent and embedded. The ADR-0014 addition shows
the team thinking about maintainability proactively.

The two process failures are well-understood and chronic. The Done-but-Open issue has appeared
in six consecutive retros without action — it will not resolve without automation. The post-PR
rework cost ratio is a design completeness signal: when the LLD does not bound complexity before
implementation, the work spills into post-PR fixes.

**Top 3 actions:**

1. **Now (2 minutes):** `gh issue close 18 23 25 27 35 36` — end the six-retro streak. Do it
   before the next feature session.
2. **Today:** Run `/drift-scan` — the period had four new routes and major LLD changes. Running
   it now will catch any new critical findings before Phase 2 API implementation continues.
3. **Before next endpoint implementation:** Add LoC/cc expectation to the LLD spec task entry
   (e.g. "handler expected: < 80 lines, cc < 10"). This turns the post-PR design pivot into a
   pre-implementation checkpoint.
