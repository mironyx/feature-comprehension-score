# Frontend UX Improvements — V7 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-04-25 |
| Last updated | 2026-04-25 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-25 | LS / Claude | Initial draft from frontend design audit |

---

## Context / Background

The current frontend was built as a dark-only MVP (Phase 2). Now that core functionality is stable, several UX issues need addressing:

1. **Navigation is poor.** No breadcrumbs, no back links, no active-route indicator in the NavBar. Users must rely on the browser back button. The assessment answering and results pages render outside the authenticated layout, so the NavBar is not even visible.
2. **Organisation page is cramped.** Three dense sections (assessment table, context form, retrieval settings) are stacked vertically with minimal visual separation. Different concerns are mixed in a single scroll.
3. **Dark-only theme is hard to view.** Only dark colours are defined (`globals.css`). Some users find the dark background (`#0d0f14`) difficult for extended reading. Secondary text contrast (`#7a8499` on `#0d0f14`) is borderline WCAG AA.
4. **Titles are cut / font sizes don't scale.** Heading sizes are fixed (`2.25rem` for `heading-xl`). On mobile or with long feature names, titles overflow or get truncated. No responsive scaling (`clamp()`) is used. The NavBar collapses poorly on narrow screens.
5. **No focus/keyboard navigation styles.** Interactive elements lack visible focus rings, making keyboard navigation difficult.

### Design system reference

The existing design system spec is [docs/design/frontend-system.md](../design/frontend-system.md). That document explicitly scoped light mode and mobile responsiveness as out-of-scope for MVP. This requirements doc brings them into scope.

---

## Epic 1: Navigation & Wayfinding

### Story 1.1: Breadcrumb navigation component

**As a** user navigating the application,
**I want to** see breadcrumbs below the NavBar showing my location in the page hierarchy,
**so that** I can navigate back to parent pages without using the browser back button.

**Acceptance Criteria:**

- Given any authenticated page, when rendered, then a breadcrumb trail is visible below the NavBar.
- Given the breadcrumb trail, then each segment except the current page is a clickable link.
- Given the results page (`/assessments/[id]/results`), then breadcrumbs show: `My Assessments > [Feature Name] > Results`.
- Given the new assessment page (`/assessments/new`), then breadcrumbs show: `My Assessments > New Assessment`.
- Given the organisation page (`/organisation`), then breadcrumbs show: `Organisation`.
- Given mobile viewports, then breadcrumbs truncate gracefully (ellipsis for long feature names).

**Notes:** Create `src/components/ui/breadcrumbs.tsx`. Integrate into the authenticated layout below the NavBar. Use `usePathname()` and route segment data. Style with `text-caption` and `text-text-secondary`, active segment in `text-text-primary`.

### Story 1.2: NavBar active route indicator

**As a** user,
**I want to** see which page I'm currently on highlighted in the NavBar,
**so that** I have clear orientation within the application.

**Acceptance Criteria:**

- Given the user is on `/assessments` or any child route, then the "My Assessments" link is highlighted with `text-accent` colour and a bottom border.
- Given the user is on `/organisation`, then the "Organisation" link is highlighted.
- Given only one link is active at a time.

**Notes:** Requires converting NavBar link list to a client component (or extracting a `NavLinks` client component) to use `usePathname()`. Keep the NavBar shell as a server component.

### Story 1.3: Consistent layout shell for assessment pages

**As a** user taking or viewing an assessment,
**I want to** see the NavBar and breadcrumbs on all pages,
**so that** I can navigate without relying on the browser back button.

**Acceptance Criteria:**

- Given the assessment answering page (`/assessments/[id]`), then the NavBar is visible at the top.
- Given the results page (`/assessments/[id]/results`), then the NavBar is visible at the top.
- Given the submitted page (`/assessments/[id]/submitted`), then the NavBar is visible at the top.
- Given these pages currently render their own `<main>` wrapper, then they are refactored to use the authenticated layout's `<main>` wrapper.

