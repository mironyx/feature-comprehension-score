# Session log — 2026-04-26 — Team teammate-343 (theme toggle + persistence)

## Issue / PR

- Issue: #343 — feat: theme toggle with persistence
- Parent epic: #339 (V7 frontend UX)
- LLD section: `docs/design/lld-v7-frontend-ux.md` § T4
- Wave: 3a (after T2 + T3 — needs `nav-bar.tsx` and theme tokens)
- PR: <https://github.com/mironyx/feature-comprehension-score/pull/356>
- Branch: `feat/theme-toggle` (worktree: `../fcs-feat-343-theme-toggle`)
- Pressure tier: Standard (~76 src lines across 3 files)

## Work completed

- Created `src/components/theme-toggle.tsx` — client component with Sun/Moon icons from
  `lucide-react`. Reads/writes `localStorage['fcs-theme']` with `'light' | 'dark'` values,
  falls back to `prefers-color-scheme` on first visit, and applies the choice via
  `data-theme` on `document.documentElement`. Decomposed into three private helpers
  (`readSavedTheme`, `readPreferredTheme`, `applyTheme`) plus the public `ThemeToggle`
  component, keeping every function inside the 20-line complexity budget. Exports
  `THEME_STORAGE_KEY` and `Theme` so tests can use the same key without string
  duplication.
- Added an inline `<head>` script in `src/app/layout.tsx` that runs synchronously before
  React hydration, reads `localStorage['fcs-theme']`, falls back to `prefers-color-scheme`,
  and sets `data-theme` on `<html>`. Wrapped in try/catch so a `SecurityError` in
  restricted-storage browsers does not block first paint.
- Wired `<ThemeToggle />` into `src/components/nav-bar.tsx` between the `OrgSwitcher` and
  the username span on the right side of the bar.
- Added 22 new tests:
  - `tests/components/theme-toggle.test.ts` (new) — 18 BDD-style tests covering button
    aria-label, native `<button>` keyboard operability, Sun-when-dark / Moon-when-light
    icon switching, `localStorage.getItem('fcs-theme')` on mount, `data-theme` set from
    saved value, `matchMedia('(prefers-color-scheme: dark)')` fallback, click-toggles-theme
    in both directions, click-persists-to-localStorage in both directions, the
    `THEME_STORAGE_KEY` constant value, and a prohibition test confirming saved preference
    wins over the system preference.
  - `tests/evaluation/theme-toggle.eval.test.ts` (new — written by `feature-evaluator`) —
    4 adversarial tests plugging coverage gaps: ThemeToggle is rendered inside NavBar,
    init script is wrapped in try/catch, init script validates the stored value before
    applying.
  - `tests/app/layout.test.ts` (extended) — 1 new test asserting the inline init script
    contains `fcs-theme`, `data-theme`, and `prefers-color-scheme`. Also updated the
    pre-existing body test to navigate the now-array `html.props.children`.

## Decisions made

- **Test author's mock pattern needed a `renderTree` helper.** The repo's house style is
  to call components as plain functions and `JSON.stringify` the returned React element —
  works for components that return native DOM trees (`<ul>`, `<button>`), but breaks when
  the tree contains function components (lucide-react `<Sun />` / `<Moon />`) because
  React.createElement does not invoke the function. Added a small recursive `renderTree`
  helper at the top of the test file that walks the element tree, invokes function
  components when found, and preserves event handlers like `onClick` (which JSON
  round-tripping would have dropped). Two minor test-infrastructure fixes: replaced
  `JSON.parse(JSON.stringify(...))` with `renderTree(...)` (the round-trip dropped
  `onClick`), and wrapped the `useStateSpy` / `useEffectSpy` declarations in
  `vi.hoisted()` so the `vi.mock('react', ...)` factory could see them. Assertions
  themselves were not changed.
