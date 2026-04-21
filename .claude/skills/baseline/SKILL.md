---
name: baseline
description: Reconcile reality (code, issues, docs, git history) into a consolidated as-built requirements document. Produces a point-in-time snapshot in docs/reports/baseline/. Use at phase transitions, before from-scratch reimplementations, or when requirements docs feel stale. Propose-only — never mutates requirements, design, or issues.
allowed-tools: Read, Write, Bash, Glob, Grep, WebFetch
---

# Baseline — Requirements Reconciliation

Produces a consolidated picture of what actually exists, reconciling code, closed issues, design docs, and ADRs into a single as-built requirements snapshot.

## Ground rule — propose-only

This skill **never** mutates state:

- No edits to `docs/requirements/`, `docs/design/`, `docs/adr/`, or `CLAUDE.md`.
- No `gh issue create`, `gh issue edit`, `gh issue close`.
- No `gh-project-status.sh` calls.

Write only the report file in `docs/reports/baseline/`.

## Instructions

### 1. Gather data

Read broadly. The goal is to build a complete picture, not sample.

**Requirements — read ALL files in `docs/requirements/`:**
- Current version (e.g. `v1-requirements.md`) — the intended spec.
- Future versions (`v2-requirements.md`, etc.) — note which stories are in-scope vs deferred.
- Proposed additions, domain-specific docs — anything in that directory.

**Design docs:**
- `docs/design/` — all LLDs and HLDs. Note which describe implemented vs planned features.
- `docs/adr/` — decisions that shaped what was built. Note superseded ADRs.
- `docs/plans/` — implementation plans. Note which phases/sections are complete.

**Implemented code:**
- `src/` — survey the actual source tree. Map directories to capabilities.
- `src/lib/engine/` — pure domain logic, the core of what exists.
- `src/app/` — API routes and pages, the external surface area.
- `src/types/` — Zod schemas and TypeScript types define the actual contracts.
- `supabase/schemas/` — database schema, the persistence layer truth.

**Tests as coverage indicators:**
- Scan `tests/` and co-located `*.test.ts` files. For each story you are uncertain about, check whether a test exists that exercises the specific AC. A test that asserts "only the participant's own assessments are returned" is stronger evidence of delivery than reading the query in isolation. Conversely, a missing test for a claimed AC is a signal to read the implementation more carefully before classifying as Delivered.

**Closed issues and git history:**
- `gh issue list --state closed --limit 300 --json number,title,labels,closedAt,body` — what was delivered.
- `git log --oneline --all` — commit history to trace what was built and when.

**Reports:**
- Most recent `docs/reports/drift/*-drift-report.md` — known mismatches.
- Most recent `docs/reports/baseline/*` — previous baseline, if any, for delta.

### 2. Reconcile: code vs docs

For each epic/story in the requirements docs, determine its actual status by cross-referencing code:

| Status | Meaning |
|--------|---------|
| **Delivered** | Code exists, tests pass (or existed and were verified), matches spec intent. |
| **Partial** | Some acceptance criteria met, others missing or divergent. |
| **Divergent** | Code exists but behaves differently from spec. Document what it actually does. |
| **Not started** | No code exists. Expected if in a future phase. |
| **Descoped** | Was in requirements but explicitly removed or deferred (ADR, session log, or issue close reason). |

**Code is primary.** When code and docs disagree, record what the code does and flag the discrepancy. Do not silently adopt the doc version.

**AC-level verification, not file-level.** For any story you are about to classify as Delivered or Partial, enumerate its acceptance criteria and check each one against the code — not just whether the relevant file exists. A page that exists but queries the wrong data scope fails an AC and is Divergent, not Partial. A route that exists but skips an auth or ownership check fails an AC. File existence is necessary but not sufficient.

**Use tests to confirm intent.** Where a test exists for a story, use it to determine the *intended* behaviour, then verify the implementation matches. Where no test exists for a story classified as Delivered, note it as a gap — the story may be correct but unverified and at risk of silent regression.

**Verify before reporting.** When a prior drift report or design doc claims a bug or missing code exists, **read the actual source file and check whether the problem is still present**. Code may have been fixed since the report was written. Do not parrot claims from old reports without verification. This is especially critical for findings you intend to classify as Critical or Divergent — every such finding must include a line reference to the current code that demonstrates the problem still exists. If the code has already been fixed, note it as resolved.

