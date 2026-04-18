# 0024. Baseline — Requirements Reconciliation Skill

**Date:** 2026-04-18
**Status:** Accepted
**Deciders:** LS / Claude

## Context

The project has accumulated multiple requirements documents (v1, v2, v3,
proposed additions), design docs, ADRs, and implemented code across several
months. These artefacts have drifted apart:

- Requirements describe features that were descoped or deferred.
- Code implements behaviour never formally specified.
- Design docs reference superseded decisions.
- `/drift-scan` detects mismatches but does not reconcile them.

When context is lost (new contributor, context window exhaustion, or a
from-scratch reimplementation like the current E11/E17 situation), there is no
single document that says "this is what actually exists and what it does."

The existing `/backlog` skill recommends *what to do next* but lacks a reliable
picture of *what is already done*. It reads requirements docs at face value,
which may overstate or understate actual coverage.

## Decision

Create a `/baseline` skill that reconciles reality (code, closed issues, merged
PRs, ADRs, design docs) into a consolidated as-built requirements document.

**Key design choices:**

1. **Output is a point-in-time snapshot**, not a living document. Each run
   produces a new file in `docs/reports/baseline/`. It is not a replacement for
   versioned requirements — it is an audit of what those requirements produced.

2. **Code is the primary source of truth.** When code and docs disagree, the
   baseline records what the code does and flags the discrepancy. It does not
   silently pick the doc version.

3. **Structure mirrors requirements format** (epics, stories, acceptance
   criteria) so `/backlog` can diff the baseline against current requirements
   to identify genuine gaps vs already-delivered work.

4. **Propose-only.** Like `/backlog` and `/drift-scan`, it never mutates
   requirements, design docs, or issues. It writes only to `docs/reports/baseline/`.

5. **`/backlog` consumes it.** The backlog skill will read the most recent
   baseline report as an additional input, treating it as the authoritative
   picture of what exists.

## Alternatives Considered

### A. Update requirements docs in place

Rejected. Requirements capture *intent* — what was asked for. Silently
rewriting them to match reality erases the gap signal that `/drift-scan` and
`/backlog` rely on.

### B. Extend `/drift-scan` to produce a consolidated view

Rejected. Drift scan is diagnostic (find mismatches). Baseline is synthetic
(produce a coherent picture). Different concerns, different output shapes.

### C. Manual reconciliation at phase boundaries

Status quo. Works but is error-prone, time-consuming, and depends on context
the human may have lost. The skill automates the mechanical parts.

## Consequences

- `/baseline` joins the report family: `/drift-scan`, `/retro`, `/backlog`.
- `/backlog` gains one new input source (`docs/reports/baseline/`).
- Phase transitions and from-scratch reimplementations become cheaper — run
  `/baseline` first to establish what exists, then `/backlog` to plan what's
  next.
