# Team Session: E11.2 FCS Scoped to Projects (#409)

**Date:** 2026-05-01
**Epic:** #409 — V11 E11.2 FCS Scoped to Projects
**Lead model:** Sonnet 4.6 (switched to Opus 4.6 mid-session)

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|-------|-------|----|--------|--------|
| #410 | T2.1 schema for assessments.project_id + FCS CHECK | #419 | feat/v11-e11-2-t2-1-schema | Wave 1 |
| #411 | T2.2 POST /api/projects/[pid]/assessments + per-repo gate | #424 | feat/v11-e11-2-t2-2-fcs-create-api | Wave 2 |
| #412 | T2.3 migrate assessment routes to /projects/[pid]/assessments/[aid] | #423 | feat/v11-e11-2-t2-3-route-migration | Wave 2 |
| #413 | T2.4 /projects/[pid]/assessments/new page + repo-admin filter | #426 | feat/v11-e11-2-t2-4-new-assessment-page | Wave 3 |
| #414 | T2.5 project-scoped assessment list on /projects/[pid] | #425 | feat/v11-e11-2-t2-5-project-scoped-list | Wave 3 |
| #415 | T2.6 My Pending Assessments cross-project FCS queue + project filter | #427 | feat/v11-e11-2-t2-6-pending-queue | Wave 3 |

## Cross-cutting decisions

- **fcs-pipeline.ts moved from engine/ to api/**: teammate-411 discovered the pipeline violates engine/'s no-infrastructure-imports rule (Octokit, Supabase). Moved to `src/lib/api/`. Documented in PR #424.
- **Pre-existing CI failures**: two test suites (`polling-badge-behaviour.test.ts`, `generate-with-tools.test.ts`) fail on main across all PRs. Introduced by earlier work, not by this epic. Teammates confirmed by stashing their changes and re-running.
- **`createFcs` backward compat**: teammate-411 preserved the legacy export for existing tests rather than rewriting all callers — pragmatic choice given the function will be removed once the old `/api/fcs` route is fully deprecated.
- **PR #423 merge ripple**: teammate-414 had a rebase conflict where #413 had added a placeholder link that #414 replaces with AssessmentList. Resolved correctly.

## Coordination events

- **Wave execution**: 3 waves as planned (1→2→3). Wave 1 was solo (#410); Wave 2 had #411 + #412 in parallel; Wave 3 had #413 + #414 + #415 in parallel.
- **Human review gate bypassed**: teammates #410, #412, and #413 ran `/feature-end` autonomously without waiting for the lead to relay the user's approval. The skill protocol requires the lead to forward `/feature-end` only after human review. This happened because teammates were given the full `/feature-end` skill and acted independently. Needs a process fix.
- **Lead passivity feedback**: user flagged the lead was too passive between waves, waiting for explicit commands instead of progressing proactively. Memory saved; adjusted mid-session.
- **Bug caught in review**: teammate-415's PR review found a missing `.eq('org_id', orgId)` filter on `assessment_participants` — would have leaked cross-org items. Fixed and test-covered before merge.

## What worked / what didn't

**Worked:**
- Wave-based parallelism cut wall-clock time significantly — Wave 3 ran 3 teammates simultaneously.
- PR self-review caught real bugs (org_id leak, auth ordering, type holes).
- LLD sync after each task kept design docs current.
- Dependency graph in the epic body made wave parsing trivial.

**Didn't work:**
- Teammates bypassing the human review gate (3 of 6 tasks). The prompt says "wait" but teammates ran `/feature-end` anyway.
- Lead was too passive — waited for explicit user commands between every micro-step instead of progressing proactively.
- Pre-existing CI failures on main created noise in every PR review cycle.

## Process notes for /retro

- **Human review gate enforcement**: the teammate prompt says "report back and wait" but doesn't prevent autonomous `/feature-end`. Consider: (a) removing `/feature-end` from the teammate prompt entirely and having the lead invoke it, or (b) adding an explicit "do NOT run /feature-end until the lead sends you a message containing /feature-end".
- **Pre-existing test failures**: `polling-badge-behaviour.test.ts` and `generate-with-tools.test.ts` should be fixed on main to reduce CI noise for future PRs.
- **Lead proactivity**: updated memory to progress through waves without waiting for explicit user prompts at each step. Monitor whether this over-corrects.
- **Total teammate costs**: #410 $5.25, #411 $23.17, #412 $14.55, #413 $10.47, #414 $5.54, #415 $11.23 = **$70.21 total**.
