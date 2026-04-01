# Session 4 — Install frontend dependencies (#162)

**Date:** 2026-04-01
**Issue:** #162 — chore: install frontend dependencies (Tailwind, shadcn/ui, lucide-react)
**PR:** #167
**Branch:** `feat/frontend-deps`

## Work completed

- Installed Tailwind CSS v3.4.19, PostCSS 8.5.8, autoprefixer 10.4.27 as devDependencies
- Installed lucide-react 1.7.0 as dependency
- Installed clsx 2.1.1 and tailwind-merge 3.5.0 as dependencies (shadcn/ui peer deps)
- Created `components.json` — shadcn/ui config (dark mode, CSS variables, no components)
- Created minimal `tailwind.config.ts` with `darkMode: 'class'`
- Created `postcss.config.mjs` with Tailwind and autoprefixer plugins
- Created `src/lib/utils.ts` with `cn()` utility (standard shadcn/ui helper)
- Fixed pre-existing MD028 markdownlint error in `docs/design/lld-phase-2-demo-ready.md`

## Decisions made

- **Tailwind v3 over v4:** Design doc (`docs/design/frontend-system.md`) specifies "Tailwind CSS v3" and uses `tailwind.config.ts` (a v3 pattern). npm defaulted to v4 — pinned to v3.
- **Manual shadcn/ui init:** Latest `shadcn` CLI (v4.1.2) requires Tailwind v4. Created `components.json` manually instead — standard pattern, same result.
- **LLD sync skipped:** No LLD covers this chore/infrastructure task.

## Review outcome

- PR review: no findings (clean)
- CI: initially failed on pre-existing MD028 error in LLD doc — fixed in second commit
- CI: all 5 jobs green after fix

## Cost retrospective

| Metric | At PR creation | Final | Delta |
|--------|---------------|-------|-------|
| Cost | $1.51 | $2.95 | +$1.44 |
| Output tokens | 8,257 | 16,465 | +8,208 |

**Cost drivers:**
- **CI fix cycle (+$0.50 est):** Pre-existing markdownlint error required a second commit and CI run
- **PR review agent (+$0.50 est):** Single-agent review re-read the full diff context
- **Cost script retries (+$0.44 est):** Background task ID handling caused two retries

**Improvement actions:**
- Run `npx markdownlint-cli2 "**/*.md"` early in the verification step to catch pre-existing errors before push
- For dependency-only PRs, the review agent adds minimal value — consider a lighter check

## Next steps

- Bootstrap task 2: create `globals.css` and flesh out `tailwind.config.ts` with design tokens
- Bootstrap task 3: apply fonts and globals to root layout
- Bootstrap task 4: apply layout shell to authenticated layout
- Bootstrap task 5: create shared UI primitives
