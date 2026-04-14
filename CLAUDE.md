# CLAUDE.md

Measures whether engineering teams understand what they built, using Peter Naur's Theory Building framework. Also a dogfooding case study for our own Engineering Delivery Framework.

## Behavioural Guidelines

**Think before coding.** State assumptions explicitly. If multiple interpretations exist, present them. If unclear, stop and ask.

**Simplicity first.** Minimum code that solves the problem. No speculative features, abstractions for single-use code, or error handling for impossible scenarios. If 200 lines could be 50, rewrite.

**Surgical changes.** Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only orphans YOUR changes created. Every changed line should trace to the request.

**Goal-driven execution.** Transform tasks into verifiable goals. For multi-step tasks, state a brief plan with verification checks.

## Current Phase

**Phase 1: Core Feature Implementation** — Assessment engine, GitHub integration, Supabase storage, API routes.
Tech stack: Next.js (App Router), TypeScript, Supabase (PostgreSQL + Auth + RLS), OpenRouter (LLM gateway — see ADR-0015), GCP Cloud Run.
See [implementation plan](docs/plans/2026-03-09-v1-implementation-plan.md) for full details.

## Engineering Process

Pipeline: `idea → /discovery → /requirements → /kickoff → /architect → /feature → /feature-end → /retro`.
Full lifecycle: [docs/process/engineering-process.md](docs/process/engineering-process.md). Bootstrap rationale: [ADR-0021](docs/adr/0021-project-bootstrap-pipeline.md).

**Tiered process** ([ADR-0022](docs/adr/0022-tiered-feature-process.md)): Bug → issue + `/feature`. Feature → `/requirements` + `/architect` + `/feature`. Epic/phase → add `/kickoff`. New project → add `/discovery`.

## Task Tracking

