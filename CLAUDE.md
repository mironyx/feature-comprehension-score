# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Feature Comprehension Score Tool

Measures whether engineering teams understand what they built, using Peter Naur's Theory Building framework. Also a dogfooding case study for our own Engineering Delivery Framework.

## Current Phase

**Phase 0.5: Scaffolding & Infrastructure** — Project initialisation, test infrastructure, CI/CD, architecture guardrails.
Tech stack: Next.js (App Router), TypeScript, Supabase (PostgreSQL + Auth + RLS), OpenRouter (LLM gateway — see ADR-0015), GCP Cloud Run.
Development approach: TDD/BDD-first, PR-based workflow, specialised role agents (Tester → Developer → Reviewer).
See [implementation plan](docs/plans/2026-03-09-v1-implementation-plan.md) for full details.

## Task Tracking

- **Project board** — Check `gh project item-list 2 --owner mironyx` for current task statuses and priorities.
- **GitHub Issues** — source of truth for what needs doing. Use `gh issue` to create, update, close.
- **Plan files** (`docs/plans/`) — execution context for how work gets done. Agents read/write these locally.
- **Labels:** `L1-capabilities` through `L5-implementation` map to design-down levels.
- **Milestones:** map to project phases.
- **Board columns:** Todo, Blocked, In Progress, Done. Items in Todo are ordered by priority (highest at top).
- **Flow:** Issue created → added to board → agent works with local plan file → updates board status → closes issue on completion.
- **No work without an issue.** If a task has no GitHub issue, create one before starting work.

### Epic and Task Organisation

Work is organised into **epics** and **tasks** (see [ADR-0018](docs/adr/0018-epic-task-organisation.md)):

- **Epic** — a container that groups related tasks into a deliverable feature. GitHub issue with the `epic` label. Body contains: scope, success criteria, and a checklist linking child task issues.
- **Task** — a single unit of implementation work. GitHub issue (typically `L5-implementation`). References its parent epic in the body.

Flow: Epic created → tasks broken out as separate issues → tasks added to board → `/feature` implements one task at a time.

**LLD naming:** `docs/design/lld-<epic-slug>-<task-slug>.md` — one LLD per task, anchored to its epic.

**Rules:**
- Every task issue must reference its parent epic.
- L1–L5 labels remain orthogonal — they describe design level, not hierarchy.
- The main HLD (`docs/design/v1-design.md`) stays as the top-level design document. Epics reference sections of it.
- Existing phase-based LLDs (`lld-phase-*`) are not retroactively renamed.

### Project Board IDs (stable — do not re-query)

| Entity       | ID                               |
| ------------ | -------------------------------- |
| Project      | `PVT_kwDOEEi_vs4BToGD`           |
| Project #    | `2`                              |
| Status field | `PVTSSF_lADOEEi_vs4BToGDzhA10G4` |
| Todo         | `8d4368d4`                       |
| Blocked      | `3aacb396`                       |
| In Progress  | `3317982f`                       |
| Done         | `8c0ec0d7`                       |

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
| Runbooks            | `docs/runbooks/`                                    | Ops procedures — e.g. `github-app-key.md` for `GITHUB_APP_PRIVATE_KEY` provisioning, rotation, and incident response |

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
- **Sequential mode (default):** work directly in the main repo directory — no worktrees. This applies to `/feature`, `/feature-end`, and all sub-agents they spawn. The developer needs to see changes live in the same editor instance.
- **Parallel CLI mode (`/feature-team`):** each teammate manages its own git isolation (branch + worktree). Teammates are separate Claude Code processes running via agent teams. Requires Claude Code CLI; not supported in VS Code.
- **Never invoke `/simplify` autonomously.** It is too costly for routine work and redundant with `/pr-review-v2` code quality checks. Only use it if the user explicitly types `/simplify`.
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

