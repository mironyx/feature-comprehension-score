# Session Log — 2026-05-01 Session 2: /projects list + /projects/new pages

_Session recovered from crashed teammate (original session: `f73ca455-0b69-4e41-a03a-3a1c65b96c6d`)._

**Issue:** [#398 — feat: /projects list + /projects/new pages (V11 E11.1 T1.5)](https://github.com/mironyx/feature-comprehension-score/issues/398)
**PR:** [#406](https://github.com/mironyx/feature-comprehension-score/pull/406)
**Branch:** `feat/v11-e11-1-pages-list-new`

---

## Work completed

Implemented the two project pages from E11.1 T1.5:

- `src/app/(authenticated)/projects/page.tsx` — server component listing all org projects with name, description, creation date. Empty state renders a "Create project" CTA link. Org Members are redirected to `/assessments`.
- `src/app/(authenticated)/projects/new/page.tsx` — server shell with the same admin guard; renders `<CreateProjectForm />`.
- `src/app/(authenticated)/projects/new/create-form.tsx` — client component; controlled form POSTs to `/api/projects`, surfaces 409 inline as "Name already in use", redirects to `/projects/${id}` on 201 via `router.push`.
- `src/lib/supabase/membership.ts` — extended with `isAdminOrRepoAdmin(supabase, userId, orgId): Promise<boolean>` to eliminate duplicated 5-line guard blocks across both pages (added after PR review + user feedback).
- 34 tests added across two test files (`list-page.test.ts`, `new-page.test.ts`).

---

## Decisions made

**1. Inline DB query instead of `listProjects(ctx, orgId)` service**
The LLD §B.5 specified calling the `listProjects` service function directly. In practice, `listProjects` takes `ApiContext` (assembled from route-handler clients). Server-component pages use `createServerSupabaseClient()` — a structurally similar but nominally different type. Forcing the cast felt wrong; instead an inline query was used, following the same pattern already established by `assessments/page.tsx`. Documented with a `// Design deviation:` comment in `projects/page.tsx`.

**2. `getSelectedOrgId(cookieStore)` — no new helper needed**
The LLD suggested creating a `getCurrentOrgId(supabase, userId)` helper. The existing `getSelectedOrgId(cookieStore)` from `org-context.ts` already covers this. No new helper was created.

**3. Shared admin guard in `membership.ts`**
After the PR was created, the user noted that both pages had identical 5-line admin-and-repo-admin guard blocks. `isAdminOrRepoAdmin()` was added to the existing `membership.ts` module (alongside `isOrgAdmin`), reducing each page to a single `if (!await isAdminOrRepoAdmin(...)) redirect(...)` call. This is the natural home for page-level membership checks; `repo-admin-gate.ts` continues to serve route handlers via `ApiContext`.

**4. Source-text assertions for client component tests**
`@testing-library/react` is not installed in the node test environment. The test-author agent used `readFileSync` on `create-form.tsx` to assert key state-machine contracts (loading state, error handling, fetch wiring). This is an established project pattern.

**5. Test file extension `.ts` not `.tsx`**
Test files contain no JSX; `.ts` is correct.

---

## Review feedback addressed

Three items from `/pr-review-v2 406`:

| Finding | Action |
|---------|--------|
| Missing `catch` block — `handleSubmit` had `try/finally` but no `catch`; network errors from `fetch` propagated unhandled | Added `catch { setError('Something went wrong. Please try again.'); }` |
| No design deviation note for inline query | Added `// Design deviation:` comment in `projects/page.tsx` explaining ApiContext incompatibility |
| Duplicated admin guard (5 lines × 2 pages) | Extracted `isAdminOrRepoAdmin()` to `membership.ts`; both pages now a single-line guard |

---

## Next steps

- Issue #399 — `/projects/[id]` dashboard + inline edit + delete (E11.1 T1.6) — the last page in E11.1

---

## Cost retrospective

| Snapshot | Cost | Tokens |
|----------|------|--------|
| At PR creation | $3.8955 | 1,058 input / 53,983 output / 7,366,494 cache-read / 275,115 cache-write |
| Final (post-review fixes) | $6.8367 | 2,470 input / 92,675 output / 12,799,606 cache-read / 494,673 cache-write |
| **Post-PR delta** | **+$2.94** | Review fixes + refactor + lld-sync |

**Cost drivers:**

1. **Context compaction** — the session hit the context limit mid-feature-core, forcing a compact. The next wake-up paid a cache-miss re-summarisation cost. Roughly $1–2 of the post-PR delta is attributable to re-establishing context.
   _Mitigation: keep PRs smaller; this one was 217 src lines which is at the upper end._

2. **Post-PR fix cycle** — three issues found in review (missing catch, no deviation note, duplicated guard) required an additional commit + push + re-verification round.
   _Mitigation: the catch block and deviation note are LLD quality gaps — better LLD validation upfront. The guard duplication was genuinely hard to spot pre-implementation without seeing both pages side by side._

3. **lld-sync** — four correction categories needed updating; this adds a modest but expected cost on every feature with spec drift.
   _No mitigation needed: lld-sync pays for itself by keeping future features cheaper._
