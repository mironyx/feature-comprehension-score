# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Feature Comprehension Score Tool

## Project Context

A tool that measures whether engineering teams understand what they built, using Peter Naur's Theory Building framework. Generates comprehension assessments from development artefacts (requirements, design docs, code, tests), collects team responses, scores against a fixed rubric, and produces reports.

This project is also a deliberate case study: we apply our own Engineering Delivery Framework to build it ("dogfooding"). Every process decision and artefact contributes to validating both the framework and the metric.

**Key references (read when relevant, not every session):**
- `engineering-delivery-framework.md` — The full framework (metrics, patterns, playbook)
- `feature-comprehension-score-article.md` — The published article explaining the FCS metric
- `feature-comprehension-tool-plan.md` — Implementation plan with phases and success criteria
- `docs/adr/` — Architecture Decision Records (design justification artefacts)
- `docs/requirements/` — Requirements documents

## Current Phase

**Phase 0: Foundation** — Requirements, design documents, ADRs, project structure.
Tech stack is NOT yet decided. Do not assume any language or framework.

## How to Work

- **Small PRs.** Target < 200 lines. This is a tracked quality gate.
- **Document decisions as ADRs.** Use `/create-adr` skill. Every significant technical choice gets recorded — these become artefacts for our own FCS assessment.
- **British English** in all documentation and comments.
- **Markdown** for all documentation. Use consistent heading hierarchy.
- **Ask before assuming.** If a requirement is ambiguous, ask — don't infer.

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
- `/drift-scan` — Run garbage collection scan for drift between requirements and design artefacts

## Custom Agents

- `requirements-design-drift` — Read-only agent that scans for misalignment between requirements and design documents. Produces drift reports with coverage matrices and prioritised recommendations. Inspired by the OpenAI Codex "garbage collection" pattern.
