---
description: Run garbage collection scan for drift between requirements and design artefacts. Produces a drift report in docs/reports/.
---

# Drift Scan — Garbage Collection for Cognitive Debt

## What This Does

Runs the requirements-design-drift agent to detect misalignment between what was specified (requirements) and what was designed (design docs, ADRs). Inspired by the OpenAI Codex "garbage collection" pattern from their harness engineering approach.

## Instructions

1. **Delegate to the `requirements-design-drift` agent.** Pass it this task:

   > Scan all artefacts in docs/requirements/, docs/design/, docs/adr/, and docs/plans/.
   > Produce a full drift report following your output format.
   > Include the coverage matrix across all epics.
   > Note the current project phase from CLAUDE.md for context.

2. **Save the report.** Write the agent's output to:
   `docs/reports/YYYY-MM-DD-drift-report.md`
   
   Create the `docs/reports/` directory if it doesn't exist.

3. **Summarise.** After saving, present the user with:
   - The summary table (Critical / Warning / Info counts)
   - The overall drift score
   - The top 3 most critical issues
   - The file path to the full report

## When to Run

- After completing a batch of requirement changes
- After writing or updating design documents
- Before starting a new implementation phase
- As a regular cadence check (e.g., weekly during active development)

## Future Extensions

This is the first of three planned garbage collection agents:
- **requirements-design-drift** (this one) — Requirements ↔ Design alignment
- **design-code-drift** (planned) — Design ↔ Implementation alignment
- **test-coverage-drift** (planned) — Tests ↔ Requirements alignment

Together they form a continuous drift detection pipeline across the full delivery lifecycle.
