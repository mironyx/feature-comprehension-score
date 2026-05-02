# Session Log — 2026-05-02 — Architect UI Triage

**Skill:** architect (UI issues triage + design health patches)
**Issues created:** [#440](https://github.com/mironyx/feature-comprehension-score/issues/440), [#441](https://github.com/mironyx/feature-comprehension-score/issues/441)

## What was done

User reported 5 UI issues post-V11 implementation. Performed a full audit against requirements and LLDs before producing any artefacts.

### Findings

| # | Issue | Classification | Spec violated |
|---|-------|----------------|---------------|
| 1 | Settings page unreachable from UI | High regression | E11.3 LLD §B.1 never specified adding Settings link to dashboard |
| 2 | Org assessment list lacks project name/filter | Enhancement (not regressed) | HLD deferred cross-project admin views; user wants it now |
| 3 | New Assessment button gone when project has assessments | High regression | Story 1.3 AC 1 — "New assessment entry point" required at all times |
| 4 | Project assessment list is a thin card list | High regression | Story 2.2 AC 1 — must reuse `AssessmentOverviewTable` |
| 5 | V11 compliance review | Covered by 1, 3, 4 | — |

**Root cause (shared):** E11.1 + E11.3 LLD BDD specs covered API behaviour but not page-level UI affordances. Feature-evaluator passed because the LLD gaps were the source of truth, not the requirements.

### Artefacts produced

**Issues 1 + 3 → Issue #440** (bundled — both touch the same page):
- `fix: Settings link + New Assessment CTA missing from project dashboard`

**Issues 2 + 4 → Issue #441** (bundled — share the `AssessmentOverviewTable` extension):
- `fix+feat: project dashboard reuses AssessmentOverviewTable; org overview adds project column + filter`

**LLD patches (4 commits):**
- `lld-v11-e11-1-project-management.md` — Invariants I9 + I10, 2 BDD specs, updated §B.6
- `lld-v11-e11-3-project-context-config.md` — Invariant I9, 2 BDD specs, §B.1 file entry
- `lld-v11-e11-2-fcs-scoped-to-projects.md` — Invariant I10, §B.5 task updated to mandate `AssessmentOverviewTable`
- `lld-nav-results.md` — new §4 covering org overview project column + filter + project dashboard shared table design

## Next steps

Both issues are on the board (Todo). Implement with `/feature`:
1. `#440` — small, ~50 LOC, one page file
2. `#441` — medium, ~130 LOC; depends on `#440` logically (same page) but files are disjoint — can run in parallel if careful

Systemic note: the LLD process needs to explicitly spec page-level UI affordances (links, buttons always visible) as BDD specs, not just API behaviour. `/architect` should add a "Page affordances" section to any LLD that introduces a new page.
