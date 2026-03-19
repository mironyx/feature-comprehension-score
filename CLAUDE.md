# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Feature Comprehension Score Tool

Measures whether engineering teams understand what they built, using Peter Naur's Theory Building framework. Also a dogfooding case study for our own Engineering Delivery Framework.

## Current Phase

**Phase 0.5: Scaffolding & Infrastructure** — Project initialisation, test infrastructure, CI/CD, architecture guardrails.
Tech stack: Next.js (App Router), TypeScript, Supabase (PostgreSQL + Auth + RLS), Anthropic Claude API, GCP Cloud Run.
Development approach: TDD/BDD-first, PR-based workflow, specialised role agents (Tester → Developer → Reviewer).
See [implementation plan](docs/plans/2026-03-09-v1-implementation-plan.md) for full details.

## Task Tracking

- **Project board** — Check `gh project item-list 1 --owner leonids2005` for current task statuses and priorities.
- **GitHub Issues** — source of truth for what needs doing. Use `gh issue` to create, update, close.
- **Plan files** (`docs/plans/`) — execution context for how work gets done. Agents read/write these locally.
- **Labels:** `L1-capabilities` through `L5-implementation` map to design-down levels.
- **Milestones:** map to project phases.
- **Board columns:** Todo, Blocked, In Progress, Done. Items in Todo are ordered by priority (highest at top).
- **Flow:** Issue created → added to board → agent works with local plan file → updates board status → closes issue on completion.
- **No work without an issue.** If a task has no GitHub issue, create one before starting work.

### Project Board IDs (stable — do not re-query)

| Entity       | ID                               |
| ------------ | -------------------------------- |
| Project      | `PVT_kwHOAOSb584BQzxy`           |
| Status field | `PVTSSF_lAHOAOSb584BQzxyzg-0mow` |
| Todo         | `8ecf3a65`                       |
| Blocked      | `942c7ae6`                       |
| In Progress  | `b4f43653`                       |
| Done         | `38eaf939`                       |

**Status helper** — see [scripts/gh-project-status.sh](scripts/gh-project-status.sh):

- **New issue** (add to board + set status in one step): `./scripts/gh-project-status.sh add <issue-number> [status]` (default status: `todo`)
- **Existing board item** (update status only): `./scripts/gh-project-status.sh <issue-number> <status>`

Status values: `todo` | `blocked` | `"in progress"` | `done`

## Key References

Read when relevant, not every session. CLAUDE.md tells Claude **where to look**, not what to know.

| Document            | Path                                                | Purpose                                               |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| FCS article         | `local-docs/feature-comprehension-score-article.md` | The published metric explanation                      |
| Requirements plan   | `docs/plans/2026-03-03-v1-requirements-plan.md`     | V1 requirements context                               |
| Implementation plan | `docs/plans/2026-03-04-implementation-plan.md`      | Phases and success criteria                           |
| ADRs                | `docs/adr/`                                         | Architecture Decision Records                         |
| V1 requirements     | `docs/requirements/v1-requirements.md`              | User stories and acceptance criteria                  |
| Design docs         | `docs/design/`                                      | Component and interaction design                      |
| Drift reports       | `docs/reports/`                                     | Garbage collection output                             |
| Session logs        | `docs/sessions/`                                    | Per-session record of work, decisions, and next steps |

## Design-Down Process

All features follow five levels, completed in order. No code until Level 5.

1. **Capabilities** — What does the system need to do?
2. **Components** — What are the building blocks?
3. **Interactions** — How do components communicate?
4. **Contracts** — What are the interfaces?
5. **Implementation** — Write the code. Only after Level 4 is approved.

## How to Work

