# Session 3 — PATCH /api/organisations/[id]/context

**Date:** 2026-04-01
**Issue:** #157
**PR:** #161
**Branch:** `feat/patch-org-context`

## Work completed

- Implemented `PATCH /api/organisations/{id}/context` route with upsert semantics
- Created co-located `service.ts` with `upsertContext` and `assertOrgAdmin` helpers
- Added `OrgContextRow` interface to `src/lib/supabase/org-prompt-context.ts`
- 6 tests: 401 unauth, 403 non-admin, 422 validation (x2), 200 happy path (x2)
- Updated `/architect` skill to mandate API route internal decomposition
- LLD sync: added §5 (API Write Path) to `lld-organisation-context.md`

## Decisions made

1. **Service pattern over direct helper** — Initial implementation called `requireOrgAdmin`
   and `upsertOrgContext` directly from the route. Review feedback corrected this to the
   established `createApiContext` + co-located `service.ts` pattern. The service receives
   `ApiContext` via DI and never creates its own clients.

2. **Architect skill update** — To prevent future agents from missing the controller/service
   pattern, added mandatory API route internal decomposition guidance to `/architect` SKILL.md.

3. **SupabaseClient cast** — `organisation_contexts` is not in the generated `Database` types.
   The service casts `ctx.adminSupabase` to `SupabaseClient` (untyped) for the upsert. Same
   approach as `loadOrgPromptContext`.

## Review feedback addressed

- Route refactored from direct auth/helper calls to `createApiContext` + service pattern
- Added 401 test case (originally only had 403)

## Cost retrospective

Cost data unavailable (Prometheus session tagging did not persist in worktree). Qualitative:

**Cost drivers:**
- 1 review-fix cycle (refactoring to service pattern) — the dominant post-PR cost
- Root cause: LLD had no §3 for #157, so the implementing agent had no internal decomposition
  to follow and fell back to the simpler pattern from the issue body

**Improvement actions:**
- `/architect` skill now mandates internal decomposition for API routes (applied this session)
- Future API route issues should have an LLD section before implementation begins

## Next steps

- Issue #158 (Settings UI) is the remaining item in the organisation context feature set
