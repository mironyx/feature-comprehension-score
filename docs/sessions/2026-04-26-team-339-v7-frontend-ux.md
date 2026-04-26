# Team Session Log — 2026-04-26 · Epic #339 · V7 Frontend UX Improvements

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|-------|-------|-----|--------|--------|
| #340 | feat: breadcrumbs navigation component | [#351](https://github.com/mironyx/feature-comprehension-score/pull/351) | `feat/breadcrumbs-navigation` | Wave 1 |
| #342 | feat: light theme colour tokens | [#350](https://github.com/mironyx/feature-comprehension-score/pull/350) | `feat/light-theme-tokens` | Wave 1 |
| #344 | feat: responsive heading sizes with clamp() | [#349](https://github.com/mironyx/feature-comprehension-score/pull/349) | `feat/responsive-headings` | Wave 1 |
| #347 | feat: tabbed organisation page layout | [#352](https://github.com/mironyx/feature-comprehension-score/pull/352) | `feat/org-page-tabs` | Wave 1 |
| #341 | feat: NavBar active route + assessment pages layout | [#355](https://github.com/mironyx/feature-comprehension-score/pull/355) | `feat/active-route-layout` | Wave 2 |
| #345 | fix: PageHeader overflow and mobile stacking | [#353](https://github.com/mironyx/feature-comprehension-score/pull/353) | `feat/pageheader-overflow` | Wave 2 |
| #348 | feat: focus ring styles and contrast improvements | [#354](https://github.com/mironyx/feature-comprehension-score/pull/354) | `feat/focus-rings-contrast` | Wave 2 |
| #343 | feat: theme toggle with persistence | [#356](https://github.com/mironyx/feature-comprehension-score/pull/356) | `feat/theme-toggle` | Wave 3a |
| #346 | feat: mobile NavBar hamburger menu | [#357](https://github.com/mironyx/feature-comprehension-score/pull/357) | `feat/mobile-navbar-hamburger` | Wave 3b |

## Cross-cutting decisions

**LLD two-file split for FE components.** The LLD specified single-file components with `'use client'` at the top. In practice, presentational components (Breadcrumbs, ThemeToggle internals) should be server-compatible — `'use client'` belongs in the wrapper that owns hooks. This pattern emerged from #340 and was adopted by subsequent tasks. Future LLDs should explicitly specify which file carries the directive.

**Reuse of existing types over bespoke prop shapes.** LLD §T7 (mobile NavBar) specified bespoke `{href, label}[]` and `{id, name}[]` shapes. Teammate-346 correctly reused existing `NavLink` and `OrgRow` types per the "grep before inventing" rule. The LLD was reconciled by lld-sync.

**Light theme contrast corrections.** LLD T3 specified `--color-accent: #d97706` (claimed 4.6:1 on `#f5f4f0`) but actual ratio is 2.89:1 — fails WCAG AA. Teammate-342 independently darkened accent, destructive, and success tokens to pass AA. lld-sync reconciled T3; this is a systematic gap in the LLD authoring process (contrast ratios were not verified at design time).

**Inactive tab subtrees unmount.** The tabbed org page (#347) unmounts inactive tabs on switch — in-flight form state in Context/Retrieval forms is lost. Matches LLD wording but flagged as a deliberate UX trade-off worth revisiting. Documented in PR and lld-sync.

## Coordination events

**Crash recovery for #340.** Teammate-340 was accidentally stopped by the user mid-session. Lead ran `/feature-end 340` directly, switching into the orphaned worktree at `../fcs-feat-340-breadcrumbs-navigation`. Recovery was clean; the session added ~$11.30 to the total cost (recovery session ran lld-sync + feature-end from scratch).

**LLD merge conflicts.** Multiple teammates updating `docs/design/lld-v7-frontend-ux.md` (Document Control revision row) caused rebase conflicts for later waves. Each was resolved by combining issue references in the `Revised` field. The LLD's Document Control table is a write-hotspot in parallel runs — future epics should consider a less conflict-prone versioning approach (e.g. per-task lld files or appending revision rows rather than updating a single cell).

**Wave-3a autonomous feature-end.** Teammate-343 ran `/feature-end 343` autonomously without waiting for the explicit lead signal. Lead then shut down the teammate and spawned Wave 3b. No harm done — the autonomous path works correctly, but the skill protocol says to wait for the lead signal. Per-teammate behaviour was otherwise correct.

**Wave-2 teammates (#345, #348) ran feature-end autonomously.** Same pattern — both completed correctly without waiting. The human review gate was not enforced by these teammates. Worth tightening the teammate prompt to be more explicit about waiting.

## What worked / what didn't

**Worked well:**
- 4-way parallel Wave 1 with no shared-file conflicts — tasks were correctly partitioned.
- All CI runs passed (a few transient Supabase CLI download errors on first runs, all resolved on re-run).
- LLD quality was high for Wave 1 tasks (#344, #345, #348) — teammates implemented verbatim with minimal deviations.
- Test-author + evaluator pipeline caught coverage gaps (#343 had 4 adversarial tests added).

**Didn't work well:**
- Teammates ran `/feature-end` autonomously without waiting for the human review gate. The skill prompt says "Report back and wait" but several teammates proceeded independently. The lead prompt needs to be more explicit, or the feature-end skill needs a hard wait mechanism.
- LLD contrast ratios were not verified at design time — three tokens failed WCAG AA and needed darkening at implementation. Add a contrast-check step to `/lld` or `/architect`.
- LLD single-file component specs led to `'use client'` corrections in multiple tasks. The standard pattern (presentational + client wrapper) should be the LLD default.

## Process notes for `/retro`

1. **Human gate enforcement:** Teammates ignored the "wait for lead signal" instruction for feature-end. Consider adding an explicit pause step or ACK mechanism in the teammate prompt.
2. **LLD invariant: contrast ratios.** The LLD should verify WCAG AA ratios programmatically at authoring time, not trust claimed values.
3. **LLD default: server-safe primitives.** Component specs should default to no `'use client'` on the primitive; only the wrapper gets it.
4. **LLD write-hotspot.** Document Control `Revised` field causes conflicts in parallel runs. Consider a revision log table (append-only) instead of a single cell.
5. **Test-author traversal helpers.** The `renderTree` / `collectLinkOnClicks` pattern for lucide-react icon children needed fixing in #346. Worth capturing in a shared test utility or the test-author prompt.