### 3. Identify emergent features

Scan the code for capabilities not tracked by any requirement or design doc:

- API routes with no corresponding story.
- Database tables/columns with no design doc coverage.
- Engine modules with no requirement backing.
- UI pages or components not in any epic.

These are not bugs — they may be legitimate implementation details, infrastructure, or organic additions. Categorise them:

| Category | Example |
|----------|---------|
| **Infrastructure** | Auth middleware, error handling, logging — expected, not story-worthy. |
| **Organic addition** | Feature added during implementation that should be back-specified. |
| **Orphaned** | Code that appears unused or vestigial. |

### 4. Produce the coverage matrix

Map every epic to its actual state:

```markdown
| Epic | Stories | Delivered | Partial | Divergent | Not started | Descoped |
```

### 5. Write the report

Save to `docs/reports/baseline/YYYY-MM-DD-baseline.md` using this structure:

```markdown
# Baseline: As-Built Requirements

**Date:** YYYY-MM-DD
**Project phase (CLAUDE.md):** [quoted verbatim]
**Requirements versions reviewed:** v1 (v1.N), v2 (v0.N), ...
**Previous baseline:** [date or "first baseline"]

## Summary

[2-3 sentences: overall state of the project — how much is delivered, what's the biggest gap, what's the biggest divergence.]

## Coverage Matrix

| Epic | Stories | Delivered | Partial | Divergent | Not started | Descoped | Coverage % |
|------|---------|-----------|---------|-----------|-------------|----------|------------|

## Delivered (matches spec)

### Epic N: <title>

#### Story N.M: <title>
- **Status:** Delivered
- **Acceptance criteria met:** [list, referencing actual code paths]
- **Implementation:** [key files/modules]

## Partial (some ACs missing)

### Epic N: <title>

#### Story N.M: <title>
- **Status:** Partial
- **Met:** [which ACs]
- **Missing:** [which ACs, with brief explanation]
- **Implementation:** [key files]

## Divergent (code differs from spec)

### Epic N: <title>

#### Story N.M: <title>
- **Status:** Divergent
- **Spec says:** [what the requirement describes]
- **Code does:** [what actually happens]
- **Key files:** [where to look]
- **Recommendation:** [update spec / update code / needs discussion]

## Not Started

[List by epic, one line per story. Note if expected (future phase) or overdue (current phase).]

## Descoped

[List with rationale — ADR reference, session log, or issue close reason.]

## Emergent Features (not in any requirement)

### Infrastructure
- [item]: [brief description, key files]

### Organic additions
- [item]: [what it does, key files, recommendation: back-specify or remove]

### Orphaned code
- [item]: [what it appears to do, key files, recommendation]

## Discrepancies (doc ↔ code)

Every discrepancy must be verified against the current source code. Include the file path
and line number where the problem was confirmed. If a prior report claimed a problem that
has since been fixed, list it under "Resolved since last report" instead.

| # | Location | Doc says | Code does | Verified at | Severity | Recommendation |
|---|----------|----------|-----------|-------------|----------|---------------|

## Delta from Previous Baseline

[If a previous baseline exists: what changed — new deliveries, resolved divergences, new gaps. If first baseline: "N/A — first baseline."]
```

### 6. Summarise to the user

Keep terminal output under 20 lines:

- Coverage matrix (compact).
- Counts: delivered / partial / divergent / not started / descoped.
- Top 3 divergences or gaps.
- Count of emergent features by category.
- File path to the full report.

The report is authoritative — do not duplicate it in the terminal.

## When to run

- At phase transitions (finishing Phase 1, starting Phase 2).
- Before from-scratch reimplementation of a feature area.
- When requirements docs feel unreliable or stale.
- Before running `/backlog` for higher-quality recommendations.
- When onboarding (gives a new contributor the real picture).

## What this skill is NOT

- **Not `/drift-scan`** — drift-scan finds mismatches and flags them. /baseline reconciles everything into a coherent snapshot.
- **Not `/backlog`** — backlog recommends next work. /baseline describes current state. /backlog *consumes* baseline output.
- **Not a requirements rewrite** — the output is a report, not an updated spec. Requirements capture intent; baseline captures reality.
