# Frontend Design System

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — awaiting human approval |
| Issue | [#171](https://github.com/leonids2005/feature-comprehension-score/issues/171) |
| Author | LS / Claude |
| Created | 2026-04-01 |
| Applies to | All pages under `src/app/` |

---

## Aesthetic Direction

**Dark editorial developer tool.** Intellectual and rigorous — the visual equivalent of a well-typeset technical report rendered in a developer-grade dark UI. Strong typographic hierarchy using a geometric display font (Syne) for titles and the headline comprehension score; clean geometric sans (Outfit) for all body text and UI copy. The amber accent is warm and distinctive, deliberately avoiding the generic SaaS blue/purple register.

**Why it fits:** FCS measures knowledge using Peter Naur's Theory Building framework — a rigorous, academic idea. The design should feel like it takes engineering craft seriously. Dark mode signals developer tool; editorial typography signals intellectual substance. The combination avoids both "another SaaS app" and "another monitoring dashboard."

**What makes it memorable:** The comprehension score number is displayed at 4 rem in Syne 700 — a large, geometric figure that reads as a measurement, not a widget. On the results page this becomes the visual anchor the eye goes to first.

---

## Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| CSS framework | **Tailwind CSS v3** | Standard for Next.js App Router; utility-first keeps component files self-contained; works with shadcn/ui |
| Component primitives | **shadcn/ui** (Radix UI + Tailwind) | Unstyled accessibility primitives with full Tailwind control; no design opinions baked in; copy-into-repo model avoids version lock |
| Icons | **lucide-react** | Used by shadcn/ui; consistent stroke-width; tree-shakeable |
| Fonts | **`next/font/google`** — Syne + Outfit | Zero layout shift; subset loading; both available on Google Fonts |

No ADR required — all choices follow the skill's default recommendations.

---

## Colour Tokens

**Mode: dark only** (MVP). Light mode is not in scope for Phase 2. The audience is engineers who spend the majority of their time in dark IDEs; dark mode reduces cognitive load for this use case.

### CSS variables (defined in `globals.css`)

```css
:root {
  --color-background:     #0d0f14;   /* page background — very dark blue-black */
  --color-surface:        #141720;   /* card / panel background */
  --color-surface-raised: #1d2232;   /* elevated surfaces — dropdowns, modals */
  --color-border:         #252b3b;   /* subtle dividers and input outlines */
  --color-text-primary:   #e8eaf0;   /* headings, primary labels — warm near-white */
  --color-text-secondary: #7a8499;   /* supporting text, captions, placeholders */
  --color-accent:         #f59e0b;   /* amber — CTAs, active states, focus rings */
  --color-accent-hover:   #d97706;   /* accent on hover */
  --color-accent-muted:   #92400e;   /* accent background for subtle highlights */
  --color-destructive:    #ef4444;   /* errors, delete actions */
  --color-destructive-muted: #450a0a; /* destructive background tint */
  --color-success:        #22c55e;   /* positive states (score above threshold) */
}
```

### Status colours (for assessment `StatusBadge`)

| Status | Text | Background |
|--------|------|------------|
| `rubric_generation` | `#f59e0b` | `#92400e` |
| `awaiting_responses` | `#60a5fa` | `#1e3a5f` |
| `scoring` | `#a78bfa` | `#2e1065` |
| `ready` | `#22c55e` | `#052e16` |
| `rubric_failed` | `#ef4444` | `#450a0a` |

---

## Typography

### Font choices

| Role | Font | Rationale |
|------|------|-----------|
| **Display** | **Syne** (Google Fonts) | Geometric, bold, modern. Strong at large sizes — the comprehension score and page titles become visual anchors. Has a technical-meets-editorial character absent from Inter/Outfit. |
| **Body** | **Outfit** (Google Fonts) | Clean geometric sans, excellent readability at 15 px. Pairs naturally with Syne (both geometric but clearly distinct in weight and purpose). |

### Type scale

| Token (Tailwind class) | Size | Weight | Line height | Use |
|------------------------|------|--------|-------------|-----|
| `text-display` | 4rem (64px) | 700 (Syne) | 1.0 | Comprehension score number |
| `text-heading-xl` | 2.25rem (36px) | 700 (Syne) | 1.2 | Page titles |
| `text-heading-lg` | 1.5rem (24px) | 600 (Syne) | 1.3 | Section headings |
| `text-heading-md` | 1.125rem (18px) | 600 (Outfit) | 1.4 | Card titles, form section headers |
| `text-body` | 0.9375rem (15px) | 400 (Outfit) | 1.6 | Body copy, descriptions |
| `text-label` | 0.8125rem (13px) | 500 (Outfit) | 1.4 | Form labels, table column headers |
| `text-caption` | 0.75rem (12px) | 400 (Outfit) | 1.5 | Metadata, timestamps, helper text |

### Tailwind `fontSize` config entries (in `tailwind.config.ts`)

```ts
fontSize: {
  display:      ['4rem',    { lineHeight: '1.0',  fontWeight: '700' }],
  'heading-xl': ['2.25rem', { lineHeight: '1.2',  fontWeight: '700' }],
  'heading-lg': ['1.5rem',  { lineHeight: '1.3',  fontWeight: '600' }],
  'heading-md': ['1.125rem',{ lineHeight: '1.4',  fontWeight: '600' }],
  body:         ['0.9375rem',{ lineHeight: '1.6', fontWeight: '400' }],
  label:        ['0.8125rem',{ lineHeight: '1.4', fontWeight: '500' }],
  caption:      ['0.75rem', { lineHeight: '1.5',  fontWeight: '400' }],
},
```

---

## Spacing & Layout

### Page layout

```
Page max-width:     1120px
Content padding:    20px (< 768px)  /  40px (≥ 768px)
Section gap:        28px
Card padding:       20px
NavBar height:      52px
```

### Tailwind `extend` values (in `tailwind.config.ts`)

```ts
maxWidth: {
  page: '1120px',
},
spacing: {
  'content-pad-sm': '20px',
  'content-pad':    '40px',
  'section-gap':    '28px',
  'card-pad':       '20px',
},
```

### Border radius & shadows

```
radius-sm:  4px   — inputs, badges, small pills
radius-md:  8px   — cards, panels, dropdowns
radius-lg:  12px  — modals, dialogs, large overlays

shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.4)
shadow-md:  0 4px 20px rgba(0, 0, 0, 0.5)
```

```ts
borderRadius: {
  sm: '4px',
  md: '8px',
  lg: '12px',
},
boxShadow: {
  sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
  md: '0 4px 20px rgba(0, 0, 0, 0.5)',
},
```

---

## Layout Shell

All authenticated pages share this structure:

```
<html> (font-family: Outfit, font-size: 15px, background: --color-background, color: --color-text-primary)
  <body>
    AuthenticatedLayout
      ├── <NavBar>                          height: 52px, border-bottom: 1px --color-border
      │   ├── Left: logo ("FCS") + nav links
      │   ├── Centre: (empty for MVP)
      │   └── Right: OrgSwitcher + username + Sign out
      └── <main>                            max-width: 1120px, centred, horizontal padding
          ├── <PageHeader> (optional)       title + optional subtitle + optional action button
          └── page content
```

### NavBar specification

| Property | Value |
|----------|-------|
| Height | 52px |
| Background | `var(--color-background)` (unified — no separate bar colour) |
| Border bottom | `1px solid var(--color-border)` |
| Logo | `"FCS"` in `text-heading-md` Syne, accent colour, links to `/assessments` |
| Nav links | `text-label`, `text-text-secondary` default, `text-accent` on active route |
| Padding | `0 40px` (desktop), `0 20px` (mobile) |
| Position | `sticky top-0 z-50` |

### `<main>` shell

```tsx
<main className="mx-auto w-full max-w-page px-content-pad-sm md:px-content-pad py-section-gap">
  {children}
</main>
```

### No sidebar (MVP)

A left-sidebar navigation is out of scope for Phase 2. The top NavBar is sufficient for the current page count.

---

## Component Patterns

These are patterns, not full implementations. Feature agents must produce components that match these visual specifications. Do not deviate from tokens or layout without updating this document first.

### `PageHeader`

Appears at the top of most pages. Full-width row:

```
[Page title (text-heading-xl, Syne)]      [optional: action Button (primary)]
[optional: subtitle (text-body, text-secondary)]
```

Usage: `<PageHeader title="My Assessments" action={<Button>New Assessment</Button>} />`

### `Card`

A surface container for grouped content.

```
background: --color-surface
border: 1px solid --color-border
border-radius: radius-md (8px)
padding: card-pad (20px)
box-shadow: shadow-sm
```

### `Button` variants

| Variant | Background | Text | Border | Use |
|---------|------------|------|--------|-----|
| `primary` | `--color-accent` | `#0d0f14` | none | Main CTA (New Assessment, Submit) |
| `secondary` | transparent | `--color-text-primary` | `1px --color-border` | Secondary actions |
| `destructive` | `--color-destructive` | white | none | Delete, remove actions |
| `ghost` | transparent | `--color-text-secondary` | none | Nav links, minor actions |

All buttons: height 36px, padding `0 14px`, radius-sm, text-label weight.

### `Badge` / `StatusBadge`

Inline pill using status colour table above. `text-caption`, `font-weight: 500`, `border-radius: radius-sm`, padding `2px 8px`.

Existing `assessment-status.tsx` component must be updated to use these tokens.

### `EmptyState`

Centred column layout:
```
[Icon — lucide-react, 40px, text-secondary]
[Title — text-heading-md]
[Body — text-body, text-secondary, max-width 360px]
[Optional CTA Button — primary]
```

Background: `--color-surface`, `border-radius: radius-md`, padding `48px 24px`.

### `LoadingState` (skeleton)

Tailwind `animate-pulse` on rounded divs matching the shape of the content they replace:
- List items: full-width `h-10` surface-raised blocks, `radius-sm`, `4px` gap
- Score number: centred `w-24 h-16` block

### `FormField`

```
<label>    — text-label, text-primary, margin-bottom: 4px
<input>    — full-width, surface bg, border (--color-border), radius-sm,
             text-body, text-primary, padding: 8px 12px
             focus: outline none, ring 2px --color-accent
<p.error>  — text-caption, --color-destructive, margin-top: 4px
```

---

## Bootstrap Tasks

These must be completed **before** any feature can use this design system. Each is a separate GitHub issue implemented via `/feature`.

| Order | Title | What |
|-------|-------|------|
| 1 | `chore: install frontend dependencies` | Install `tailwindcss`, `postcss`, `autoprefixer`; run `shadcn/ui` init (blank config); install `lucide-react`; install `@fontsource` packages or confirm `next/font/google` works offline |
| 2 | `chore: create globals.css and tailwind.config.ts` | Create `src/app/globals.css` with `@tailwind` directives and `:root` CSS variables; create `tailwind.config.ts` extending colours, font sizes, spacing, radius, shadow per this spec |
| 3 | `chore: apply fonts and globals to root layout` | Update `src/app/layout.tsx` — import `globals.css`; load Syne + Outfit via `next/font/google`; apply font CSS variables to `<html>` |
| 4 | `chore: apply layout shell to authenticated layout` | Update `src/app/(authenticated)/layout.tsx` — apply NavBar shell classes; style the `<main>` wrapper per the layout shell spec |
| 5 | `chore: create shared UI primitives (Button, Card, Badge, PageHeader)` | Create `src/components/ui/` with the four foundational components; update existing `StatusBadge` to use status colour tokens |

**After task 5 is merged**, feature #158 (org context settings panel) and all subsequent UI features may implement against this system.

---

## Design Contract

Once this document is approved, the following rules apply to all UI work:

1. **Use only defined tokens.** Never use arbitrary hex values or hard-coded pixel sizes that have a token equivalent.
2. **No new fonts.** Syne and Outfit are the only permitted typefaces.
3. **No light mode components.** Do not add `dark:` Tailwind variants — the UI is dark-only for MVP.
4. **Deviations require a doc update.** If a feature genuinely needs a new token or pattern, update this document in the same PR.
5. **`/pr-review-v2` checks design conformance.** Reviewers should verify components use system tokens, not arbitrary values.