- **Small PRs.** Target < 200 lines. This is a tracked quality gate.
- **Document decisions as ADRs.** Use `/create-adr` skill. Every significant technical choice gets recorded — these become artefacts for our own FCS assessment.
- **British English** in all documentation and comments.
- **Markdown** for all documentation. Use consistent heading hierarchy. Wrap bare URLs in angle brackets (`<https://...>`) to pass markdownlint MD034.
- **Ask before assuming.** If a requirement is ambiguous, ask — don't infer.
- **One commit per completed task.** Use conventional commit messages referencing the issue number.
- **PR-based workflow.** Feature branches (`feat/`, `fix/`, `chore/`), PR targeting `main`, two-stage review (Claude agent first-pass, human final approval). During review, check design adequacy: were the design contracts precise enough to implement from? If not, update `docs/design/` in the same PR.
- **TDD/BDD-first.** See [TDD Discipline](#tdd-discipline) below.

## TDD Discipline

Strict Red-Green-Refactor. No exceptions.

1. **RED** — Write a failing test first. Run it. Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. No more.
3. **REFACTOR** — Clean up while tests stay green. Apply SOLID principles here.

Rules:

- Never write implementation code without a failing test.
- One test at a time. Do not batch a test suite then implement.
- Tests exercise behaviour through public interfaces, not implementation details.
- Tests read as specifications (BDD: `Given/When/Then` in `describe`/`it` blocks).
- Run tests after every change — `npx vitest run` for unit, `npx tsc --noEmit` for types.

## Coding Principles

- **SOLID** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion. Apply during refactoring, not as upfront ceremony.
- **Clean Architecture** — `src/lib/engine/` is pure domain logic: no framework imports, no I/O, no Supabase/Next.js dependencies. Depend inward, never outward.
- **Dependency Inversion at boundaries** — Engine depends on interfaces (ports). Adapters (`github/`, `supabase/`) implement them. Inject dependencies, don't import concrete implementations into domain code.
- **Functions over classes** unless state management genuinely requires it. Prefer composition over inheritance.
- **Types as documentation** — Use discriminated unions, branded types, and Zod schemas. Avoid `any` and type assertions.
- **FIRST tests** — Fast, Independent, Repeatable, Self-validating, Timely.

## Session Guidance

Not enforced ceremony — use judgement. Session boundaries are informal.

- **Orientation:** Read the latest session log in `docs/sessions/` and check the project board.
- **Per-task:** Move issue to In Progress, do the work, commit referencing issue number, close issue, unblock downstream issues (Blocked → Todo).
- **Wrapping up:** Write a session log to `docs/sessions/YYYY-MM-DD-session-N.md` capturing completed work, decisions made, and next steps. Push to remote.

## Code Quality — Diagnostics Pipeline

CodeScene (and other VS Code extensions) report code health issues via VS Code's diagnostics API (Problems tab). A custom VS Code extension (`diagnostics-exporter`) reads these diagnostics and writes them to `.diagnostics/`, mirroring the source tree structure (e.g., `src/lib/engine/scoring.ts` -> `.diagnostics/src/lib/engine/scoring.ts`).

**Two feedback channels:**

1. **Automatic (hook)** — A PostToolUse hook on Write/Edit waits 3s for the extension to export, then injects diagnostics as inline context. Configured in `.claude/settings.json`. No action needed — diagnostics appear automatically after editing source files.
2. **Manual (`/diag`)** — Batch check across all changed files. Use before committing or when you want a full scan. Accepts optional file arguments.

- Review and fix diagnostics before considering a task complete.
- Pay particular attention to: code health decline, complex conditionals, brain methods, bumpy road patterns, and deeply nested logic.
- If a diagnostic conflicts with a design decision, document the trade-off as a comment rather than silently ignoring it.
- Do not suppress or disable diagnostic rules without discussing with the user first.

## Verification Commands

- Markdown lint: `npx markdownlint-cli2 "**/*.md"`
- Spell check: `npx cspell "**/*.md"`
- Type check: `npx tsc --noEmit`
- Unit tests: `npx vitest run`
- E2E tests: `npx playwright test`
- Lint: `npm run lint`
- Build: `npm run build`
- Supabase reset: `npx supabase db reset`

**Note:** Markdown linting runs automatically after Write/Edit operations via post-tool-use hooks (configured in [settings.json](settings.json)).

## Project Structure

```
docs/
  adr/              # Architecture Decision Records (NNNN-title.md)
  requirements/     # Requirements documents per phase
  design/           # Design documents
  plans/            # Implementation and workflow plans
  reports/          # Drift reports and garbage collection output
  sessions/         # Per-session logs (YYYY-MM-DD-session-N.md)
src/
  app/              # Next.js App Router (pages, API routes, layouts)
  lib/
    engine/         # Assessment engine — pure business logic (no framework imports)
    github/         # GitHub API client (Octokit wrapper)
    supabase/       # Supabase client, helpers, type-safe queries
  types/            # Shared TypeScript types and Zod schemas
supabase/
  migrations/       # SQL migration files (YYYYMMDDHHMMSS_name.sql)
  seed.sql          # Test seed data
tests/
  e2e/              # Playwright E2E tests (*.e2e.ts)
  fixtures/         # Test fixtures (LLM responses, GitHub API payloads)
  mocks/            # MSW handlers for external APIs
  helpers/          # Test utilities, factories, auth helpers
```

## Conventions

- ADR format: `docs/adr/NNNN-title.md` using the template in `/create-adr`
- Commit messages: conventional commits (`feat:`, `docs:`, `fix:`, `chore:`)
- **No Co-Authored-By trailers** in commit messages.
- Branch naming: `feat/short-description`, `docs/short-description`

## Custom Skills

- `/feature` — Autonomous implementation cycle: picks top Todo item (or specified issue), creates branch, TDD implementation, `/review`, `/diag`, commit, PR. Stops after PR creation for human review.
- `/feature-cont` — Continue an in-progress feature in a new session when context was exhausted. Reconstructs state from git + issue body, registers the new session in the prom file (append, not overwrite), resumes TDD. Usage: `/feature-cont` (auto-detects from prom file) or `/feature-cont 123`.
- `/feature-end` — Post-review wrap-up: writes session log, commits remaining changes, merges PR (with approval), switches to parent branch, cleans up local branch, updates project board.
- `/create-adr` — Create Architecture Decision Records for significant technical decisions
- `/create-plan` — Create detailed implementation plans for features or work phases
- `/diag` — Batch check VS Code extension diagnostics for changed files before committing
- `/lld` — Generate Low-Level Design documents for a phase or section. Usage: `/lld phase2` (all sections) or `/lld 2.3` (single section). Produces LLDs with implementation detail, file paths, types, and task breakdowns.

## Custom Commands

- `/drift-scan` — Run garbage collection scan for drift between requirements and design artefacts
- `/retro` — Run a process retrospective: review sessions, assess process health, produce improvement actions

## Custom Agents

- `requirements-design-drift` — Read-only agent that scans for misalignment between requirements and design documents. Produces drift reports with coverage matrices and prioritised recommendations. Inspired by the OpenAI Codex "garbage collection" pattern.
- `diagnostics-checker` — Background agent that reads VS Code extension diagnostics from `.diagnostics/` after code changes. Launch after writing/editing source files to catch code quality issues before committing.
