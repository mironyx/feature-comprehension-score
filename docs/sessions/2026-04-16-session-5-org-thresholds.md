# Session 5 — Org Thresholds for Artefact Quality and FCS-Low

**Date:** 2026-04-16
**Issue:** #237 — feat: org thresholds for artefact-quality and FCS-low
**Epic:** #233 — Artefact Quality Scoring
**PR:** #254
**Branch:** `feat/org-thresholds-artefact-quality`

## Work completed

- Added `artefact_quality_threshold` (numeric 0-1, default 0.60) and `fcs_low_threshold`
  (integer 0-100, default 60) columns to `org_config` with CHECK constraints
- Created pure-domain Zod schema and defaults in `src/lib/engine/org-thresholds.ts`
- Implemented GET/PATCH API at `/api/organisations/[id]/thresholds` with admin-only access
- Built client-side `OrgThresholdsForm` component with percent-input UX (0-100 display,
  0-1 storage for artefact quality)
- Integrated into `/organisation` admin page
- Created server-side loader `loadOrgThresholds` in `src/lib/supabase/org-thresholds.ts`
- Updated database types in `src/lib/supabase/types.ts`

## Tests

- **Unit tests:** 17 (Zod schema) + 8 (validation) + 15 (API routes) = 40 tests
- **Integration tests:** 14 (DB defaults, CHECK constraints, persistence, RLS)
- **Evaluation tests:** 4 (adversarial error-path coverage)
- **Total new:** 58 tests
- **Suite total:** 783 tests passing

## Decisions made

- **Spec discrepancy resolved:** v2-requirements says "default 40%" on a 0-100 scale;
  issue #237 says "default 0.60" on [0,1] scale. Followed issue as authoritative contract.
  Documented in tests and PR body.
- **No LLD exists** for Epic #233 Story 11.2 — LLD sync skipped.
- **Percent-input UX:** artefact quality stored as 0-1 but displayed as 0-100% in the form
  to match user mental model. Conversion happens on submit.
- **`numeric(3,2)` coercion:** PostgREST returns numeric columns as strings; wrapped in
  `Number()` at every read boundary.
- **Admin writes via `adminSupabase`:** RLS restricts `org_config` updates to admins.
  Service layer double-checks membership then writes via the secret client to avoid
  RLS race conditions.

## Review feedback addressed

- **Silent error swallowing** in `loadOrgThresholds`: was discarding the `error` field from
  the Supabase query, silently returning defaults on DB failure. Fixed by destructuring
  `error`, logging via `console.error`, then returning defaults. Committed as separate fix.

## Issues encountered

- **PostgREST schema cache stale** after `db reset` — parallel worktree agent ran their own
  `db reset` without the new columns, overwriting the migration. Fixed by re-running
  `db reset` from this worktree.
- **Existing organisation page test broke** — `loadOrgThresholds` was not mocked. Added mock
  setup to `tests/app/(authenticated)/organisation.test.ts`.

## Cost retrospective

Prometheus was unreachable at wrap-up time — cost figures unavailable.

**Qualitative observations:**

| Driver | Observation |
|--------|-------------|
| Context compaction | Hit once — session continued from summary |
| Fix cycles | 2 rounds: integration test import paths, then PostgREST cache |
| Agent spawns | test-author (1), feature-evaluator (1), pr-review-v2 (1), ci-probe (1) |
| Parallel worktree conflict | Shared Docker Supabase instance caused schema cache invalidation |

**Improvement actions:**

- PostgREST cache after `db reset` in parallel mode: add a `docker restart supabase_rest_*`
  step to the worktree setup script
- Integration test path depth: use `@/` alias in integration tests to avoid fragile relative
  paths (blocked by vitest config — track as tech debt)

## Next steps

- Continue with Epic #233 remaining stories (scoring calibration, quality-weighted FCS)
- Consider creating LLD for Epic #233 to formalise the threshold integration points
