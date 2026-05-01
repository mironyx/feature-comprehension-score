# Session Log — 2026-05-01 Session 8

**Issue:** #411 — feat: POST /api/projects/[pid]/assessments + per-repo gate (V11 E11.2 T2.2)
**PR:** #424
**Branch:** `feat/v11-e11-2-t2-2-fcs-create-api`

---

## Work completed

Implemented the new `POST /api/projects/[id]/assessments` endpoint as specified in LLD §B.2, replacing the legacy `POST /api/fcs` which was deleted.

**New files:**
- `src/app/api/projects/[id]/assessments/route.ts` — controller (≤ 25 lines)
- `src/app/api/projects/[id]/assessments/service.ts` — orchestration
- `src/app/api/projects/[id]/assessments/validation.ts` — Zod schema
- `src/lib/api/fcs-pipeline.ts` — rubric pipeline helpers relocated from `/api/fcs/service.ts`

**Modified files:**
- `src/lib/api/repo-admin-gate.ts` — `assertOrgAdminOrRepoAdmin` return type changed from `void` to `Promise<RepoAdminSnapshot>`
- `src/app/api/assessments/[id]/retry-rubric/service.ts` — import path update
- `src/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form.tsx` — broken relative imports fixed after PR #423 moved adjacent files

**Deleted:** `src/app/api/fcs/route.ts`, `src/app/api/fcs/service.ts`

**Tests migrated:** 13 test files updated from `@/app/api/fcs/service` to `@/lib/api/fcs-pipeline` imports. 3 test files migrated from deprecated `createFcs` to `createFcsForProject`. Tests added: 31. Total: 2034.

---

## Decisions made

1. **Pipeline location `src/lib/api/` not `src/lib/engine/`**: the rubric pipeline functions use Supabase and Octokit clients. `src/lib/engine/` is reserved for pure domain logic (no framework imports). Moving to `src/lib/api/` keeps the Clean Architecture constraint intact.

2. **`assertOrgAdminOrRepoAdmin` returns `RepoAdminSnapshot`**: the auth gate already fetches the membership snapshot internally. Returning it allows `enforcePerRepoAdmin` to accept it as a parameter rather than issuing a second identical query. Change is backward-compatible (callers that don't need the snapshot can ignore it).

3. **Auth runs before project lookup**: the LLD had `assertProjectInSelectedOrg` before `assertOrgAdminOrRepoAdmin`. Swapped to fail-fast on auth (avoids DB reads for unauthenticated/unauthorised requests).

4. **Backward-compat `createFcs` wrapper removed**: product is pre-deployment; no active callers. User requested clean removal rather than leaving compat code. Three test files migrated to `createFcsForProject`.

5. **Broken imports after PR #423**: concurrent PR moved `polling-status-badge`, `retry-button`, and `use-status-poll` to a new directory. Fixed by switching `create-assessment-form.tsx` from relative imports to absolute `@/app/(authenticated)/assessments/` paths.

---

## Review feedback addressed

PR review (Agent A + C) produced no blockers. Warnings addressed:
- Double DB snapshot fetch in `enforcePerRepoAdmin` — eliminated by passing snapshot from auth gate.
- Backward-compat wrapper `createFcs` — removed at user's explicit request.

---

## Pre-existing CI failures

16 tests failing before this PR (verified by stashing changes):
- `polling-badge-behaviour.test.ts` — React `useRouter` used outside test context (PR #423 regression)
- `generate-with-tools.test.ts` — error code mismatch (pre-existing)

These are not caused by this PR. Tracked separately.

---

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-r/cache-w) |
|-------|------|--------------------------------|
| At PR creation | $16.11 | 12,337 / 217,498 / 31,725,505 / 969,977 |
| Final (post-review) | $23.17 | 18,638 / 306,338 / 46,233,456 / 1,383,222 |
| Post-PR delta | $7.06 | — |

**Cost drivers:**

- **3 context compactions** during the session — each re-summarises the full conversation, inflating cache-write tokens significantly. Biggest single cost driver.
- **20 agent spawns** — each re-sends the full diff to a subagent. The test migration (13 files) and feature-evaluator were the largest.
- **4 vitest full-suite runs** before the first green — each run loads all 2034 tests into context.
- **Post-PR refactor round** ($7 delta) — two additional commits after PR creation: eliminate double DB fetch and remove compat wrapper. Both were legitimate quality improvements, not defects.

**Improvement actions:**
- Keep PRs under 200 lines to avoid context compaction mid-feature. This PR touched 40+ files (migration). Split file-migration work from new-endpoint work into two issues.
- The test migration (13 files, path updates) could be a `chore:` PR of its own — entirely mechanical, low risk, no context cost.
- Run `assertOrgAdminOrRepoAdmin` return-type check upfront against the LLD: if the spec says `void`, ask "does any caller need the snapshot?" before coding.

---

## Next steps

- **#413** — `/projects/[pid]/assessments/new` page + repo-admin filter (Wave 3)
- **#414** — project-scoped assessment list on `/projects/[pid]` (Wave 3)
- **#415** — My Pending Assessments cross-project FCS queue + project filter (Wave 3)