**Notes:** Move `src/app/assessments/[id]/` pages under the `(authenticated)` route group, or restructure so they share the authenticated layout. The answering form currently renders its own `<main>` — this needs to be removed and the form should render as page content within the layout shell.

---

## Epic 2: Light/Dark Theme Support

### Story 2.1: Light theme colour tokens

**As a** user who prefers light mode,
**I want to** view the application in a light colour scheme,
**so that** I can use the tool comfortably in bright environments.

**Acceptance Criteria:**

- Given `globals.css`, then a `.light` class (or `data-theme="light"`) defines a complete set of light-mode CSS variables mirroring the dark-mode tokens.
- Given the light theme, then backgrounds are warm off-white (`#f5f4f0` page, `#ffffff` surface), text is near-black (`#1a1d23` primary, `#5c6370` secondary), borders are warm grey (`#ddd8d0`).
- Given the accent colour, then amber (`#f59e0b`) is retained in both themes.
- Given all existing components, then they render correctly in both themes without additional class changes (all styling flows through CSS variables).
- Given WCAG AA compliance, then all text/background combinations meet at least 4.5:1 contrast ratio.

**Notes:** Update `globals.css` with a second set of variables under `.light` or `[data-theme="light"]`. Update `frontend-system.md` to document the light palette.

### Story 2.2: Theme toggle and persistence

**As a** user,
**I want to** toggle between light and dark themes and have my preference remembered,
**so that** I don't have to switch every time I visit.

**Acceptance Criteria:**

- Given the NavBar, then a theme toggle button (sun/moon icon) is visible.
- Given the user clicks the toggle, then the theme switches immediately without a page reload.
- Given the user's preference, then it is persisted in a cookie or `localStorage` and restored on next visit.
- Given no stored preference, then the system defaults to `prefers-color-scheme` media query.
- Given the toggle, then it is accessible (has an `aria-label`, keyboard operable).

**Notes:** Consider `next-themes` library or a lightweight cookie-based approach. The toggle should be a client component in the NavBar. Avoid flash of wrong theme on initial load (set theme class in `<html>` before hydration).

---

## Epic 3: Responsive Typography & Layout

### Story 3.1: Responsive heading sizes

**As a** user on a mobile device,
**I want to** see headings that scale appropriately to my screen size,
**so that** titles are readable without being cut off or overflowing.

**Acceptance Criteria:**

- Given `tailwind.config.ts`, then `text-heading-xl` uses `clamp(1.5rem, 4vw, 2.25rem)` instead of fixed `2.25rem`.
- Given `text-display`, then it uses `clamp(2.5rem, 6vw, 4rem)` instead of fixed `4rem`.
- Given `text-heading-lg`, then it uses `clamp(1.25rem, 3vw, 1.5rem)`.
- Given any page title with a long feature name, then the title wraps gracefully without horizontal overflow.

**Notes:** Update `fontSize` entries in `tailwind.config.ts`. Update `frontend-system.md` type scale section.

### Story 3.2: PageHeader overflow and mobile stacking

**As a** user viewing a page with a long title and an action button,
**I want to** see the full title without truncation,
**so that** I know exactly which assessment or page I'm viewing.

**Acceptance Criteria:**

- Given `PageHeader` with a long title and an action button, then on mobile the layout stacks vertically (title above, action below).
- Given the title container, then `min-w-0` and `break-words` prevent overflow.
- Given desktop viewports, then the existing side-by-side layout is preserved.

**Notes:** Update `src/components/ui/page-header.tsx`. Use `flex-wrap` or responsive `flex-col`/`flex-row`.

### Story 3.3: Mobile NavBar with hamburger menu

**As a** user on a mobile device,
**I want to** access all navigation links via a hamburger menu,
**so that** the NavBar doesn't overflow on narrow screens.

**Acceptance Criteria:**

- Given a viewport < 768px, then nav links, org switcher, and user menu collapse behind a hamburger icon.
- Given the user taps the hamburger icon, then a dropdown or slide-out panel shows all navigation items.
- Given the panel is open, then tapping outside or pressing Escape closes it.
- Given desktop viewports (>= 768px), then the current horizontal NavBar layout is preserved.

