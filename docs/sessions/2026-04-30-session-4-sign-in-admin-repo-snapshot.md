# Session Log — 2026-04-30 — Sign-in admin-repo snapshot + Repo-Admin gate

**Issue:** [#395](https://github.com/mironyx/feature-comprehension-score/issues/395)
**PR:** [#402](https://github.com/mironyx/feature-comprehension-score/pull/402)
**Branch:** `feat/v11-e11-1-snapshot-gate`
**Session ID:** `af78474c-24f6-4bc2-a079-8877e1ef01cc`

---

## Work completed

Implemented V11 E11.1 T1.2: sign-in admin-repo snapshot population and Repo-Admin gate helpers.

**New files:**
- `src/lib/github/repo-admin-list.ts` — `listAdminReposForUser` checks collaborator permission for each product-registered repo, bounded concurrency 8.
- `src/lib/api/repo-admin-gate.ts` — `readSnapshot`, `isOrgAdminOrRepoAdmin`, `assertOrgAdminOrRepoAdmin`, `assertOrgAdmin`. Pure DB reads; zero GitHub calls per request (ADR-0029 §2).

**Extended:**
- `src/lib/supabase/org-membership.ts` — `matchOrgsForUser` now fetches registered repos per org via `fetchRegisteredRepos`, calls `listAdminReposForUser`, and writes `admin_repo_github_ids` atomically with `github_role` in a single upsert (Invariant I6).

**Test files added (4 files, 33+ tests):**
- `tests/lib/supabase/org-membership-snapshot.test.ts` — 8 properties covering atomicity, cross-org isolation, empty arrays, admin vs member paths.
- `tests/lib/api/repo-admin-gate.test.ts` — 20 tests covering all gate helper combinations.
- `tests/evaluation/sign-in-snapshot-gate.eval.test.ts` — 2 adversarial gap tests (personal-account explicit field, zero fetch in gate helpers).
- Fixture: `tests/fixtures/repo-admin-gate-mocks.ts`, `tests/fixtures/org-membership-mocks.ts` extended.

---

## Decisions made

**1. Registered-repo filter (Amendment 1 — user-requested)**
LLD §B.2 originally specified querying all installation repos via `GET /installation/repositories`. User pointed out permission checks should be scoped to product-registered repos only. Changed `ListAdminReposInput` to accept `repos: RegisteredRepo[]` pre-fetched from the `repositories` DB table. This avoids over-granting access on repos not registered in the product and saves a GitHub API round trip. Documented in PR body as design deviation for lld-sync to reconcile.

**2. Personal-account install skips `fetchRegisteredRepos` (Amendment 2 — pr-review bug)**
`fetchRegisteredRepos` was being called for personal-account installs even though the short-circuit in `fetchMembershipRole` discards the result immediately. Fixed by checking `org.github_org_id === input.githubUserId` in `matchOrgsForUser` before making the DB query.

**3. MSW over `fetchImpl` injection (Amendment 3 — user-requested)**
Initial implementation used `fetchImpl?: typeof fetch` in both `ListAdminReposDeps` and `ResolveUserOrgsDeps` for test mocking. User noted CLAUDE.md prescribes MSW. Removed `fetchImpl` from both; converted all `vi.fn()` HTTP mocks to `server.use(http.get(...))` MSW handlers. Net: 113 insertions, 239 deletions across all test files.

**4. GraphQL (considered, rejected)**
User asked if GraphQL would be better for batching permission checks. Recommended keeping REST given the small registered-repo count; user accepted.

**5. `githubRole` naming**
User noted `githubRole: 'admin' | 'member'` doesn't clearly signal it's the raw GitHub org membership value (not the effective derived role). Saved as a feedback memory for future naming review. Left as-is for this issue to avoid scope creep.

---

## Review feedback addressed

`/pr-review-v2 402` was run twice:

**First pass (2 blockers):**
- `fetchRegisteredRepos` called before personal-account short-circuit — fixed.
- `fetchImpl` injection contradicts CLAUDE.md MSW convention — user escalated; fixed with MSW migration.

**Second pass:** No blockers or warnings.

---

## Cost retrospective

| Stage | Cost |
|-------|------|
| PR creation | $3.89 |
| Final total | $13.62 |
| **Post-PR delta** | **$9.73** |

**Cost drivers:**

1. **Three post-PR amendments** — Each required a fix loop (implement → test → verify → pr-review). The registered-repo filter, personal-account bug fix, and MSW migration each added a full cycle. Combined with 22 agent spawns, this was the primary driver.

2. **Context compaction** — Hit twice during the session. Each compaction added ~2–3 cache-write turns to re-establish context.

3. **MSW migration** — Rewriting all tests from `vi.fn()` to MSW was large scope (113 insertions, 239 deletions). This could have been avoided if the initial spec had required MSW from the outset. The lld-sync removes the `fetchImpl` from the LLD so future features don't repeat this.

4. **Agent count** — 22 agents spawned. pr-review ran twice (≥150-line diff → 3 agents each); feature-evaluator ran after verification; 3 test-runner agents. Acceptable given the amendment scope.

**Improvements for next time:**
- Read CLAUDE.md HTTP-mocking convention before designing any dep-injection interface. A single grep would have surfaced the MSW requirement before writing `fetchImpl`.
- When a user asks "could we use X instead?" (GraphQL question), keep the answer to ≤2 sentences; don't re-read the LLD to answer.

---

## Next steps

- Issue #396: POST + GET `/api/projects` (T1.3) — gate helpers are now ready.
- Issue #397: GET + PATCH + DELETE `/api/projects/[id]` (T1.4).
- Issues #398–399: Project pages (T1.5, T1.6).
