# Session Log — 2026-05-01 — Session 1 — Issue #397

**Issue:** [#397 feat: GET + PATCH + DELETE /api/projects/[id]](https://github.com/mironyx/feature-comprehension-score/issues/397)
**PR:** [#404](https://github.com/mironyx/feature-comprehension-score/pull/404)
**Branch:** `feat/v11-e11-1-api-read-edit-delete`
**Session ID:** `056b07e2-945f-4a8d-88f3-046c2d75e0b6`

---

## Work completed

Implemented the backend for Stories 1.3 (GET), 1.4 (PATCH), and 1.5 (DELETE) of V11 E11.1.

**Files created / modified:**

- `src/app/api/projects/[id]/route.ts` — controller (GET, PATCH, DELETE)
- `src/app/api/projects/[id]/service.ts` — service layer (getProject, updateProject, deleteProject, requireOrgMembership, resolveProject)
- `src/app/api/projects/validation.ts` — UpdateProjectSchema (Zod)
- `src/types/projects.ts` — ProjectResponse, CreateProjectRequest, ProjectsListResponse
- `src/lib/api/context.ts` — ApiContext extended with `orgId: string | null`
- `src/lib/supabase/types.ts` — patch_project RPC type definition
- `supabase/schemas/functions.sql` — patch_project DB function
- `supabase/migrations/20260501001435_v11_e11_1_patch_project.sql` — initial migration
- `supabase/migrations/20260501083039_v11_e11_1_patch_project_single_org.sql` — refactor to single org_id
- `tests/app/api/projects/update.test.ts` — 29 BDD tests
- `tests/app/api/projects/delete.test.ts` — 10 BDD tests
- `tests/evaluation/projects-api-crud.eval.test.ts` — 6 eval tests (I7 RPC payload, rpc result passthrough)

**Tests:** 54 passing across 4 test files. Pre-existing failures (polling-badge, generate-with-tools) confirmed unrelated by git stash.

---

## Decisions made

### Architecture: org context from cookie, not project row

The LLD specified resolveProject + assertOrgAdmin(OrRepoAdmin) as the first two steps for both PATCH and DELETE. During review the user pointed out that the `fcs-org-id` cookie already holds the currently selected org, making the project-row lookup unnecessary for the gate check.

Adopted: `requireOrgMembership(ctx, role)` reads `ctx.orgId` (from cookie, set in `createApiContext`) and does a single `user_organisations` lookup scoped to that org. The DB function `patch_project` takes `p_org_id uuid` (single scalar) rather than `p_org_ids uuid[]`, using `WHERE id = $1 AND org_id = $2` for the existence+ownership check.

Result: PATCH is 2 DB calls (membership check + RPC), DELETE is 2 DB calls (membership check + delete with `count: 'exact'`).

### Atomic context merge via Postgres function

The LLD's read-then-upsert approach for `organisation_contexts` is non-atomic. Replaced with `patch_project` Postgres function using `jsonb ||` operator — the merge is atomic at the DB level, preserves I7 (only supplied keys mutated), and eliminates 3 round-trips (read context + update projects + upsert context → single RPC).

### I3 assessment check deferred

The issue spec says DELETE should return 409 if the project has assessments. The `assessments` table has no `project_id` column in the current schema. The check was removed rather than left as dead code against a non-existent column. Invariant I3 is marked deferred in the LLD.

### No `.select()` on delete

Used `delete({ count: 'exact' })` instead of chaining `.select('id')` to detect whether any row was deleted. No row data returned, just the count.

---

## Review feedback addressed

Three blockers from `/pr-review-v2`:

1. `.select('*')` in `resolveProject` → explicit column list
2. `.select()` on delete (no args = all columns) → removed; replaced with `count: 'exact'`
3. `patch_project.Returns: Json` → narrowed to exact `{ id, org_id, name, description, created_at, updated_at }` shape, eliminating double cast

Two structural simplifications prompted by user questions (not from automated review):

4. Assessment pre-check SELECT removed (column doesn't exist yet)
5. `p_org_ids uuid[]` → `p_org_id uuid` (org from cookie context, not all-memberships array)

---

## Cost retrospective

| Stage | Cost |
|-------|------|
| At PR creation | $3.55 |
| Final total | $16.65 |
| Post-PR delta | $13.10 |

**Drivers:**

- **Context compaction (×2):** Session continued across compaction boundaries. Each restart re-summarises the full context (cache-write spike). Biggest single driver.
- **19 agent spawns:** Full pr-review-v2 (3 agents), test-author, feature-evaluator, ci-probe, multiple test-runner runs. Each re-sends the full diff to the subagent.
- **Architecture redesign mid-PR:** User prompted two significant refactors after PR creation (assessment check removal, org-array → org-cookie). Each triggered a re-run of tsc + vitest + push cycle.
- **Multi-session span:** Feature spanned two separate sessions (compaction in session 1, continuation in session 2), adding restart overhead.

**Improvement actions:**

- Keep architectural decisions locked before PR creation. The user's questions (why the array? why the SELECT?) indicate the LLD's design wasn't fully thought through — resolve these in `/architect` not post-PR.
- The `fcs-org-id` cookie pattern should be documented in the LLD for all future service functions that need org scoping, so implementers don't default to fetching-all-memberships.
- Break into smaller sub-issues when a feature involves a new DB function + new API layer + new types — the combined diff is expensive to re-review.

---

## Next steps

- #396 — POST + GET /api/projects (parallel, different files)
- #398 — /projects list + /projects/new pages (depends on #396)
- #399 — /projects/[id] dashboard + inline edit + delete (depends on #397 ✓)