- **Try/catch widened beyond the LLD scope.** LLD T4 specified `try/catch` only for the
  inline init script. The `pr-review-v2` agent flagged that the runtime component had the
  same restricted-storage failure mode (`localStorage.getItem`, `localStorage.setItem`,
  `matchMedia`) but no guard. Extended the same protection to the React effect and click
  handler — defensive widening, no behaviour change for the happy path. Recorded as an
  Implementation note in the LLD.
- **First-paint icon flash accepted as a known limitation.** `useState<Theme>` is
  initialised to `'dark'` to avoid SSR/CSR hydration mismatch, so a light-mode user sees
  the Sun icon for one frame before `useEffect` runs. The colour palette is correct
  (the inline init script set `data-theme` before hydration); only the icon flashes.
  Full fix needs either a CSS-only icon swap or a cookie/header-based SSR theme — out of
  scope for #343.
- **lld-sync run.** § T4 had no internal-decomposition section, so the three new private
  helpers needed documenting. Added a decomposition table plus two Implementation notes
  (try/catch widening + icon-flash limitation). LLD bumped to version 1.3.

## Review feedback addressed

`pr-review-v2` raised 0 blockers and 5 warnings:

- Try/catch missing on `localStorage` and `matchMedia` (block-worthy in restricted-storage
  contexts) — **fixed** in commit `4fe9e5c`.
- Three "unspecified private helper" warnings — **resolved** by adding the internal
  decomposition section to LLD § T4 in this session.
- One first-paint icon-flash warning — **deferred** with rationale recorded in the LLD.

CI (run 24944554244) ran green on all five jobs after the fix push: Lint & Type-check,
Unit tests, Integration tests (Supabase), Docker build, and E2E (Playwright). The earlier
"cancelled" result the CI probe reported was the prior run being concurrency-cancelled by
the fix push, not a code failure.

## Cost summary

- **PR-creation cost (commit 96da68f):** \$6.4561 / 64,671 output tokens / 20 min to PR.
- **Final feature cost (after review fix + lld-sync):** \$11.1532 / 87,367 output tokens.
- **Delta:** ≈ \$4.70, ≈ 22,700 output tokens spent post-PR — covers the try/catch fix
  commit, posting the review comment, the lld-sync skill run, and writing this session
  log.

## Cost retrospective

| Driver | Detected? | Impact | Improvement |
|--------|-----------|--------|-------------|
| Context compaction | No | — | — |
| Fix cycles | 1 push (try/catch) | Low | Could have been caught by `feature-evaluator` if the `silent failure risks` section the evaluator already produces were treated as blocking instead of advisory; would have saved one round-trip. |
| Agent spawns | 5 (test-author, evaluator, ci-probe ×2, pr-review-v2 ×2 sub-agents) | Medium | All necessary; ci-probe ×2 is the cost of a concurrency-cancel — unavoidable when a fix push lands while CI is mid-flight. |
| LLD quality gaps | 1 — no internal-decomposition section in T4 | Low | The `/lld` template should default to including a decomposition placeholder for components ≥ 30 LOC, even if filled in later. Three "unspecified function" warnings on an otherwise clean PR is pure paperwork. |
| Mock complexity | 1 — `vi.hoisted` + `renderTree` helper | Medium | Codify the `renderTree` helper as a shared test util once a second component test needs it; right now it lives inline in `theme-toggle.test.ts`. |
| Framework version gotchas | No | — | — |

**Top action:** add a default "Internal decomposition" placeholder to the `/lld` template
for any LLD section whose component spec is ≥ 30 LOC. This would have made the three
"unspecified function" review warnings disappear without any change to the implementation
itself.

## Next steps / follow-up items

- Wave 3b: T7 (mobile NavBar hamburger menu) is now unblocked — depends on `nav-bar.tsx`
  which this PR has touched.
- Two deferred items recorded in the LLD: (a) icon-flash fix via CSS-only swap or
  SSR theme cookie; (b) extracting `renderTree` into a shared test util when a second
  component test needs it.
