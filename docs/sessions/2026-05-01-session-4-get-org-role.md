# Session Log — 2026-05-01 — Session 4 — Issue #408

**Issue:** [#408 — chore: refactor isAdminOrRepoAdmin to return role instead of boolean](https://github.com/mironyx/feature-comprehension-score/issues/408)
**PR:** [#416 — chore: add getOrgRole returning role discriminant, drop redundant query](https://github.com/mironyx/feature-comprehension-score/pull/416)
**Branch:** `feat/refactor-get-org-role`
**Session ID:** `e3d66f08-0e87-42c3-8790-76d3012797bc`

---

## Work completed

- Added `getOrgRole(supabase, userId, orgId): Promise<OrgRole | null>` to `src/lib/supabase/membership.ts`, returning `'admin' | 'repo_admin' | null`.
- Exported `OrgRole = 'admin' | 'repo_admin'` discriminated type for use by E11.2–E11.4 pages.
- Rewrote `isAdminOrRepoAdmin` as a one-liner wrapper (`return (await getOrgRole(...)) !== null`) so existing callers in `projects/page.tsx` and `projects/new/page.tsx` are unchanged.
- Updated `src/app/(authenticated)/projects/[id]/page.tsx` to call `getOrgRole` directly, eliminating the second `user_organisations` query that was previously needed to derive `isAdmin`. `isAdmin` is now `role === 'admin'`.
- Added 4 unit tests for `getOrgRole` in `tests/lib/supabase/membership.test.ts` covering all four return paths.
- Updated `tests/app/(authenticated)/projects/dashboard-page.test.ts` to mock `getOrgRole` instead of `isAdminOrRepoAdmin`; simplified `makeClient` factory (no longer needs a `user_organisations` branch).

## Decisions made

**Wrapper kept, not deleted:** `isAdminOrRepoAdmin` still has two active callers (`projects/page.tsx`, `projects/new/page.tsx`) that only need a boolean guard, not the role value. Keeping the wrapper avoids unnecessary churn on working code.

**Light pressure path:** ~30 src lines across 2 files — no test-author sub-agent. Tests written inline in the Light pressure style.

**No MSW required:** `getOrgRole` tests mock the Supabase client directly (not HTTP); MSW is correct for HTTP boundaries, but Supabase is mocked at the client level here.

## Review feedback addressed

No blockers found. One warning noted: LLD §B.6 was stale (described old two-query pattern); reconciled via lld-sync (this session).

## LLD sync

Updated `docs/design/lld-v11-e11-1-project-management.md` §B.6:
- Implementation note updated to describe `getOrgRole` replacing the old `isAdminOrRepoAdmin` + parallel-query pattern.
- Tasks item 3 updated: `github_role === 'admin'` → `getOrgRole returns 'admin'`.
- Version bumped 0.5 → 0.6.

Coverage manifest `coverage-v11-e11-1.yaml`: added `src/lib/supabase/membership.ts` to the B.6 entry `files` list; status remains `Revised`.

## CI notes

CI reported two failing tests, both pre-existing on `main` and unrelated to this PR:
- `tests/app/(authenticated)/assessments/polling-badge-behaviour.test.ts` — useContext null error (pre-existing).
- `tests/lib/engine/llm/generate-with-tools.test.ts` — `validation_failed` vs expected `malformed_response` (pre-existing).

## Next steps

- E11.2–E11.4 pages that need role-aware rendering can now call `getOrgRole` directly (no second query required).

---

## Cost retrospective

| Stage | Cost | Tokens |
|-------|------|--------|
| PR creation | $1.03 | 865 in / 14,737 out / 2,042,069 cache-read |
| Final total | $1.68 | 924 in / 24,797 out / 2,890,116 cache-read |
| Post-PR delta | $0.65 | Review + lld-sync + feature-end |

**Cost drivers:**

- **Feature-end overhead ($0.65 delta):** Review, lld-sync, and feature-end cleanup contributed the post-PR cost. Normal for a standard task cycle.
- **Light pressure worked well:** Skipping the test-author sub-agent (appropriate for <30 src lines) kept the implementation cost low ($1.03 to PR).
- **Pre-existing CI failures:** Unrelated test failures added one ci-probe round-trip but no fix cost.

**Improvement notes:**

- None identified. The refactor was well-scoped, the wrapper approach avoided unnecessary caller churn, and the lld-sync was straightforward.
