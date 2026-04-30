# Session 3 — 2026-04-30: V11 E11.1 T1.1 Schema Implementation

**Issue:** [#394](https://github.com/mironyx/feature-comprehension-score/issues/394) — feat: schema for projects, org_contexts FK, admin-repo snapshot column (V11 E11.1 T1.1)
**PR:** [#400](https://github.com/mironyx/feature-comprehension-score/pull/400)
**Branch:** `feat/v11-e11-1-schema`
**Session ID:** `5ba20675-9d67-4eb0-9d7e-3ec0fe31a9d5`
**Pressure tier:** Standard (30 src lines added in types.ts; new schema + migration files)

---

## Work completed

Implemented the schema foundation for V11 E11.1 (Project Management), covering all three changes from issue #394:

1. **New `projects` table** — `uuid` PK, `org_id` FK with `ON DELETE CASCADE`, `name` 1–200 chars, `description`, timestamps. Case-insensitive unique index `uq_projects_org_lower_name ON projects (org_id, lower(name))`.

2. **FK on `organisation_contexts.project_id`** — backfilled the FK `project_id → projects(id) ON DELETE CASCADE` per ADR-0028. The column already existed (nullable, Phase 2), so `db diff` generated a `not valid` + `validate constraint` pattern for safe migration.

3. **`user_organisations.admin_repo_github_ids bigint[] NOT NULL DEFAULT '{}'`** — sign-in snapshot column for the Repo-Admin gate per ADR-0029.

4. **RLS** — `ALTER TABLE projects ENABLE ROW LEVEL SECURITY` + `projects_select_member` SELECT policy scoped to `get_user_org_ids()`. Writes flow via service role per ADR-0025.

5. **Migration** — generated via `npx supabase db diff -f v11_e11_1_projects`. `db reset` clean; `db diff` empty after reset.

6. **`src/lib/supabase/types.ts`** — manually patched (added `projects` Row/Insert/Update block; added `admin_repo_github_ids: number[]` to `user_organisations` Row/Insert/Update). Auto-generation via `supabase gen types typescript` was NOT used — it strips literal union types.

7. **Integration tests** — 6 BDD specs in `tests/helpers/v11-e11-1-projects-schema.integration.test.ts`, covering all issue acceptance criteria:
   - Unique index rejects duplicate `lower(name)` within same org
   - Same name allowed across different orgs
   - Org delete cascades to projects
   - Project delete cascades to `organisation_contexts`
   - `admin_repo_github_ids` defaults to empty array
   - `admin_repo_github_ids` accepts bigint[] update via service role

---

## Decisions made

**Manual types.ts maintenance.** The LLD acceptance criteria originally said "type regen only". During implementation, running `supabase gen types typescript --local` replaced every text-column literal union (e.g. `'prcc' | 'fcs'`, `'active' | 'inactive'`) with plain `string`, causing 5 TypeScript errors in existing consumers. Fix: restored `types.ts` from `git show HEAD:src/lib/supabase/types.ts` and added only the new entries. The LLD §B.1 has been corrected to reflect this.

**PR review fix — orgId2 cleanup leak.** The cross-org projects test originally used a local `let orgId2` inside the `it` block. If an assertion failed before cleanup, the test org would leak. Fix: promoted to describe-level `let orgId2: string` with `afterEach` cleanup, matching the pattern used in `orgId`.

---

## Review feedback addressed

`/pr-review-v2 400` found one warning:

- `[bug] tests/helpers/v11-e11-1-projects-schema.integration.test.ts` — `orgId2` local variable in cross-org test could leak on assertion failure. **Fixed** — promoted to describe scope with `afterEach` cleanup.

No blockers. No design-contract mismatches. No deferred items.

---

## LLD sync (Step 1.5)

Updated `docs/design/lld-v11-e11-1-project-management.md` §B.1:
- Added `src/lib/supabase/types.ts` and test file to the Files list.
- Added implementation note explaining why `types.ts` must be manually maintained.
- Corrected acceptance criterion from "type regen only" to manual patching.

---

## Cost retrospective

| Metric | Value |
|--------|-------|
| Cost at PR creation | $2.22 |
| Final cost | $4.79 |
| Post-PR overhead | +$2.57 (+116%) |
| Time to PR | 11 min |

**Cost drivers:**

1. **Context compaction** — the implementation session ran long enough to hit context limits and trigger compaction. This is the dominant driver of the post-PR cost delta. The compacted context then had to re-summarise ~138 turns, inflating cache-write tokens.

2. **Type regen misstep** — one tool call ran `supabase gen types typescript --local`, which clobbered the types file and required restoring from git + manual re-application. This was caught and corrected before commit but consumed extra tokens.

3. **PR review fix cycle** — the `orgId2` cleanup leak fix required an extra commit and push. Small but avoidable if the test had been written with describe-scope cleanup from the start.

**Improvement actions:**
- Always check `types.ts` is manually maintained before running any type-regen command. Add a note in `CLAUDE.md` or LLD B.1 (done above).
- Write integration tests with describe-level cleanup variables by default, not inside individual `it` blocks.
- For schema-only tasks, use Light pressure tier to skip the test-author agent; tests fit inline.

---

## Next steps

- **#395** — T1.2: Sign-in admin-repo snapshot + Repo-Admin gate helper
- **#396** — T1.3: POST + GET /api/projects
- **#397** — T1.4: GET + PATCH + DELETE /api/projects/[id]
- **#398** — T1.5: /projects list + /projects/new pages
- **#399** — T1.6: /projects/[id] dashboard + inline edit + delete
