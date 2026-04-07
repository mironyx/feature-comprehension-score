# Session: 2026-04-06 — Epic/Task Work Organisation

## Context

Discussion-led session in Claude Desktop (no implementation work). User wanted to formalise
how features are organised, having previously found long monolithic plan documents and
phase-based LLDs inefficient.

## Discussion

Started from a thread about whether to overload the existing L1–L5 design-down labels for
hierarchy. Quickly agreed L1–L5 should remain orthogonal (design level, not hierarchy) and
introduced a separate **epic** concept as a lightweight container.

Naming collision considered: the existing `/feature` skill already implements what is
effectively a single task. Resolved by keeping **Epic** as the container term and **Task**
as the unit of work. The `/feature` skill name stays — it implements a task.

Pushback applied against adding full agile ceremony (burndown, epic-level ADR indexes,
epic summaries). Final model is intentionally minimal: epic = GitHub issue with `epic`
label, body contains a task checklist linking child issues. No separate epic doc.

## Work completed

- **ADR-0018** — Epic/Task Work Organisation. Records the lightweight model and rationale.
- **CLAUDE.md** — new "Epic and Task Organisation" subsection under Task Tracking.
- **GitHub** — created `epic` label (purple, `#6f42c1`).
- **Skill updates:**
  - `/architect` — new Epic mode (`/architect epic <N>`); plan mode now uses epic-aware
    LLD naming when items belong to an epic.
  - `/feature` — new epic mode (`/feature epic <N>`) picks the next unchecked task; epic
    guard prevents direct implementation of epic issues.
  - `/feature-core` — epic guard added to Step 3 (Read design context).
  - `/feature-team` — new epic mode (`/feature-team epic <N>`); epic guard on all
    collected issues.
  - `/lld` — new epic mode (`/lld epic <N>`); LLD naming convention is now
    `lld-<epic-slug>-<task-slug>.md` per task; phase mode retained as legacy.

## Decisions made

- **Epic = container only.** No standalone epic design doc — the GitHub issue body is the
  index. Keeps ceremony minimal.
- **L1–L5 labels remain orthogonal.** Epic membership is expressed via parent reference
  in issue body, not via labels.
- **No retroactive renaming.** Existing `lld-phase-*` files stay as-is. New work uses
  the epic-anchored convention.
- **HLD stays.** `docs/design/v1-design.md` remains the top-level design document. Epics
  reference sections of it.
- **Update all skills now.** User chose to update everything in one pass rather than
  evolve skills as the first epic is implemented — next features start immediately.

## Commit

- `045b230` chore: introduce epic/task work organisation (ADR-0018) — pushed to main.

## Next steps

- Create the first epic for upcoming feature work using the new pattern.
- Run `/architect epic <N>` against it to validate the end-to-end flow.
- Refine skills based on first real usage.
