# Session 9 — 2026-05-01 — New Assessment Page + Repo-Admin Filter

**Issue:** #413 — feat: /projects/[pid]/assessments/new page + repo-admin filter (V11 E11.2 T2.4)
**PR:** [#426](https://github.com/mironyx/feature-comprehension-score/pull/426)
**Branch:** `feat/v11-e11-2-t2-4-new-assessment-page`
**Session:** Crash recovery — original session `c1aca9d0-535d-43cd-903d-c9d3f7ec5168`

---

## Work completed

Rewrote `/projects/[id]/assessments/new/page.tsx` to resolve project context server-side,
using `readMembershipSnapshot` + `snapshotToOrgRole` (single DB round-trip) to determine role
and populate the Repo Admin repo filter. Adapted `create-assessment-form.tsx` to accept
`projectId` instead of `orgId`, POST to `/api/projects/${projectId}/assessments`, and navigate
via `router.push` on success (removing the `CreationProgress` polling pattern entirely).
Enabled the "New assessment" CTA on the project dashboard as an active `<Link>`.

Deleted stale `tests/app/(authenticated)/assessments/new.test.ts` (tested the old page signature).
Added 17 new tests across 2 test files + 1 evaluator test.

### Files changed
- `src/app/(authenticated)/projects/[id]/assessments/new/page.tsx` — rewritten
- `src/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form.tsx` — adapted
- `src/app/(authenticated)/projects/[id]/page.tsx` — CTA enabled as `<Link>`
- `tests/app/(authenticated)/projects/[id]/assessments/new/page.test.ts` — new (9 tests)
- `tests/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form.test.ts` — new (7 tests)
- `tests/evaluation/new-assessment-page.eval.test.ts` — new (1 eval test, AC-6)
- `tests/app/(authenticated)/projects/dashboard-page.test.ts` — added `next/link` mock

---

## Decisions made

### readMembershipSnapshot instead of getOrgRole + second query
LLD §B.4 sketch called `getOrgRole` then a separate `user_organisations` query for
`admin_repo_github_ids` when `role === 'repo_admin'`. Since `readMembershipSnapshot` returns
both fields in one query, used it directly with `snapshotToOrgRole`. Saves one DB round-trip.
The LLD note said "if a third caller emerges, extend `getOrgRole`" — this is now the preferred
pattern when snapshot fields are needed.

### router.push on success instead of CreationProgress polling
LLD AC said "on success, redirects to `/projects/[pid]/assessments/[aid]`". Implemented as
immediate `router.push` rather than keeping the user on the creation URL while polling for
rubric status. Cleaner separation of concerns: the creation form creates, the detail page shows
state. Removed unused imports (`useStatusPoll`, `PollingStatusBadge`, `RetryButton`).

### Auth ordering correction (PR review blocker)
Original implementation queried the project before calling `auth.getUser()`, allowing
unauthenticated callers to probe project existence. PR review caught this; fixed by moving
auth check first. Also added `getSelectedOrgId` from cookies + `.eq('org_id', orgId)` on
the project query for explicit cross-org isolation (matching the project dashboard pattern).

### MSW relative-URL workaround
Node's `fetch` rejects relative URLs before MSW can intercept them. Wrapped `global.fetch`
in `beforeAll` to prepend `http://localhost` to relative paths, matching the absolute-URL
MSW handlers. Pattern documented in the test file header comment.

### React mock strategy for client component testing
Mocked `useState` to return `[initial, noop]` and `useCallback` as a pass-through, then used
`JSON.stringify(CreateAssessmentForm({...}))` for render assertions (instead of
`renderToStaticMarkup` which fails on plain-object component stubs).

---

## Review feedback addressed

- **Auth check after project query** (block) — fixed: auth moved before project query
- **No org_id scoping on project query** (block) — fixed: added `getSelectedOrgId` + `.eq('org_id', orgId)`
- **`snapshot!` non-null assertion** (warn) — fixed: replaced with `snapshot &&` guard
- **Missing justification comment** (warn) — fixed: added `// Justification:` comment for `readMembershipSnapshot` usage
- **Co-Authored-By trailer in commit 2** (block) — not fixed; requires force-push on feature branch. Needs user approval.
- **Eval test duplicates makeClient factory** (warn) — deferred; would require extracting shared fixtures

---

## Next steps

- Wave 3 continues: #414 (project-scoped assessment list) and #415 (pending queue rewrite) are parallelisable
- Deferred: fix Co-Authored-By trailer in commit 2 (requires `git commit --amend` + force-push, needs user approval)
- Detail page (`/projects/[pid]/assessments/[aid]`) should show rubric generation status for assessments navigated to immediately after creation — tracked as follow-up

---

## Cost retrospective

**PR-creation cost:** $5.13 (26 min to PR)
**Final cost:** $10.47 (+$5.34 post-PR)
**Delta drivers:**

| Driver | Impact | Notes |
|--------|--------|-------|
| Context compaction | High | Session crossed context limit mid-review; recovery session added ~$5 in cache-write overhead |
| PR review fix cycle | Medium | Two PR review blocker fixes added 2 commits post-PR |
| 3 parallel review agents | Medium | Adaptive pr-review-v2 launched A+C+B for 1,339-line diff |

**Improvement actions:**
- PR review blockers (auth ordering, org scoping) were both LLD gaps — the original sketch had neither. Validate page-layer auth patterns against the dashboard page before writing tests to catch these earlier.
- Context compaction hit because the implementation session ran long (17 new tests + form adaptation). For ≥ 15 test scenarios consider breaking into two issues (page guard + form adaptation separately).
