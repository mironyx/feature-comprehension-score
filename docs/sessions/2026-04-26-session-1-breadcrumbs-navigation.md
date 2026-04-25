# Session Log — 2026-04-26 · Session 1 · #340 Breadcrumbs navigation component

_Session recovered from crashed teammate (original session: `d302945a-64a9-4e1e-9046-feb687f0998a`)._

## Issues shipped

| Issue | Story | PR | Branch |
|-------|-------|-----|--------|
| #340 | feat: breadcrumbs navigation component | [#351](https://github.com/mironyx/feature-comprehension-score/pull/351) | `feat/breadcrumbs-navigation` |

## Work completed

Implemented Wave 1 / T1 of epic #339. Added a `Breadcrumbs` presentational component and a `BreadcrumbsBar` client wrapper that derives segments from `usePathname()` via a static route map. Integrated below the NavBar in `(authenticated)/layout.tsx`. Covers the three static authenticated routes; dynamic assessment routes deferred to T2 (#341).

- New: `src/components/ui/breadcrumbs.tsx` — server-compatible presentational component
- New: `src/components/breadcrumbs-bar.tsx` — `'use client'` wrapper with route map
- Edit: `src/components/ui/index.ts` — barrel export
- Edit: `src/app/(authenticated)/layout.tsx` — renders `<BreadcrumbsBar />` below NavBar
- New: `tests/components/ui/breadcrumbs.test.ts` (18 unit tests)
- New: `tests/evaluation/breadcrumbs.eval.test.ts` (2 adversarial tests)
- Total tests: 1395 passing

## Decisions made

**Two-file split instead of one.** LLD spec put `'use client'` in the single `breadcrumbs.tsx`. In practice `Breadcrumbs` is purely presentational with no hooks; the `'use client'` boundary belongs in the wrapper that calls `usePathname()`. Split keeps the primitive server-compatible, consistent with `Button`/`PageHeader` codebase pattern.

**`<a>` instead of `next/link`.** `Breadcrumbs` is a UI primitive — keeping it framework-agnostic avoids coupling and matches `org-switcher.tsx` precedent. Trade-off (full page reload on breadcrumb click) is acceptable for infrequent navigation. Flagged in PR for future revisit.

**Dynamic routes deferred.** `/assessments/[id]*` routes are not yet under `(authenticated)`, so `BreadcrumbsBar` returns `null` for them. T2 (#341) will move the pages and extend the route map.

## Review feedback addressed

`pr-review-v2` found 0 blockers, 4 warnings. The `<a>` vs `next/link` deviation was discussed and deferred. Two LLD-update items handled by this lld-sync. No code changes post-PR.

## LLD sync

Updated `docs/design/lld-v7-frontend-ux.md § T1`:
- Corrected `'use client'` placement (breadcrumbs-bar, not breadcrumbs)
- Added `BreadcrumbsBar` to file list
- Noted `<a>` usage and reason
- Marked dynamic routes as deferred → #341
- Bumped version 1.0 → 1.1, status Draft → Revised

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-r/cache-w) |
|-------|------|---------------------------------|
| PR creation | $4.9575 | 7,360 / 44,430 / 4,638,631 / 330,571 |
| Final (2 sessions) | $16.2575 | 14,989 / 126,747 / 15,535,638 / 991,253 |
| Delta (post-PR) | ~$11.30 | Recovery session: lld-sync + feature-end |

**Cost drivers:**
- **Crash recovery** — teammate was stopped mid-session; lead re-ran `/feature-end` which added a full recovery session. Avoidable if teammate runs uninterrupted.
- **Large cache-read volume** — 15.5M cache-read tokens across two sessions; each session re-reads the full diff and tests. Normal for this feature size.
- **No fix cycles** — implementation landed clean on first run (1 vitest run, 0 lint errors). LLD was well-specified for this task.

**Actions for next time:**
- Ensure teammates are not stopped mid-run — lead should not interrupt a running teammate.
- LLD two-file pattern (presentational + client wrapper) should be the default for future FE components.

## Next steps

- Wave 2 (#341 active route + layout, #345 PageHeader, #348 focus rings) — blocked on all Wave 1 PRs merging.
- T2 (#341) must extend `BreadcrumbsBar` route map with dynamic assessment routes once pages are moved.