- **Project board:** `gh project item-list 2 --owner mironyx`
- **GitHub Issues** — source of truth. **No work without an issue.**
- **Board columns:** Todo (priority-ordered), Blocked, In Progress, Done.
- **Flow:** Issue → board → work → commit (ref issue #) → close issue.
- **Epics & tasks:** see [ADR-0018](docs/adr/0018-epic-task-organisation.md). Epic = container with `epic` label; Task = `kind:task` label, references parent epic.
- **LLD naming:** `docs/design/lld-<epic-slug>-<task-slug>.md`
- Every task issue must reference its parent epic. L1–L5 labels describe design level, not hierarchy.
- Main HLD: `docs/design/v1-design.md`. Epics reference sections of it.

### Board Scripts

Config in [.github/project.env](.github/project.env) — do not hardcode IDs.

- **Status:** `./scripts/gh-project-status.sh add <issue> [status]` | `./scripts/gh-project-status.sh <issue> <status>` | `./scripts/gh-project-status.sh remove <issue>`
- **Create issue:** `./scripts/gh-create-issue.sh` — deduplicates, optional `--add-to-board`, `--labels`. Output: `created:<number>` or `exists:<number>`.

## Key References

Read when relevant, not every session.

| Document | Path |
| --- | --- |
| FCS article | `local-docs/feature-comprehension-score-article.md` |
| Requirements | `docs/requirements/v1-requirements.md` |
| Design docs | `docs/design/` |
| ADRs | `docs/adr/` |
| Plans | `docs/plans/` |
| Session logs | `docs/sessions/` |
| Runbooks | `docs/runbooks/` |

## Design-Down Process

Five levels, in order. No code until Level 5.

1. **Capabilities** — What does the system need to do?
2. **Components** — What are the building blocks?
3. **Interactions** — How do components communicate?
4. **Contracts** — What are the interfaces?
5. **Implementation** — Write the code.

## How to Work

- **Small PRs.** Target < 200 lines.
- **Document decisions as ADRs.** Use `/create-adr`.
- **British English** in all documentation and comments.
- **Markdown** for docs. Wrap bare URLs in angle brackets for MD034.
- **One commit per completed task.** Conventional commits referencing issue number.
- **PR-based workflow.** Feature branches (`feat/`, `fix/`, `chore/`) → PR → `main`. Two-stage review (Claude agent + human).
- **Sequential mode (default):** work in main repo directory — no worktrees. Human needs to see changes in the same editor.
- **Never invoke `/simplify` autonomously.** Only if the user explicitly types it.
- If context is exhausted mid-feature, prefer breaking the issue into smaller sub-issues.

## TDD Discipline

Strict Red-Green-Refactor. No exceptions.

1. **RED** — Write a failing test. Run it. Confirm it fails for the right reason.
2. **GREEN** — Minimum code to pass. No more.
3. **REFACTOR** — Clean up while tests stay green.

- Tests exercise behaviour through public interfaces, not internals.
- BDD style: `Given/When/Then` in `describe`/`it` blocks.
- Run after every change: `npx vitest run` (unit), `npx tsc --noEmit` (types).

## Coding Principles

- **Read before writing** — grep for existing helpers before implementing. Never re-implement what exists.
- **Clean Architecture** — `src/lib/engine/` is pure domain logic: no framework imports, no I/O. Depend inward.
- **Dependency Inversion at boundaries** — Engine depends on interfaces (ports). Adapters implement them.
- **Functions over classes** unless state genuinely requires it.
- **Types as documentation** — discriminated unions, branded types, Zod schemas. Avoid `any` and type assertions.
- **SOLID** during refactoring, not as upfront ceremony.

### Complexity Budget (hard limits)

- Route handler body: ≤ 25 lines. Any function: ≤ 20 lines.
- Nesting depth: ≤ 3 levels. Flatten with early returns.
- No silent catch/swallow without an inline comment explaining why.
- CodeScene warnings on changed files: **blocking** — fix before commit.

## Session Guidance

Use judgement. Session boundaries are informal.

- **Start:** Read latest session log in `docs/sessions/` and check the project board.
- **Per-task:** Move issue to In Progress → work → commit → close issue → unblock downstream (Blocked → Todo).
- **End:** Write session log to `docs/sessions/YYYY-MM-DD-session-N-<issue-number>.md`. Push.

## Code Quality — Diagnostics Pipeline

`diagnostics-exporter` extension writes CodeScene findings to `.diagnostics/`, mirroring `src/` tree structure.

1. **Automatic (hook)** — PostToolUse hook on Write/Edit injects diagnostics after editing source files.
2. **Manual (`/diag`)** — Batch check before committing.

- Fix diagnostics before considering a task complete. Pay attention to: code health decline, complex conditionals, brain methods, bumpy road patterns, deeply nested logic.
- **Ignore generated files** (e.g. `supabase/migrations/`).
- If a diagnostic conflicts with a design decision, document the trade-off as a comment.
- Do not suppress diagnostic rules without discussing first.

## Verification Commands

| Command | Purpose |
| --- | --- |
| `npx tsc --noEmit` | Type check |
| `npx vitest run` | Unit tests |
| `npm run lint` | Lint |
| `npm run build` | Build |
| `npx playwright test` | E2E (requires `npm run build` first) |
| `npx markdownlint-cli2 "**/*.md"` | Markdown lint |
| `npx cspell "**/*.md"` | Spell check |
| `npx supabase db reset` | Reset DB |
| `npx supabase db diff` | Verify no schema drift |

E2E placeholder env vars: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-publishable-key SUPABASE_SECRET_KEY=placeholder-secret-key`
After `db reset`, Kong may lose port 54321 — fix: `docker restart supabase_kong_feature-comprehension-score`

## Key Directories

- `src/lib/engine/` — pure domain logic (no framework imports, no I/O)
- `src/lib/github/` — GitHub API adapter (Octokit)
- `src/lib/supabase/` — Supabase adapter
- `src/app/` — Next.js App Router (pages, API routes, layouts)
- `src/types/` — shared TypeScript types and Zod schemas
- `supabase/schemas/` — declarative schema (source of truth)
- `supabase/migrations/` — generated, not hand-authored
- `tests/` — `e2e/`, `fixtures/`, `mocks/`, `helpers/`

## Database Migration Workflow

Declarative schema: `supabase/schemas/` is source of truth; migrations are generated.

1. Edit `supabase/schemas/*.sql` → 2. `npx supabase db diff -f <name>` → 3. Review → 4. `npx supabase db reset` → 5. Verify `db diff` is empty → 6. Commit schema + migration together.

- Never hand-author ALTER migrations. SQL files must use LF line endings.

## Conventions

- ADR format: `docs/adr/NNNN-title.md`
- Commits: conventional (`feat:`, `docs:`, `fix:`, `chore:`). **No Co-Authored-By trailers.**
- Branches: `feat/short-description`, `docs/short-description`
- **API route contracts** — every `route.ts` declares query/path params and response shapes as inline TypeScript interfaces. See [ADR-0014](docs/adr/0014-api-route-contract-types.md).