- **Read before writing** — Before implementing anything, grep the codebase for existing helpers, patterns, and utilities that solve the same problem. Never re-implement what already exists. This applies to auth helpers, service functions, DB queries, UI components — everything.
- **SOLID** — Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion. Apply during refactoring, not as upfront ceremony.
- **Clean Architecture** — `src/lib/engine/` is pure domain logic: no framework imports, no I/O, no Supabase/Next.js dependencies. Depend inward, never outward.
- **Dependency Inversion at boundaries** — Engine depends on interfaces (ports). Adapters (`github/`, `supabase/`) implement them. Inject dependencies, don't import concrete implementations into domain code.
- **Functions over classes** unless state management genuinely requires it. Prefer composition over inheritance.
- **Types as documentation** — Use discriminated unions, branded types, and Zod schemas. Avoid `any` and type assertions.
- **FIRST tests** — Fast, Independent, Repeatable, Self-validating, Timely.

### Complexity Budget (hard limits)

- Route handler body: ≤ 25 lines
- Any function: ≤ 20 lines. If longer, split.
- Nesting depth: ≤ 3 levels. Flatten with early returns.
- No parameter structs for single-use internal functions.
- No silent catch/swallow without an inline comment explaining why.
- CodeScene warnings on changed files: **blocking** — fix before commit.

## Session Guidance

Not enforced ceremony — use judgement. Session boundaries are informal.

- **Orientation:** Read the latest session log in `docs/sessions/` and check the project board.
- **Per-task:** Move issue to In Progress, do the work, commit referencing issue number, close issue, unblock downstream issues (Blocked → Todo).
- **Wrapping up:** Write a session log to `docs/sessions/YYYY-MM-DD-session-N-<issue-number>.md` capturing completed work, decisions made, and next steps. For non-feature sessions (retro, drift-scan): use `YYYY-MM-DD-session-N-<topic>.md` (e.g., `retro`, `drift`). Push to remote.

## Code Quality — Diagnostics Pipeline

CodeScene (and other VS Code extensions) report code health issues via VS Code's diagnostics API (Problems tab). A custom VS Code extension (`diagnostics-exporter`) reads these diagnostics and writes them to `.diagnostics/`, mirroring the source tree structure (e.g., `src/lib/engine/scoring.ts` -> `.diagnostics/src/lib/engine/scoring.ts`).

**Two feedback channels:**

1. **Automatic (hook)** — A PostToolUse hook on Write/Edit waits 3s for the extension to export, then injects diagnostics as inline context. Configured in `.claude/settings.json`. No action needed — diagnostics appear automatically after editing source files.
2. **Manual (`/diag`)** — Batch check across all changed files. Use before committing or when you want a full scan. Accepts optional file arguments.

- Review and fix diagnostics before considering a task complete.
- Pay particular attention to: code health decline, complex conditionals, brain methods, bumpy road patterns, and deeply nested logic.
- **Ignore smells on generated files** (e.g. `supabase/migrations/`) — these are not hand-authored and cannot be refactored. CodeScene exclusions are configured but may not always catch every generated file.
- If a diagnostic conflicts with a design decision, document the trade-off as a comment rather than silently ignoring it.
- Do not suppress or disable diagnostic rules without discussing with the user first.

## Verification Commands

- Markdown lint: `npx markdownlint-cli2 "**/*.md"`
- Spell check: `npx cspell "**/*.md"`
- Type check: `npx tsc --noEmit`
- Unit tests: `npx vitest run`
- E2E tests: `npx playwright test` — requires a prior `npm run build` (app uses `output: standalone`; `npm run start` runs `node .next/standalone/server.js`). Set placeholder env vars if no real Supabase instance is available: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder-publishable-key SUPABASE_SECRET_KEY=placeholder-secret-key`
- Lint: `npm run lint`
- Build: `npm run build`
- Supabase reset: `npx supabase db reset`
- Supabase diff: `npx supabase db diff` (should produce "No schema changes found" if DB matches schema files)
- Integration tests after db reset: `npx supabase db reset` cycles the DB container but not Kong, breaking port 54321. If integration tests fail with `fetch failed`, run `docker restart supabase_kong_feature-comprehension-score` then re-run.

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
  migrations/       # SQL migration files (YYYYMMDDHHMMSS_name.sql) — generated, not hand-authored
  schemas/          # Declarative schema files (source of truth for current DB state)
    tables.sql      # All CREATE TABLE statements
    functions.sql   # All CREATE OR REPLACE FUNCTION statements
    policies.sql    # All CREATE POLICY + ENABLE ROW LEVEL SECURITY statements
  seed.sql          # Test seed data
tests/
  e2e/              # Playwright E2E tests (*.e2e.ts)
  fixtures/         # Test fixtures (LLM responses, GitHub API payloads)
  mocks/            # MSW handlers for external APIs
  helpers/          # Test utilities, factories, auth helpers
```

