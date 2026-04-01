---
name: feature
description: Autonomously implement the next feature from the project board. Picks the top Todo item, creates a branch, implements with TDD, runs diagnostics, commits, creates a PR, runs /pr-review-v2 and fixes any findings, then reports. Only pauses for real blockers.
allowed-tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature — Autonomous Implementation Cycle

Implements a single feature end-to-end without user intervention unless blocked.

**Usage:**

- `/feature` — picks the top Todo item from the project board
- `/feature 123` — works on issue #123 specifically

**Pre-requisite:** The issue's design document (LLD, design doc section, or ADR) must be complete. If not, stop and tell the user.

## Process

Execute these steps sequentially. Do not skip steps. Do not ask for confirmation between steps — only pause if a step fails after remediation attempts.

### Step 1: Pick the work item and tag the session

If `$ARGUMENTS` contains an issue number, use that. Otherwise:

1. Run `gh issue list --label L5-implementation --state open --limit 1` and use the first result.
2. Read the issue body: `gh issue view <number>`.
3. **Validate the issue has enough context:**
   - Design doc or LLD section reference
   - BDD test specs or acceptance criteria
   - If missing, stop and report: "Issue #N lacks [missing item]. Cannot proceed autonomously."

Once the issue number is known, tag the session so it is identifiable in the IDE and in Grafana:

```bash
.claude/hooks/run-python.sh scripts/tag-session.py <issue-number>
```

### Step 2: Create feature branch

1. Derive a short slug from the issue title (e.g., issue #123 "Add scoring engine" → `scoring-engine`).
2. Fetch latest main and create the branch:
   ```bash
   git fetch origin main
   git checkout -b feat/<slug> origin/main
   ```
3. Move the issue to In Progress: `./scripts/gh-project-status.sh <number> "in progress"`.

### Step 3: Invoke feature-core

With the branch checked out and the board item In Progress, hand off to the core implementation cycle:

```
/feature-core <issue-number>
```

This covers: read design → TDD → full verification → silent-swallow check → diagnostics → commit → PR + CI probe → review → report.

## Blocker policy

**Pause and report** if:

- Issue not found on the board or has no L5-implementation label
- Issue lacks a design reference or acceptance criteria (caught in Step 1 validation)

For all other blockers (test failures, type errors, design mismatches, missing dependencies), see the blocker policy in `/feature-core`.
