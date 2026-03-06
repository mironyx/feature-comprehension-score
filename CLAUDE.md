# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Feature Comprehension Score Tool

Measures whether engineering teams understand what they built, using Peter Naur's Theory Building framework. Also a dogfooding case study for our own Engineering Delivery Framework.

## Current Phase

**Phase 0: Foundation** — Requirements, design documents, ADRs, project structure.
Tech stack is NOT yet decided. Do not assume any language or framework.

## Task Tracking

- **Project board** — Check `gh project item-list 1 --owner leonids2005` for current task statuses and priorities.
- **GitHub Issues** — source of truth for what needs doing. Use `gh issue` to create, update, close.
- **Plan files** (`docs/plans/`) — execution context for how work gets done. Agents read/write these locally.
- **Labels:** `L1-capabilities` through `L5-implementation` map to design-down levels.
- **Milestones:** map to project phases.
- **Board columns:** Todo, Blocked, In Progress, Done. Items in Todo are ordered by priority (highest at top).
- **Flow:** Issue created → added to board → agent works with local plan file → updates board status → closes issue on completion.

## Key References

Read when relevant, not every session. CLAUDE.md tells Claude **where to look**, not what to know.

| Document | Path | Purpose |
|----------|------|---------|
| FCS article | `local-docs/feature-comprehension-score-article.md` | The published metric explanation |
| Requirements plan | `docs/plans/2026-03-03-v1-requirements-plan.md` | V1 requirements context |
| Implementation plan | `docs/plans/2026-03-04-implementation-plan.md` | Phases and success criteria |
| ADRs | `docs/adr/` | Architecture Decision Records |
| V1 requirements | `docs/requirements/v1-requirements.md` | User stories and acceptance criteria |
| Design docs | `docs/design/` | Component and interaction design |
| Drift reports | `docs/reports/` | Garbage collection output |
| Session logs | `docs/sessions/` | Per-session record of work, decisions, and next steps |

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
- **Markdown** for all documentation. Use consistent heading hierarchy.
- **Ask before assuming.** If a requirement is ambiguous, ask — don't infer.
- **One commit per completed task.** Use conventional commit messages referencing the issue number.

## Session Guidance

Not enforced ceremony — use judgement. Session boundaries are informal.

- **Orientation:** Read the latest session log in `docs/sessions/` and check the project board.
- **Per-task:** Move issue to In Progress, do the work, commit referencing issue number, close issue, unblock downstream issues (Blocked → Todo).
- **Wrapping up:** Write a session log to `docs/sessions/YYYY-MM-DD-session-N.md` capturing completed work, decisions made, and next steps. Push to remote.

## Code Quality — CodeScene Integration

CodeScene is installed as a VS Code extension and reports code health issues in the Problems tab. The VS Code extension shares diagnostics automatically — you can see CodeScene warnings directly.

When writing or modifying code:
- Check VS Code diagnostics after each change for CodeScene warnings.
- Fix CodeScene issues before considering a task complete.
- Pay particular attention to: code health decline, complex conditionals, brain methods, bumpy road patterns, and deeply nested logic.
- If a CodeScene issue conflicts with a design decision, document the trade-off as a comment rather than silently ignoring it.
- Do not suppress or disable CodeScene rules without discussing with the user first.

## Verification Commands

These will be populated once the tech stack is decided. For now:
- Markdown lint: `npx markdownlint-cli2 "**/*.md"`
- Spell check: `npx cspell "**/*.md"`

**Note:** Markdown linting runs automatically after Write/Edit operations via post-tool-use hooks (configured in [settings.json](settings.json)).

## Project Structure

```
docs/
  adr/              # Architecture Decision Records (NNNN-title.md)
  requirements/     # Requirements documents per phase
  design/           # Design documents
  reports/          # Drift reports and garbage collection output
  sessions/         # Per-session logs (YYYY-MM-DD-session-N.md)
src/                # Source code (structure TBD pending tech stack ADR)
tests/              # Test files (structure TBD)
```

## Conventions

- ADR format: `docs/adr/NNNN-title.md` using the template in `/create-adr`
- Commit messages: conventional commits (`feat:`, `docs:`, `fix:`, `chore:`)
- Branch naming: `feat/short-description`, `docs/short-description`

## Custom Skills

- `/create-adr` — Create Architecture Decision Records for significant technical decisions
- `/create-plan` — Create detailed implementation plans for features or work phases

## Custom Commands

- `/drift-scan` — Run garbage collection scan for drift between requirements and design artefacts
- `/retro` — Run a process retrospective: review sessions, assess process health, produce improvement actions

## Custom Agents

- `requirements-design-drift` — Read-only agent that scans for misalignment between requirements and design documents. Produces drift reports with coverage matrices and prioritised recommendations. Inspired by the OpenAI Codex "garbage collection" pattern.
