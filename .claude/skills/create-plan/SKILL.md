---
name: create-plan
description: Create a detailed implementation plan for a feature, phase, or epic, derived from an existing HLD. Use when an HLD already exists and a phase or epic needs planning. Do NOT use for initial project bootstrap — use /kickoff instead, which owns HLD + plan together. See ADR-0021.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Create Implementation Plan

Produces a plan doc shaped around the **epic/task model** (ADR-0018) so it hands
off cleanly to `/architect epic <n>`.

## Usage

- `/create-plan` — free-form; ask the user what to plan.
- `/create-plan docs/requirements/req-<name>.md` — plan from a requirements doc.
- `/create-plan docs/adr/NNNN-<title>.md` — plan from an ADR.
- `/create-plan <issue-number>` — plan from an existing GitHub issue.

## Process

1. **Read the input** fully. Also read everything it references: ADRs in
   `docs/adr/`, requirements in `docs/requirements/`, existing LLDs in
   `docs/design/`, and relevant source files.
2. **Check existing state**: `gh issue list --state open --limit 50` and a scan
   of `docs/design/` to avoid duplicating epics, tasks, or LLDs that already
   exist. Note anything the new work supersedes.
3. **Clarify before writing**: present your understanding and any open questions
   in chat. Do not write the plan with open questions — resolve them first.
4. **Propose the epic + task breakdown** (see decomposition rules below) and get
   approval before writing the full plan.
5. **Write the plan** to `docs/plans/YYYY-MM-DD-<short-name>.md`.
6. **Report next step**: `/architect epic <n>` once the epic issue is created,
   or `/architect <plan-path>` if no epic issue yet.

## Decomposition Rules (from ADR-0018 + `/architect`)

- One **epic** = one deliverable feature. The plan produces exactly one epic
  unless the input genuinely covers multiple unrelated deliverables.
- **Tasks** are sized for a single `/feature` cycle (< 200 lines of diff).
- Split a task only if **both** hold: > 200 lines estimated **and** a natural
  seam (independently testable, non-overlapping files).
- Each task must name its design artefact need: new LLD, update to existing
  LLD, new ADR, or "covered by existing doc — BDD specs only".
- L1–L5 labels describe design level, not hierarchy — tasks are typically
  `L5-implementation`.

## Plan Template

```markdown
# <Epic Name> Implementation Plan

**Date:** YYYY-MM-DD
**Input:** <path or issue number this plan was generated from>
**Related:** <ADRs, requirements, existing LLDs this plan depends on or supersedes>

## Overview
<What and why, 2–3 sentences. Name the epic.>

## Current State
<What exists today, what is missing, which ADRs/requirements/LLDs apply.
Explicitly note anything this plan supersedes.>

## Desired End State
<Specification of done and how to verify it — at epic level, not per task.>

## Out of Scope
<Explicitly list what we are NOT doing. Pull from the requirements'
Non-Goals / Out of Scope section if present.>

## Approach
<High-level strategy and reasoning. Reference the design-down level this
plan sits at (usually Level 5 — Implementation, assuming Levels 1–4 exist).>

## Epic

**Title:** <epic title>
**Label:** `epic`
**Success criteria:**
- [ ] <criterion 1>
- [ ] <criterion 2>

## Tasks

### Task 1: <task title>
- **Scope:** <one-sentence what>
- **Files touched:** `<path>`, `<path>`
- **Design artefact:** <new LLD `lld-<epic-slug>-<task-slug>.md` | update existing LLD | ADR needed | covered by existing>
- **Depends on:** <none | Task N>
- **Estimated size:** <lines of diff>
- **Acceptance criteria:**
  - [ ] <from requirements>
- **BDD sketch:**
  ```
  describe('...')
    it('...')
  ```

### Task 2: ...

## Risks and Mitigations
<What could go wrong and how we handle it.>

## References
- <ADRs, requirements, related docs — all by path>

## Next Step

1. Create the epic issue on the project board (body = Epic section above).
2. Run `/architect epic <epic-issue-number>` to produce per-task LLDs and
   task issues.
```

## Key Principles

- **No open questions** in the final plan. Stop and resolve them in chat.
- **Epic-shaped, not phase-shaped.** Phases belong to the old organisation;
  new work uses epics per ADR-0018.
- **Source of truth is repo docs.** Reference ADRs, requirements, and LLDs by
  path — do not restate their content.
- **Separate automated from manual verification** in success criteria.
- **British English** in all documentation.
- **Do not create issues or design artefacts here.** This skill produces the
  plan document only. `/architect` creates epic/task issues and LLDs.
