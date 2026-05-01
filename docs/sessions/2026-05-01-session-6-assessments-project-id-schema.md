# Session 6 — 2026-05-01 — assessments.project_id schema (FCS-410)

_Session recovered from crashed teammate (original session: `3e4ad7bd-dc2a-4fb0-ba31-f966849adc76`)._

## Issue

#410 — feat: schema for assessments.project_id + FCS CHECK (V11 E11.2 T2.1)

## PR

<https://github.com/mironyx/feature-comprehension-score/pull/419>

## Work completed

- Added `project_id uuid REFERENCES projects(id) ON DELETE SET NULL` to `assessments`
- Added CHECK constraint `assessments_fcs_requires_project` (type <> 'fcs' OR project_id IS NOT NULL)
- Added index `idx_assessments_project ON assessments (project_id)`
- Patched `src/lib/supabase/types.ts` manually for Row/Insert/Update blocks (issue #394 pattern — no auto-regeneration)
- Updated `supabase/seed.sql`: added a project row and wired the FCS assessment seed row to it
- Added `p_project_id uuid DEFAULT NULL` to the `create_fcs_assessment` RPC (forward-compatible — partial T2.2 change, necessary to avoid breaking existing callers with the new CHECK)
- Generated two migrations: `20260501131118_v11_e11_2_assessments_project.sql` and `20260501132649_v11_e11_2_create_fcs_rpc_project_id.sql`
- Wrote 4 integration tests in `tests/helpers/v11-e11-2-assessments-project.integration.test.ts`
- Fixed 22 regressions in 3 existing integration test files caused by the new CHECK constraint

## Decisions made

**ON DELETE SET NULL vs CHECK constraint tension:** The CHECK requires FCS rows to have non-null `project_id`, but ON DELETE SET NULL would null it if the project is deleted. Resolution: the SET NULL behaviour is tested via a PRCC row (which can be null), not an FCS row. Story 1.5 (project deletion guard) prevents this at the application layer for FCS rows. Comment added to the test explaining the invariant.

**`p_project_id` added to RPC in T2.1:** The new CHECK broke existing integration tests that called `create_fcs_assessment` without a project. Adding `p_project_id uuid DEFAULT NULL` was the minimal fix — it is also the exact interface that T2.2 needs, making this a clean forward step rather than scope creep.

**Test type selection for regression fixes:** Changed test helpers that use `type: 'fcs'` incidentally (observability columns, hints, scoring) to `type: 'prcc'` rather than adding project setup boilerplate. The tested behaviour is type-agnostic; the change is minimal and correct.

**lld-sync skipped:** Only 3 src lines changed (`types.ts` type patch). No architectural change warrants an LLD update.

## Review feedback addressed

PR review found one warning: `prcc!.id` non-null assertion in the new integration test. Fixed by adding `expect(prcc).not.toBeNull()` before the dereference.

## CI

Integration tests and lint/typecheck passed. Unit test failures in `polling-badge-behaviour.test.ts` and `generate-with-tools.test.ts` are pre-existing on `main` (last 3 main CI runs also fail unit tests) — confirmed unrelated to #410 changes.

## Cost retrospective

| Stage | Cost |
|-------|------|
| At PR creation | $2.09 |
| Final total | $5.25 |
| Post-PR delta | $3.16 |

**Drivers:**

1. **Context compaction (high)** — Session summary triggered mid-session. Re-summarising inflates cache-write tokens. Delta accounts for the recovery session (`--cont`) re-establishing context.

2. **CI regression fix cycle (medium)** — The new CHECK constraint broke 22 existing integration tests across 3 files. Two additional commits were needed after the initial push. Better upfront analysis of all `create_fcs_assessment` callers would have caught this before the first push. Lesson: when adding a NOT NULL constraint on an existing type, grep all test files for `type: 'fcs'` inserts first.

3. **4 agent spawns (medium)** — Full verification suite + CI probe + 2 PR review agents each re-sent the full diff. The PR was under 100 lines; the review ran in 2-agent mode but could have been single-agent.

**Improvement actions:**

- When adding a CHECK constraint that tightens NULL rules on an existing column, grep test files for all callers that create rows of that type before running the first migration reset.
- Keep issues under 150 lines of total diff to stay in single-agent PR review mode.