**Notes:** Update `src/components/nav-bar.tsx`. Extract a `MobileNavMenu` client component. Use `lucide-react` for the menu icon.

---

## Epic 4: Organisation Page Layout

### Story 4.1: Tabbed organisation page

**As an** admin viewing the organisation page,
**I want to** see content organised into tabs (Assessments / Context Settings / Retrieval Settings),
**so that** each section has room to breathe and I can focus on one concern at a time.

**Acceptance Criteria:**

- Given the organisation page, then three tabs are displayed: "Assessments", "Context", "Retrieval".
- Given the "Assessments" tab is active (default), then only the assessment table is visible.
- Given the "Context" tab is active, then only the org context form is visible.
- Given the "Retrieval" tab is active, then only the retrieval settings form is visible.
- Given tab switching, then it happens client-side without a page reload.
- Given the active tab, then it is visually distinguished (accent colour, bottom border).

**Notes:** Create a `Tabs` component (or use shadcn/ui `Tabs` primitive). Update the organisation page to wrap sections in tabs. Consider URL query param for tab state (`?tab=context`) so deep links work.

---

## Epic 5: Accessibility Polish

### Story 5.1: Focus ring styles

**As a** keyboard user,
**I want to** see visible focus indicators on all interactive elements,
**so that** I can navigate the application without a mouse.

**Acceptance Criteria:**

- Given any `Button` component, then `focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none` is applied.
- Given any `Link` in the NavBar or page content, then a visible focus ring appears on keyboard focus.
- Given form inputs (`input`, `textarea`, `select`), then a focus ring with accent colour is visible.
- Given the focus ring, then it is only visible on keyboard focus (`focus-visible`), not mouse click.

**Notes:** Apply globally via `globals.css` base layer or per-component. Update `Button` component. Update `frontend-system.md` to document focus ring pattern.

### Story 5.2: Contrast improvements for secondary text

**As a** user with visual impairments,
**I want to** read secondary text comfortably,
**so that** all text meets WCAG AA contrast requirements.

**Acceptance Criteria:**

- Given the dark theme, then `--color-text-secondary` is changed from `#7a8499` to `#8f96a8` (>= 5:1 contrast ratio on `#0d0f14`).
- Given the light theme, then `--color-text-secondary` meets >= 4.5:1 contrast on the light background.
- Given all status badge colours, then they meet at least 4.5:1 contrast ratio against their background pills.

**Notes:** Update `globals.css` for both themes. Audit status badge colours in `frontend-system.md`.

---

## What We Are NOT Building

- Sidebar navigation — the top NavBar is sufficient for the current page count.
- Loading skeletons / Suspense boundaries — deferred to a future improvement cycle.
- EmptyState component — deferred (current plain `<p>` elements are functional).
- Page transition animations — out of scope.
- Internationalisation — out of scope.

---

## Parallelism Notes

These epics have minimal file overlap, enabling parallel implementation:

- **Epic 1** (Navigation) touches: `nav-bar.tsx`, new `breadcrumbs.tsx`, authenticated layout, assessment page files.
- **Epic 2** (Theme) touches: `globals.css`, `layout.tsx`, new theme toggle component.
- **Epic 3** (Responsive) touches: `tailwind.config.ts`, `page-header.tsx`, `nav-bar.tsx`.
- **Epic 4** (Org page) touches: organisation page, new tabs component.
- **Epic 5** (Accessibility) touches: `globals.css`, `button.tsx`.

**Shared file conflicts:** `nav-bar.tsx` is touched by Epics 1, 2, and 3 (active route, theme toggle, mobile menu). `globals.css` is touched by Epics 2 and 5. These must be sequenced or carefully merged. `/architect` should determine the final wave assignments.

---

## Next Steps

1. Run `/architect docs/requirements/v7-requirements.md` to produce the epic, task issues, LLD, and dependency graph.
2. Human reviews artefacts.
3. Run `/feature` or `/feature-team` per the wave assignments.
