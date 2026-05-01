# Session Log — 2026-05-01 — Route Migration (Issue #412)

Session ID: `0ac6eb78-ef6d-44c1-99b7-57585d435e29`

## Work completed

Implemented issue #412 — **E11.2 T2.3: Migrate assessment detail routes to project-first URL shape**.

**PR:** [#423](https://github.com/mironyx/feature-comprehension-score/pull/423)

### What was built

- Moved `assessments/[id]/`, `assessments/[id]/results/`, and `assessments/[id]/submitted/` subtrees to `projects/[id]/assessments/[aid]/…`.
- Added pid/aid mismatch guard to all three pages: `supabase.from('assessments').select('id, project_id').eq('id', aid).maybeSingle()` → `notFound()` on mismatch or missing row.
- Co-located client components (`answering-form.tsx`, `assessment-admin-view.tsx`, `assessment-source-list.tsx`, `load-assessment-detail.ts`) moved with the pages.
- `project_id: string | null` added to `AssessmentListItem` and `toListItem` helper; SELECT in `load-assessments.ts` extended to fetch the column.
- `assessment-overview-table.tsx` updated: FCS rows render `<Link>` / `<a>` to the new path; PRCC rows (`project_id === null`) render non-navigable `<span>` (avoids dead `href="#"` anti-pattern).
- All affected test files updated: import paths, mock factories extended with `assessments` table branch, `project_id` threaded through params.
- `assessments/new/` copied verbatim to `projects/[id]/assessments/new/` (see decision below). Legacy `assessments/[id]/` and `assessments/new/` subtrees deleted.

## Decisions made

**assessments/new/ copy rather than delete.** The LLD spec said delete the directory and let T2.4 recreate from scratch. During PR review the user pointed out that recreating from scratch would risk introducing bugs in already-working code. Decision: copy the files verbatim to the new path in T2.3; T2.4 adapts them (wires `projectId` from params, switches POST target, updates success-redirect). Captured as a Correction in the LLD sync.

**PRCC rows rendered as `<span>`.** PR review flagged `href="#"` on non-routable PRCC rows as an anti-pattern (triggers scroll-to-top, confuses screen readers). Replaced with conditional `<span>` rendering — consistent with the pattern in `assessments/page.tsx`.

**`assessments/new` dead link deferred.** The `/organisation` page still links to `/assessments/new` (no project ID in context). Left as accepted deferred item — T2.4 will relocate the "New Assessment" entry point to the project page.

## Review findings addressed

Two blockers from `/pr-review-v2`:
1. `results/page.test.ts:864` — custom `serverClientMock` missing `assessments` branch → TypeError at runtime. Fixed by adding the branch.
2. `assessment-overview-table.tsx` — `href="#"` for null-project-id rows → replaced with `<span>`.

One pre-existing failure confirmed on `main` and excluded from this PR's scope:
- `polling-badge-behaviour.test.ts` — 12/12 failures pre-exist on main.

## LLD sync

- **Correction:** `assessments/new/` copied rather than deleted (LLD said delete + T2.4 recreates).
- **Addition:** `project_id` field plumbed into `AssessmentListItem` + `load-assessments.ts`; conditional `<span>` rendering in `assessment-overview-table.tsx`. Bundled here because the migration made old hrefs immediately dead.
- LLD updated: `docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md` §B.3, version 0.2 → 0.3.
- Kernel anti-pattern added: constructing `/assessments/${id}` hrefs in list components.
- Coverage manifest: two B.3 entries flipped from `Approved` → `Implemented`.

## Cost

- **At PR creation:** $8.60 (29 min to PR)
- **Final total:** $14.55
- **Post-PR delta:** $5.95 — driven by PR review fix cycle (CI failure + 2 blockers) and the undelete-and-restore pass.

## Cost retrospective

| Driver | Impact | Action |
|--------|--------|--------|
| Context compaction (2 compactions) | ~$3 — re-summary inflates cache-write tokens | Keep route-migration PRs under 200 lines; this one touched ~25 test files which ballooned the diff |
| PR review fix cycle (3 extra commits) | ~$2 — each push re-triggers the CI probe + 3-agent review | The `results/page.test.ts` mock gap was a pre-existing fragile pattern (one-off local mock); test-author would have caught it if the change had used the standard mocks |
| Undelete pass (late scope change) | ~$1 — extra verification run | The LLD spec was wrong about the delete strategy; the correction was made at user review time rather than at design time |

**Primary improvement action:** for route-migration tasks, explicitly annotate which test mock factories need extending. The `results/page.test.ts` had a locally-defined mock (not the shared factory) that didn't get the `assessments` branch — a grep of `serverClientMock` in test files would have caught this before PR.

## Next steps

- #411 — POST `/api/projects/[pid]/assessments` + per-repo gate (Wave 2, ready to implement)
- #413 — `/projects/[pid]/assessments/new` page + repo-admin filter (Wave 3, depends on #411)
