# Session 3 — 2026-05-02 — Breadcrumbs for project-scoped routes (V11 E11.4 T4.2)

**Issue:** [#433](https://github.com/mironyx/feature-comprehension-score/issues/433)
**PR:** [#437](https://github.com/mironyx/feature-comprehension-score/pull/437)
**LLD:** `docs/design/lld-v11-e11-4-navigation-routing.md` §B.2

## Work completed

- Added `BreadcrumbProvider` React context (`src/components/breadcrumb-provider.tsx`) and the
  effectful `SetBreadcrumbs` registrar (`src/components/set-breadcrumbs.tsx`).
- Modified `BreadcrumbsBar` to read context segments first and fall back to the existing
  static `ROUTE_MAP` for `/assessments`, `/assessments/new`, `/organisation`.
- Wrapped the authenticated layout's children with `<BreadcrumbProvider>` so the bar and the
  page tree share the same context.
- Project dashboard (`/projects/[id]`), settings (`/projects/[id]/settings`), and the admin
  branch of the assessment page (`/projects/[id]/assessments/[aid]`) now register their
  breadcrumb trails. Members on assessment pages still see no breadcrumbs (invariant I4 —
  the page does not render `<SetBreadcrumbs>` on the participant branches).
- Test-author produced 19 BDD tests in `tests/components/breadcrumbs-bar.test.ts` covering
  static-fallback rendering, context-driven rendering for all three project-scoped paths,
  context-wins-over-static precedence, the member guard, and the SetBreadcrumbs
  mount/unmount lifecycle (effect + cleanup).

## Decisions made

- **No deviation from LLD §B.2 design.** The provider/consumer + effectful registrar pattern
  was the simplest fit — alternatives (pathname-only matching, Next.js route handle metadata)
  cannot show project names without server fetches.
- **Project name fetched lazily on the admin branch only.** The reviewer flagged a potential
  DB-efficiency optimisation (embed `projects!inner(name)` in the upfront assessments query),
  but the member fast path doesn't need the project name; lazy fetch keeps that path cheap.
- **Auth ordering tightened.** User feedback caught that the assessments existence query ran
  before `auth.getUser()` (pre-existing pattern from E11.2). Moved auth above the row read so
  the existence check happens with a confirmed session, not just RLS gating.
- **`renderAdminView` extraction reversed, then re-instated.** Initial extract for complexity
  reduction; reviewer flagged conflict with the "no single-use helper for line limits" rule;
  inlined back. Then user asked to shorten the page method, so re-extracted both the admin
  view and the participant-link flow into named helpers — naming now adds clarity, function
  body shrank to a flat dispatch.

## Review feedback addressed

- **/pr-review-v2:** 0 blockers; 1 warn (single-use helper) → fix-and-iterate; 1 deferred
  warn (db-efficiency, defensible).
- **User feedback during review:** auth ordering on the assessment page; method length.
  Both addressed in commit a4072e5.

## CI

CI was flaky on the first run after the inline-helper commit (one unrelated test in
`tests/app/api/fcs-service-logging.test.ts` failed under shared mock state — passed 17/17
locally on both main and the branch). `gh run rerun --failed` cleared it. Final run was
all-green: lint+type, unit, integration, E2E, Docker.

## Cost

- **PR creation:** $7.1082 (1,056 in / 48,913 out / 10,201,196 cache-read / 285,099 cache-write)
- **Final feature total:** $14.6504 (1,289 in / 81,268 out / 21,879,423 cache-read / 491,748 cache-write)
- **Delta (post-PR rework):** $7.5422 — review fixes, auth-ordering refactor, helper extraction,
  CI rerun probing, lld-sync.

## Cost retrospective

| Driver | Detected | Impact |
|---|---|---|
| Multiple refactor cycles on the same file | `renderAdminView` extracted → inlined → re-extracted → both helpers | Medium — three commits to one file because the right shape only emerged after user feedback |
| CI flake re-runs | One full re-probe after unrelated test flake | Low — single rerun, no fix work |
| Reviewer agent feedback loop | One quality + one design-conformance agent on a 743-line diff | Medium — design-conformance agent re-read kernel.md and the LLD |

**Improvement actions:**
- For pages whose admin branches gain a fetch + JSX block, consider whether a helper is the
  natural shape **before** writing the inline first — saves one refactor cycle.
- The "always check auth before existence query" pattern should be in the page-side
  CLAUDE.md guidance or kernel anti-patterns; this PR's auth-ordering fix could have been
  caught by a static rule.

## Next steps

- T4.3 (issue #434) — root redirect + last-visited project — already in progress on the
  parallel teammate. Wave 2 unblocked.
- Merge this PR.
