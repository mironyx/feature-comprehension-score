# Session Log — 2026-05-03 — #446 Breadcrumbs on Results and Submitted Pages

Session ID: `3360a7a1-ba62-4ffe-8365-77d5b8e26e2c`

## Work completed

Implemented issue #446 — admin breadcrumb trail on `/projects/[id]/assessments/[aid]/results`
and `/projects/[id]/assessments/[aid]/submitted`. PR #449.

- Added `SetBreadcrumbs` to `results/page.tsx` — admin-only, trail: Projects > [Project] > Assessment #[aid] > Results
- Added `SetBreadcrumbs` to `submitted/page.tsx` — admin-only, trail: Projects > [Project] > Assessment #[aid] > Submitted
- Fetched `project.name` via the user-scoped Supabase client for both pages (admin path only)
- Used canonical `getOrgRole` helper in `submitted/page.tsx` for the admin check (kernel compliance)
- 4 new BDD tests across both page test files; all 54 tests passing

## Decisions made

**lld-sync skipped** — 35 src lines changed but this is a bug fix (missing breadcrumbs), no new exports or modules. No architectural change to document.

**Kernel fix during PR review** — the initial submitted page implementation used an inline
`adminSupabase.from('user_organisations')` query. PR review agents flagged it as a kernel
violation (anti-pattern: inline membership query should use `getOrgRole`). Fixed before merge:
replaced with `getOrgRole(supabase, user.id, assessment.org_id)` using the RLS-scoped client.

**Test strategy for `SetBreadcrumbs`** — the component renders `null` at runtime (client
component that writes to a context). `renderToStaticMarkup` cannot detect it. Used
`JSON.stringify(element)` on the raw JSX tree to inspect `segments` prop values. This is the
established pattern for this codebase's breadcrumb tests.

**`vi.mock('next/link')` in submitted test** — required to avoid circular JSON serialisation
when `JSON.stringify(element)` is called. The actual `next/link` module has circular refs.

## Review feedback addressed

Two blockers from `/pr-review-v2 449`:

1. **Kernel violation** — inline `user_organisations` query in `submitted/page.tsx`. Fixed by
   replacing with `getOrgRole(supabase, user.id, assessment.org_id)`. Tests updated:
   removed `orgMembership` from `SecretClientOptions`, added `vi.mock('@/lib/supabase/membership')`
   + `vi.mocked(getOrgRole).mockResolvedValue(orgRole)`.

2. **Test mock gap** — the custom `serverClientMock` in the `filters participant_answers` test
   returned `{}` for the `projects` table. When `isAdmin=true` the page called `.select()` on
   undefined. Fixed by returning a proper mock chain.

## Cost retrospective

- **PR-creation cost:** $2.45
- **Final total:** $4.82
- **Post-PR delta:** $2.37 (97% overhead — almost doubled)

### Cost drivers

| Driver | Impact |
|--------|--------|
| Context compaction | High — conversation was compacted before `/feature-end` ran; re-summarising inflated cache-write tokens |
| 2 fix cycles post-PR | Medium — kernel violation + mock gap each required a test/code fix round |
| 8 agent spawns during feature-core | Medium — each re-sent the diff |

### Improvement actions

- **Kernel checks before PR creation** — run a quick grep for `from('user_organisations')` in
  modified page files before pushing. A 10-second check avoids a post-PR fix cycle.
- **Mock completeness check** — after adding a new conditional branch (here: `isAdmin` fetching
  project name), re-read all existing tests in the file to see if any mock needs updating.
  The `filters participant_answers` test had a custom mock that wasn't updated.
- **Context compaction cost** — keep features under 200 src lines; feature-end session log
  writing triggers compaction when context is already full from the implementation cycle.

## Next steps

- No follow-up items identified.
