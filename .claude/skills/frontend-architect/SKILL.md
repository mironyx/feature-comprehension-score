---
name: frontend-architect
description: Establish the frontend design system before any UI feature work. Surveys existing pages and components, commits to a bold aesthetic direction (drawing on /frontend-design thinking), chooses a CSS framework, defines design tokens, and produces docs/design/frontend-system.md as the spec all subsequent /feature agents implement against. Stops for human review before implementation.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, TodoWrite
---

# Frontend Architect

Establishes the frontend design system for the project. This skill runs **once** before UI feature work begins. Its output — `docs/design/frontend-system.md` — becomes the mandatory design reference for every subsequent UI feature, the same way ADRs and LLDs govern backend decisions.

**Model:** Use Opus for this skill. When launching sub-agents, pass `model: "opus"`.

**Usage:**

- `/frontend-architect` — surveys the codebase and produces the design system spec

## Process

### Step 1: Survey the existing frontend

Read all of the following to understand what already exists:

1. `src/app/layout.tsx` — root layout (fonts, global CSS imports)
2. `src/app/(authenticated)/layout.tsx` — authenticated shell
3. All `src/app/**/*.tsx` pages — page structure and content
4. All `src/components/**/*.tsx` — existing components
5. `package.json` — check for any existing CSS/UI framework dependencies
6. Any `.css` files under `src/`
7. `tailwind.config.*` if present
8. `docs/design/` — check if any frontend design decisions already exist
9. `docs/adr/` — check for relevant ADRs (e.g., CSS framework choices)

Summarise what you find:
- How many pages exist and what they do
- What components exist
- What CSS/styling approach (if any) is currently in use
- What is visually missing (layout, typography, colour, spacing)

### Step 2: Commit to an aesthetic direction

Draw on the `/frontend-design` approach: **do not default to generic "AI slop"**.

Consider the product context:
- **Audience:** engineering teams and engineering managers
- **Purpose:** measure and surface team knowledge through structured assessments
- **Tone options:** refined/utilitarian (think Linear, Vercel), editorial/data-forward (think Grafana, Retool), minimal/focused (think Notion, Linear)

Choose a **specific, intentional aesthetic** and justify it. Document:

- **Aesthetic direction:** one sentence describing the visual character (e.g., "refined dark-mode utility tool — think Linear meets a developer dashboard")
- **Why it fits:** one sentence on why this suits the product and audience
- **What makes it memorable:** one distinctive design choice (e.g., subtle grid lines, a strong typographic hierarchy, a specific accent colour)

**Avoid:** purple gradients, Inter + white backgrounds, generic SaaS blue, cookie-cutter Tailwind defaults.

### Step 3: Choose the CSS/component approach

Evaluate and decide:

| Concern | Options | Recommendation |
|---------|---------|----------------|
| CSS framework | Tailwind CSS, CSS Modules, styled-components | Tailwind CSS (standard for Next.js App Router) |
| Component primitives | shadcn/ui (Radix + Tailwind), Radix bare, Headless UI | shadcn/ui — unstyled accessibility primitives with full Tailwind control |
| Icons | lucide-react, heroicons, phosphor | lucide-react (used by shadcn/ui) |
| Fonts | Google Fonts via `next/font`, local fonts | `next/font/google` — zero layout shift |

Record the final choices. If you deviate from the recommendations, document why as an ADR using `/create-adr`.

### Step 4: Define design tokens

Commit to specific values. Do not use vague descriptions — every token must be an exact CSS variable value or Tailwind config entry.

#### Colour palette

Choose 5–7 colours. Name them semantically:

```css
--color-background:    /* page background */
--color-surface:       /* card / panel background */
--color-surface-raised: /* elevated surface (dropdown, modal) */
--color-border:        /* subtle dividers */
--color-text-primary:  /* headings, labels */
--color-text-secondary: /* supporting text, captions */
--color-accent:        /* CTAs, active states, links */
--color-destructive:   /* errors, delete actions */
```

Pick light mode, dark mode, or both — document the choice and reason.

#### Typography

Choose two fonts with rationale:

```
Display font: [name] — [why: character, associations, contrast with body]
Body font:    [name] — [why: readability, pairing, availability]
```

Define the type scale (map to Tailwind `fontSize` config or CSS variables):

| Token | Size | Weight | Use |
|-------|------|--------|-----|
| `text-heading-xl` | e.g. 2rem | 700 | Page titles |
| `text-heading-lg` | | | Section headings |
| `text-heading-md` | | | Card titles |
| `text-body` | | | Body copy |
| `text-label` | | | Form labels, table headers |
| `text-caption` | | | Metadata, timestamps |

#### Spacing & layout

