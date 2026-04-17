# Session 5 — Artefact Quality Persistence Schema (#235)

**Date:** 2026-04-16
**Issue:** #235 — feat: artefact quality persistence schema + finalise_rubric_v2 RPC
**PR:** #252
**Epic:** #233 (E11: Artefact Quality Scoring)
**LLD:** docs/design/lld-v2-e11-artefact-quality.md §11.1b

## Work completed

1. Added three columns to `assessments` table in `supabase/schemas/tables.sql`:
   - `artefact_quality_score integer` (CHECK 0–100, nullable)
   - `artefact_quality_status text` (NOT NULL DEFAULT 'pending', CHECK IN pending/success/unavailable)
   - `artefact_quality_dimensions jsonb` (nullable)
2. Added deprecation comment on legacy `artefact_quality` text column.
3. Added `finalise_rubric_v2` RPC to `supabase/schemas/functions.sql` — persists quality results alongside questions atomically.
4. Generated migration `20260416220208_artefact_quality_score.sql` via `npx supabase db diff`.
5. Updated `src/lib/supabase/types.ts` with new columns and RPC signature (hand-edited to match project convention).
6. 15 integration tests written by test-author sub-agent covering success, unavailable, and CHECK violation paths.
7. 3 evaluator boundary tests (score=0, score=100, invalid status).
8. LLD §11.1b synced — fixed "replace" → "add" wording, ticked acceptance criteria.

## Decisions made

- **Hand-edited types.ts** rather than using raw `supabase gen types` output — project convention is hand-maintained types with compact formatting and a custom header.
- **Eval tests renamed to `.integration.test.ts` suffix** — CI splits unit vs integration by file suffix; eval tests that need Supabase must use the integration suffix.

## Review feedback

PR review (2 agents) returned no findings.

## CI

Initial run failed — 3 eval tests ran in the unit test job (no Supabase). Fixed by renaming to `.eval.integration.test.ts`. Second run: all green.

## Verification

- 743 tests pass (88 files), 18 new
- `npx tsc --noEmit` clean
- `npm run lint` clean
- `npx supabase db diff` — no drift

## Cost retrospective

Prometheus unavailable — no cost data captured for this session. The feature was straightforward (schema + RPC, no application logic). Two commits: one feature, one CI fix.

**Cost drivers:**
- Test-author sub-agent + evaluator sub-agent + 2 review agents = 4 agent spawns. Appropriate for the feature size.
- One extra commit cycle for the eval test rename (CI suffix mismatch). Avoidable if eval tests always use `.integration.test.ts` by convention.

**Improvement actions:**
- Establish convention: eval tests that need DB always use `.eval.integration.test.ts` suffix.

## Next steps

- §11.1c (#236) — Pipeline integration: switch callers to `finalise_rubric_v2`, remove legacy RPC.
