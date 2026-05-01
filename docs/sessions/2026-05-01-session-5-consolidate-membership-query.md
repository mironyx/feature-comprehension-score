# Session 5 — Consolidate membership query (#417)

**Date:** 2026-05-01
**Issue:** [#417 refactor: consolidate auth/membership query — single source between repo-admin-gate and membership](https://github.com/mironyx/feature-comprehension-score/issues/417)
**PR:** [#418 refactor: consolidate auth/membership query — single shared core](https://github.com/mironyx/feature-comprehension-score/pull/418)
**Branch:** `feat/consolidate-membership-query`

---

## Work completed

Both `repo-admin-gate.ts` and `membership.ts` previously ran the same `user_organisations` query inline and applied the same `github_role === 'admin' || admin_repo_github_ids.length > 0` rule. This created a drift hazard: a future role-logic change (e.g. a third condition) would need to be applied in two places.

**Changes made:**

1. **`src/lib/supabase/membership.ts`** — two new exports:
   - `readMembershipSnapshot(supabase, userId, orgId)` — the single shared query; normalises DB row to `{ githubRole, adminRepoGithubIds }`; throws `Error` on DB failure.
   - `snapshotToOrgRole(snap)` — pure function encoding the admin-or-repo-admin rule. The only place this rule lives.
   - `getOrgRole` refactored to delegate to both (`readMembershipSnapshot` then `snapshotToOrgRole`).

2. **`src/lib/api/repo-admin-gate.ts`** — all functions now delegate to the shared core:
   - `readSnapshot` → calls `readMembershipSnapshot`, wraps DB errors as `ApiError(500)`.
   - `isOrgAdminOrRepoAdmin` → delegates to `isAdminOrRepoAdmin` (page helper) with try/catch wrapping.
   - `assertOrgAdminOrRepoAdmin` → uses `readSnapshot` for the 401/403 distinction, calls `snapshotToOrgRole` for the role check (no inline rule).
   - `assertOrgAdmin` → unchanged (checks `githubRole !== 'admin'`, a distinct non-composite check).

3. **`docs/design/kernel.md`** — updated:
   - `readMembershipSnapshot` added to the page-side membership table as the shared core.
   - Anti-pattern entry consolidated (two redundant entries merged into one).

4. **`tests/lib/supabase/membership.test.ts`** — 7 regression tests added:
   - 4 for `readMembershipSnapshot` (null row, camelCase normalisation, null column default, DB error)
   - 3 for `snapshotToOrgRole` (admin, repo_admin, null)

No caller migration needed. Public surfaces of both files unchanged.

## Decisions made

- **Shared core in `membership.ts`, not a new file.** `membership.ts` already takes `SupabaseClient` with no framework dependency — right home for the shared query. `repo-admin-gate.ts` becomes a thin `ApiContext` wrapper.
- **`snapshotToOrgRole` extracted as a pure function.** This ensures the `admin || non-empty adminRepoGithubIds` rule lives exactly once. Both `getOrgRole` (page) and the assert functions (API) use it.
- **`MembershipSnapshot.githubRole: 'admin' | 'member'`** (not `string`). The cast belongs at the DB boundary inside `readMembershipSnapshot`, not in wrapper code. This eliminated the `as 'admin' | 'member'` cast in `readSnapshot`.
- **`assertOrgAdminOrRepoAdmin` still uses `readSnapshot`** to distinguish 401 (no membership row) from 403 (row exists but role insufficient). `getOrgRole → null` collapses both; the snapshot approach is necessary for the error-code distinction.
- **lld-sync skipped** — no dedicated LLD for this issue; design was inline in the issue body. `kernel.md` was updated directly as part of the implementation.

## Review feedback addressed

- Replaced `(e as Error).message` in catch block with `e instanceof Error ? e.message : String(e)` guard.
- Reviewer flagged inline queries in other service files as blockers — these are pre-existing and explicitly out of scope per issue ("Out of scope: Caller migration"). Noted in PR comment.

## Next steps / follow-up

- The other service files (`src/app/api/*/service.ts`) still have inline `user_organisations` queries. These are now gated by the new kernel.md anti-pattern entry but were explicitly out of scope for this issue. A future cleanup issue could migrate them.

---

## Cost retrospective

| Stage | Cost | Tokens (in / out / cache-read / cache-write) |
|---|---|---|
| At PR creation | $1.08 | 868 / 18,294 / 1,845,476 / 80,200 |
| Final total | $3.58 | 962 / 57,548 / 6,196,216 / 254,426 |
| **Post-PR delta** | **$2.50** | — |

**Cost drivers:**

- **Post-PR iteration (major driver — $2.50 post-PR):** Three additional commits after PR creation to address: (a) rule duplication in gate functions (user spotted that `isOrgAdminOrRepoAdmin` still inlined the rule); (b) redundant anti-pattern entries in `kernel.md`; (c) type narrowing for `MembershipSnapshot.githubRole`. Each round re-read context and spawned pr-review/test agents.
- **pr-review agent:** Flagged pre-existing inline queries in other service files as blockers — required investigation to confirm they were pre-existing and out of scope, adding a round-trip.
- **Design under-specification:** The issue described the goal but didn't specify that the role-derivation rule also needed consolidation (only the query). This led to an incomplete first pass that required follow-up commits.

**Improvement actions:**
- For refactoring issues, explicitly list every duplicated pattern (query AND rule) in the acceptance criteria so the first pass is complete.
- When the rule and the query are both duplicated, address both in the initial implementation — don't stop at query consolidation.