```
Page max-width:   e.g. 1280px
Content padding:  e.g. 24px (mobile), 48px (desktop)
Section gap:      e.g. 32px
Card padding:     e.g. 20px
```

#### Border radius & shadow

```
Radius-sm:  e.g. 4px  — inputs, badges
Radius-md:  e.g. 8px  — cards, panels
Radius-lg:  e.g. 12px — modals, dialogs
Shadow-sm:  e.g. 0 1px 3px rgba(0,0,0,0.1)
Shadow-md:  e.g. 0 4px 16px rgba(0,0,0,0.15)
```

### Step 5: Define the layout shell

Describe the page structure all authenticated pages will share:

```
AuthenticatedLayout
  ├── NavBar (top, full-width)
  │   ├── Logo / app name
  │   ├── Primary nav links
  │   ├── OrgSwitcher
  │   └── User menu (username, sign-out)
  └── <main> (centred, max-width, horizontal padding)
      └── page content
```

Specify:
- NavBar height, background, border
- Whether a sidebar is needed (probably not for MVP)
- Page header pattern (title + optional subtitle + optional actions)
- Whether pages use a card container or full-bleed layout

### Step 6: Define shared component patterns

For each component that multiple pages will need, specify the expected visual pattern:

| Component | Description |
|-----------|-------------|
| `PageHeader` | Page title + optional subtitle + optional right-side action button |
| `Card` | Surface container with padding and border |
| `Button` variants | Primary, secondary, destructive, ghost — with size variants |
| `Badge` | Status pill for assessment states (pending, ready, etc.) |
| `EmptyState` | Centred illustration area + message + optional CTA |
| `LoadingState` | Skeleton or spinner pattern |
| `FormField` | Label + input + error message layout |

These are **patterns**, not full implementations — enough for `/feature` agents to know what to produce.

### Step 7: Produce docs/design/frontend-system.md

Write the design system document combining all decisions from Steps 1–6.

Structure:

```markdown
# Frontend Design System

## Document Control
[version, date, status]

## Aesthetic Direction
[one paragraph: what it looks like, why, what's memorable]

## Technology Choices
[CSS framework, component library, icons, fonts — with rationale]

## Colour Tokens
[CSS variable definitions + palette rationale]

## Typography
[font choices, type scale table]

## Spacing & Layout
[tokens, page shell diagram]

## Component Patterns
[table of shared components with visual description]

## Bootstrap Tasks
[ordered list of what must be done before any feature uses this system]
```

The **Bootstrap Tasks** section is critical — it lists the one-time setup work that must happen before any feature can use the design system:

1. Install dependencies (`tailwindcss`, `shadcn/ui` init, `lucide-react`, fonts)
2. Create `src/app/globals.css` with CSS variables and Tailwind base
3. Create `tailwind.config.ts` with extended tokens
4. Update `src/app/layout.tsx` to import globals.css and set font variables
5. Update `src/app/(authenticated)/layout.tsx` with the layout shell styles

Each bootstrap task should become a GitHub issue.

### Step 8: Create bootstrap GitHub issues

For each bootstrap task in Step 7, check if an issue already exists. If not, create one:

```bash
gh issue create \
  --title "chore: [task title]" \
  --body "Bootstrap task for the frontend design system.\n\nDesign reference: docs/design/frontend-system.md\n\n## What\n[description]\n\n## Acceptance criteria\n- [ ] [criterion]"
```

Add each new issue to the project board:

```bash
bash scripts/gh-project-status.sh add <issue-number> todo
```

### Step 9: Commit the design system doc

```bash
git add docs/design/frontend-system.md
git commit -m "docs: frontend design system spec — aesthetic direction, tokens, layout shell"
```

### Step 10: Report and stop

Present a summary:

- Aesthetic direction chosen (one sentence)
- CSS/component approach
- Key token decisions (background, accent, fonts)
- Bootstrap issues created (numbers + titles)
- Next step: human reviews `docs/design/frontend-system.md`, approves, then bootstrap issues run through `/feature`

**Stop here.** Do not implement. The user reviews the spec before any code is written.

## Guidelines

- **Do not implement.** This skill produces a design spec and bootstrap issues only — no production code, no `globals.css`, no `tailwind.config.ts`.
- **Be specific.** Every token must be an exact value. "A neutral dark palette" is not a token. `--color-background: #0f1117` is.
- **Be bold.** Generic defaults (Inter, white background, blue accent) are explicitly forbidden. The design must have a point of view.
- **Respect existing structure.** Work with the existing Next.js App Router layout hierarchy, not against it.
- **British English** in all documentation.
- **One ADR if a non-obvious technology choice is made.** If you choose something other than Tailwind + shadcn/ui, document why.
- **The spec is a contract.** Once approved, `/feature` agents must not deviate from the tokens, fonts, or component patterns without updating the spec first.