## Database Migration Workflow

Supabase uses a **declarative schema** approach. `supabase/schemas/` files are the source of truth; migrations are generated artefacts.

**Making a schema change:**

1. Edit the relevant `supabase/schemas/*.sql` file (tables, functions, or policies).
2. Run `npx supabase db diff -f <migration-name>` to generate a migration.
3. Review the generated migration in `supabase/migrations/`.
4. Add a header comment referencing the issue number and design doc.
5. Run `npx supabase db reset` to verify the migration applies cleanly.
6. Run `npx supabase db diff` — should output "No schema changes found".
7. Commit both the updated schema file and the generated migration together.

**Rules:**

- Never hand-author ALTER migrations. Always edit the schema file and generate the migration.
- SQL files must use LF (Unix) line endings. CRLF causes false positives in `db diff`.
- Always verify `db diff` is empty before committing.

## Conventions

- ADR format: `docs/adr/NNNN-title.md` using the template in `/create-adr`
- Commit messages: conventional commits (`feat:`, `docs:`, `fix:`, `chore:`)
- **No Co-Authored-By trailers** in commit messages.
- Branch naming: `feat/short-description`, `docs/short-description`
- **API route contract types** — every `route.ts` must declare its query/path params and response shapes as inline TypeScript interfaces, with a JSDoc comment on the handler. See [ADR-0014](docs/adr/0014-api-route-contract-types.md) for templates (GET list, GET detail, POST, PUT).

## Custom Skills

- `/architect` — Read a plan and produce all design artefacts in one pass (ADRs, LLDs, design doc updates, enriched issue bodies). Usage: `/architect` (most recent plan) or `/architect <path>`. Stops for human review before implementation.
- `/feature` — Autonomous implementation cycle: picks top Todo item (or specified issue), creates branch, TDD implementation, `/diag`, commit, PR, `/pr-review-v2`. Stops after review for human approval.
- `/feature-end` — Post-review wrap-up: writes session log, commits remaining changes, merges PR (with approval), switches to parent branch, cleans up local branch, updates project board.
- `/feature-team` — Parallel implementation using Claude Code agent teams (CLI only). Each teammate autonomously implements one issue in its own worktree. Usage: `/feature-team 101 102 103` or `/feature-team -n 3`.
- `/create-adr` — Create Architecture Decision Records for significant technical decisions
- `/create-plan` — Create detailed implementation plans for features or work phases
- `/diag` — Batch check diagnostics-exporter output for changed files. Detects, fixes, and verifies resolution.
- `/pr-review-v2` — Review a PR for bugs, CLAUDE.md compliance, design contract adherence, and framework best practices. Usage: `/pr-review-v2 <pr-number>` (posts PR comment) or `/pr-review-v2` (local diff). Adaptive: 1 agent for small diffs, 2 for large.
- `/lld` — Generate Low-Level Design documents for a phase or section. Usage: `/lld phase2` (all sections) or `/lld 2.3` (single section). Produces LLDs with implementation detail, file paths, types, and task breakdowns.
- `/lld-sync` — Sync the LLD back to the implementation after a feature is complete. Compares spec vs what was built, updates the LLD in-place. Run after implementation, before `/feature-end`. Called automatically by `/feature-end` Step 1.5.

If context is exhausted mid-feature, compact will preserve state automatically. For large features, prefer breaking the issue into smaller sub-issues.

## Custom Commands

- `/drift-scan` — Run garbage collection scan for drift between requirements and design artefacts
- `/retro` — Run a process retrospective: review sessions, assess process health, produce improvement actions

## Custom Agents

- `requirements-design-drift` — Read-only agent that scans for misalignment between requirements and design documents. Produces drift reports with coverage matrices and prioritised recommendations. Inspired by the OpenAI Codex "garbage collection" pattern.
- `diagnostics-checker` — Background agent that reads VS Code extension diagnostics from `.diagnostics/` after code changes. Launch after writing/editing source files to catch code quality issues before committing.
