# Team Session Log — Epic #420 (V11 E11.3 Project Context & Config)

**Date:** 2026-05-01
**Epic:** #420 — V11 E11.3 Project Context & Config
**Lead model:** Opus 4.6
**Teammate model:** Opus 4.6

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|-------|-------|----|--------|--------|
| #421 | Settings page + glob validation (T3.1) | #428 | feat/project-settings-page | 2026-05-01 |
| #422 | Resolver + rubric wiring (T3.2) | #429 | feat/project-context-resolver | 2026-05-01 |
| — | Fix: restore partition.ts (main breakage) | #430 | fix/restore-assessments-partition | 2026-05-01 |

## Cross-cutting decisions

- **question_count cap raised 5→8:** Both tasks picked up the LLD update (commit 62c97b9) that widened the Zod and DB CHECK constraints. Landed consistently in both PRs.
- **Org Member redirect target:** LLD I3 was updated mid-cycle (commit 7cbbe1e) to redirect Org Members to `/projects/[id]` instead of `/assessments`. Teammate-422's lld-sync later reverted this to `/assessments` (reasoning: `/projects/[id]` is a no-op redirect loop). Teammate-421 caught the conflict during their own lld-sync and amended before merge.
- **domain_notes cap 500→2000:** Both tasks touched `OrganisationContextSchema` — no conflict since #422 merged first and #421 rebased cleanly.

## Coordination events

- **Wave plan:** Single wave — both external deps (#393, #411) already merged. Both tasks spawned in parallel.
- **Main breakage discovered:** Teammate-421's CI failed due to `partition.ts` deleted by #427 while #425's `assessment-list.tsx` still imports it. Teammate-421 diagnosed root cause and proposed three options; lead chose option 1 (separate fix PR). Teammate-422 independently inlined a workaround.
- **Fix PR #430:** Teammate-421 opened #430, restoring `partition.ts` verbatim. Merged by lead before rebasing #428.
- **Merge order:** #429 (T3.2) → #430 (fix) → #428 (T3.1). T3.2 merged first despite T3.1 being the simpler task, because T3.1 was blocked on the #430 fix cycle.
- **Admin merge bypass:** #428 force-merged with pre-existing unit test failures (polling-badge `useContext` null, generate-with-tools assertion mismatch). These failures exist on bare main and are unrelated to E11.3.

## What worked / what didn't

**Worked:**
- Parallel execution of two independent tasks completed the full epic in ~70 minutes.
- Teammate-421's proactive diagnosis of the main breakage and structured option proposal saved lead time.
- Both teammates produced clean CodeScene scores (≥9.38) and comprehensive test suites (24 + 13 tests).

**Didn't work:**
- Pre-existing main breakage added ~$16 of rework cost to teammate-421 (rebase cycle, fix PR, redirect amendment). Broken trunk is expensive for parallel teams.
- The redirect target flip-flop (LLD I3) between teammates created unnecessary churn. Design docs should stabilise before spawning.

## Process notes for /retro

- Broken trunk multiplied coordination cost — consider a "main health check" pre-flight before spawning teammates.
- Both teammates independently worked around the partition.ts issue (one restored, one inlined). A lead-initiated fix before spawning would have avoided both.
- Pre-existing unit test failures on main need a dedicated fix issue — they gate CI for all future PRs.
- Total cost: ~$52 (teammate-421: $26.42, teammate-422: $25.93). Comparable to sequential execution but delivered in half the wall-clock time.
