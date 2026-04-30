# Session Log — 2026-05-01: POST + GET /api/projects (Issue #396)

**Branch:** `feat/v11-e11-1-api-create-list`
**PR:** [#403](https://github.com/mironyx/feature-comprehension-score/pull/403)
**Epic:** E11.1 — Project Management (parent: #393)
**Session ID:** `9c847088-498e-4c90-8149-1e7edc6b8bd3`

---

## Work completed

Implemented `POST /api/projects` and `GET /api/projects?org_id=` as specified in LLD §B.3.

**Files created:**
- `src/app/api/projects/route.ts` — thin controller (≤25 lines per handler)
- `src/app/api/projects/service.ts` — `createProject`, `listProjects`, two private helpers
- `src/app/api/projects/validation.ts` — Zod `CreateProjectSchema`
- `src/types/projects.ts` — `ProjectResponse`, `CreateProjectRequest`, `ProjectsListResponse`
- `tests/app/api/projects/create.test.ts` — 15 BDD unit tests
- `tests/app/api/projects/list.test.ts` — 12 BDD unit tests
- `tests/evaluation/projects-api-create-list.eval.test.ts` — 8 adversarial tests (feature-evaluator)

**Test count:** 35 total (27 unit + 8 eval).

---

## Decisions made

### `ctx.adminSupabase` for writes, `ctx.supabase` for reads
`createProject` inserts via `ctx.adminSupabase` (service role, bypasses RLS) because the
projects table has no INSERT RLS policy — consistent with ADR-0025 pattern. `listProjects`
uses `ctx.supabase` (user JWT, RLS-enforced) with the `projects_select_member` policy as
defence-in-depth. User asked for clarification; created issue #405 to review whether a coarse
RLS write policy for org membership should be added, with the code-level gate remaining.

### 403 for non-member in `listProjects` (not 401)
`assertOrgAdminOrRepoAdmin` (from §B.2) throws `ApiError(401)` for a missing membership row.
Issue #396 AC requires "403 for non-member of queried org." A local private helper
`requireAdminOrRepoAdmin` was added that throws 403 consistently for both missing membership
and insufficient role. `createProject` still uses `assertOrgAdminOrRepoAdmin` (inheriting 401
for missing row; its AC does not specify the non-member code).

### All project types consolidated into `src/types/projects.ts`
LLD originally specified ADR-0014 inline contract types in `route.ts`. During implementation,
`ProjectResponse` was already in `src/types/projects.ts` from T1.1 schema work. Placing
`CreateProjectRequest` inline while `ProjectResponse` lived in the shared file was inconsistent.
All three types (`ProjectResponse`, `CreateProjectRequest`, `ProjectsListResponse`) were
consolidated in `src/types/projects.ts`. LLD §B.3 updated to reflect this.

### Two private helpers extracted (20-line function budget)
CLAUDE.md hard limit: any function ≤ 20 lines. `createProject` needed `upsertContextFields`
extracted; `listProjects` needed `requireAdminOrRepoAdmin` extracted. Both carry
`// Justification:` comments in source.

### `assertListAccess` renamed to `requireAdminOrRepoAdmin`
Initial name was misleading — didn't convey what was being asserted. Renamed to
`requireAdminOrRepoAdmin` per the `require*` naming convention for throwing gate helpers.

### Multi-step write without transaction (known limitation)
`createProject` does INSERT + upsert separately. If the `organisation_contexts` upsert fails
after the `projects` INSERT, the project row is orphaned. Accepted as a known limitation;
fixing requires a PostgreSQL RPC function. Not in scope for this issue.

---

## Review feedback addressed

PR review (Agent A + Agent C, dual-agent path):
- **Blocker: MSW not used for Supabase mocking** — dismissed. MSW is for HTTP-level mocking
  (GitHub API etc.); Supabase client mocking via `vi.fn()` chains is the correct approach
  for a JS-object mock. No change.
- **Blocker: `CreateProjectRequest` inline in `route.ts` absent** — ADR-0014 contract type
  initially added inline; later consolidated into `src/types/projects.ts` per user feedback.
- **`assertListAccess` naming** — renamed to `requireAdminOrRepoAdmin`.
- **`instanceof ApiError` failing in tests** — caused by `vi.resetModules()` + dynamic import
  creating a fresh `ApiError` class. Fixed by removing `vi.resetModules()` and switching to
  static imports.
- **Silent failure in listProjects** — evaluator found that destructuring `{ data: row }`
  discarded the `error` field, turning DB errors silently into 403. Fixed by destructuring
  `error: memberErr` with explicit `ApiError(500)` throw.
- **23-line `listProjects`** — exceeded 20-line budget. Fixed by extracting
  `requireAdminOrRepoAdmin` helper.

---

## LLD sync

LLD §B.3 updated (version 0.2 → 0.3):
- Inline types removed from controller spec; import from `src/types/projects.ts`.
- `listProjects` error code comment corrected: 401/403 → 403/403.
- Private helper signatures (`upsertContextFields`, `requireAdminOrRepoAdmin`) added.
- `json()` call signature corrected to positional form.

Coverage manifest: `REQ-project-management-create-project` flipped to `Revised`.

---

## Follow-up items

- **Issue #405** — review RLS write policy for `projects` table. User's suggestion: coarse
  policy scoped to org membership, fine-grained role check remains in code.
- **Multi-step transaction** — `createProject` INSERT + upsert not atomic. Could be addressed
  with a PostgreSQL RPC in a future hardening issue.

---

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-r/cache-w) |
|-------|------|---------------------------------|
| At PR creation | $3.46 | 1,037 / 46,099 / 6,500,612 / 248,898 |
| Final total | $6.89 | 2,447 / 96,532 / 13,083,749 / 453,606 |
| **Post-PR delta** | **$3.43** | — |

**Cost drivers:**
1. **Context compaction** (high) — session continued after compaction; re-summarising inflated
   cache-write tokens. The final total is nearly double the PR-creation cost.
2. **Multiple fix cycles** (medium) — `vi.resetModules()` + `instanceof ApiError` failure
   required 2 additional rounds. Root cause: `vi.resetModules()` in `beforeEach` was copied
   from a different test pattern without checking if it applied here.
3. **Type inconsistency fix** (low) — consolidating types after the review added one extra
   commit cycle; caught at review rather than during implementation.

**Improvement actions:**
- For future API tasks: place all shared entity types in `src/types/` from the start; don't
  rely on inline ADR-0014 types when a shared type file already exists for the entity.
- Avoid `vi.resetModules()` unless the test explicitly needs module-level state reset.
  Check `instanceof` works across import boundaries before committing.
- When a context compaction is imminent, break the issue into smaller sub-issues to keep
  each session under the compaction threshold.
