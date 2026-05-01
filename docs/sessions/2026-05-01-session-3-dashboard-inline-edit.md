# Session 3 — 2026-05-01: V11 E11.1 T1.6 Dashboard + Inline Edit + Delete

**Issue:** [#399](https://github.com/mironyx/feature-comprehension-score/issues/399) — feat: /projects/[id] dashboard + inline edit + delete (V11 E11.1 T1.6)
**PR:** [#407](https://github.com/mironyx/feature-comprehension-score/pull/407)
**Branch:** `feat/v11-e11-1-dashboard-inline-edit`
**Session ID:** `ebec16bc-cb9e-4d49-9765-e9f4af500f47`
**Pressure tier:** Standard (263 src lines added across 3 new files)

_Session recovered from crashed teammate (original session: `ebec16bc-cb9e-4d49-9765-e9f4af500f47`)._

---

## Work completed

- Created `src/app/(authenticated)/projects/[id]/page.tsx` — server component with:
  - `isAdminOrRepoAdmin` guard → redirect `/assessments` for Org Members
  - `notFound()` on missing/cross-org/deleted project
  - Parallel `Promise.all` fetching project + `github_role`
  - Conditional `<DeleteButton>` (Org Admin only), `<InlineEditHeader>`, placeholder assessments section
- Created `src/app/(authenticated)/projects/[id]/inline-edit-header.tsx` — client component:
  - Pencil affordance toggling inline edit form
  - Optimistic name/description update; rollback on failure
  - `patchProject` helper calls `PATCH /api/projects/[id]`
  - 409 inline error with 5 s `useEffect` auto-dismiss
  - try/catch/finally for network error handling (fixed post-PR-review)
- Created `src/app/(authenticated)/projects/[id]/delete-button.tsx` — client component:
  - `window.confirm` before DELETE
  - `router.push('/projects')` on 204
  - 409 "project not empty" inline error
  - try/catch/finally for network error handling (fixed post-PR-review)
- Created 3 test files (36 tests total):
  - `tests/app/(authenticated)/projects/dashboard-page.test.ts` — server component access control + rendering (9 tests)
  - `tests/app/(authenticated)/projects/inline-edit-header.test.ts` — client component state + PATCH (17 tests)
  - `tests/app/(authenticated)/projects/delete-button.test.ts` — client component confirm + DELETE flows (10 tests)
- PR #407 created and passed review after blocker fixes

## Decisions made

**Inline queries over `getProject` service call:** LLD specified calling `getProject(ctx, id)` directly. `getProject` is designed for `ApiContext` assembled from route-handler clients; composing a fake `ApiContext` in a server component would couple the page layer to the API layer. Inline queries via `createServerSupabaseClient()` used instead — consistent with all server pages in this codebase (same deviation documented for T1.5/issue #398).

**Parallel `user_organisations` query for delete button:** After `isAdminOrRepoAdmin` was adopted (from T1.5), the page still needs `github_role === 'admin'` to decide whether to show `<DeleteButton>`. `isAdminOrRepoAdmin` returns a boolean, not the role. A second minimal query runs in parallel with the project fetch. Issue #408 tracks the future refactor to return `'admin' | 'repo_admin' | null` and eliminate this second query.

**`isAdminOrRepoAdmin` imported from `membership.ts`:** User feedback mid-session — T1.5 had merged with a shared helper. Rebased onto main and refactored. This also required updating the test suite to mock `@/lib/supabase/membership` instead of inlining the role check.

**Inline error over toast:** LLD says "409 toast". No toast library installed. Implemented as `<p role="alert">` with 5 s `useEffect` auto-dismiss — same UX without a new dependency.

**Separate `delete-button.test.ts` file:** `vi.mock` in Vitest applies file-wide. Mocking `DeleteButton` for the page tests and testing `DeleteButton` itself in the same file would conflict. Separate file required.

**Test files `.ts` not `.tsx`:** Tests do not contain JSX — they assert on serialised React element trees and captured state via mocked hooks.

## Review feedback addressed

Two blockers from `/pr-review-v2`:

1. **`DeleteButton.handleDelete` — unhandled network rejection:** `fetch()` rejects on network errors; without try/catch the `setDeleting(false)` in the `finally` branch was unreachable. Button would stay permanently disabled. Fixed: wrapped in try/catch/finally with `setDeleting(false)` in `finally` and `setError('Network error. Please try again.')` in `catch`.

2. **`InlineEditHeader.handleSave` — unhandled network rejection:** `patchProject()` rejects on network errors; without try/catch the rollback `setName`/`setDescription` and `setSaving(false)` were unreachable. Fixed: same try/catch/finally pattern with rollback in `catch`.

## Next steps / follow-up

- Issue #408: refactor `isAdminOrRepoAdmin` → `getOrgRole()` returning `'admin' | 'repo_admin' | null`, eliminating the second `user_organisations` query in `page.tsx`. Standalone (not under E11.1 epic — affects E11.2–E11.4 pages too).
- E11.2: assessment-list integration in `/projects/[id]` (the CTA is currently disabled with a `// TODO E11.2` comment).

---

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-r/cache-w) |
|-------|------|---------------------------------|
| PR creation | $5.9464 | 1,025 / 91,656 / 11,390,622 / 325,710 |
| Final total | $10.0964 | 3,636 / 141,148 / 19,096,120 / 643,765 |
| Post-PR delta | **+$4.15** | +2,611 / +49,492 / +7,705,498 / +318,055 |

### Cost drivers

| Driver | Impact | Notes |
|--------|--------|-------|
| Context compaction | High | Session summary re-inflated cache-write tokens on resume |
| PR review fix cycle (2 blockers) | Medium | Each fix + re-run sent full diff twice (pr-review + test-runner agents) |
| 10 agent spawns during impl | Medium | test-author, evaluator, 2× pr-review, ci-probe, 4× test-runner, build |
| Mid-session rebase (isAdminOrRepoAdmin) | Low | Extra commit + push + test re-run after user feedback |

### Improvement actions

- **Network error handling upfront:** The two blockers were predictable — any async handler with `fetch()` needs try/catch/finally. Add a checklist item to the feature-core prompt: "All async handlers: try/catch/finally with finally-cleanup."
- **LLD should specify helper imports explicitly:** LLD says "Org Member redirect" without naming `isAdminOrRepoAdmin`. If the helper name were in the spec, the initial implementation would have used it and avoided the mid-session rebase. Add to LLD template: "Access guard: `<helper name>` from `<path>`."
- **Keep PRs under 200 lines to avoid context compaction:** 263 src lines hit the boundary. T1.6 was the right split (dashboard + inline edit + delete together), but the test complexity could have been reduced with lighter hook mocking.
