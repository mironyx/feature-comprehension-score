---
name: drift-scan
description: Run garbage collection scan for drift between requirements, design artefacts, and implemented code. Use when completing a batch of changes, before starting a new phase, or at session end when significant code was written. Produces a drift report in docs/reports/.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Drift Scan — Garbage Collection for Cognitive Debt

Detects misalignment across the full delivery stack: Requirements ↔ Design ↔ Code.

## Instructions

1. **Gather artefacts.** Read all of:
   - `docs/requirements/` — stories, epics, acceptance criteria
   - `docs/design/` — LLDs, HLDs, design spikes
   - `docs/adr/` — architecture decisions
   - `docs/plans/` — implementation plans
   - `src/` — implemented source files relevant to the current phase
   - `CLAUDE.md` — note the current project phase for context

2. **Analyse drift at two levels:**

   **Requirements ↔ Design:** For each requirement/story, check whether a design doc or ADR covers it and whether the coverage is current (not superseded or contradicted).

   **Design ↔ Code:** For each implemented source file, check whether the code conforms to the design contract (field names, enum values, schemas, types, function signatures). Flag:
   - Structural mismatches (wrong field names, missing fields, wrong types)
   - Semantic mismatches (enum values that don't match DB constraints or API contracts)
   - Orphaned code (implemented without a design or requirement backing)
   - Stale design (design doc describes something not yet built — acceptable if in a future phase, flag if in the current phase)

   Classify each finding as:
   - **Critical** — blocks correctness at runtime (e.g., DB constraint violation, schema mismatch on integration boundary)
   - **Warning** — will cause a bug or silent data loss if not fixed before the next integration point
   - **Info** — low-risk gap, cosmetic inconsistency, or future-phase item

3. **Produce coverage matrix.** Table mapping each epic to: design coverage, ADR coverage, code implementation status, and drift status.

4. **Save the report.** Write to `docs/reports/drift/YYYY-MM-DD-drift-report.md` using this structure:

   ```markdown
   # Drift Report: Requirements ↔ Design ↔ Code

   **Scan date:** YYYY-MM-DD
   **Project phase:** [from CLAUDE.md]

   ## Summary

   | Severity | Count |
   |----------|-------|
   | Critical | N |
   | Warning  | N |
   | Info     | N |

   **Overall drift score:** [summary sentence]

   ## Critical Issues
   ## Warnings
   ## Informational
   ## Coverage Matrix

   | Epic | Stories | Designed | ADR'd | Code implemented | Coverage |
   ```

5. **Summarise.** Present:
   - The summary table (Critical / Warning / Info counts)
   - The overall drift score
   - The top 3 most critical findings
   - The file path to the full report
