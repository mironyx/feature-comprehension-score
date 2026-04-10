# 0021. Project Bootstrap Pipeline

**Date:** 2026-04-09
**Status:** Accepted
**Deciders:** LS / Claude

## Context

The harness has mature skills for the middle and end of a project lifecycle
(`/architect`, `/feature`, `/feature-end`, `/retro`, `/drift-scan`), but the
*start* of a project is undefined. Once a requirements document exists, there
is no owned path from requirements to the point where `/architect` can produce
LLDs and `/feature` can start implementing.

On the Feature Comprehension Score project this gap was filled implicitly over
eight sessions of pure design work (see the Medium article
`local-docs/medium-article-evolved-harness.md`). It worked because the author
had internalised the five-level design-down process (Capabilities → Components
→ Interactions → Contracts → Implementation) and sequenced HLD, ADRs and plan
by hand. A new project starting today has nothing to copy: no skill owns the
phase, no artefact order is specified, and no human gates are named.

Two failure modes this gap enables:

1. **AI bias toward novel problems.** The session-3 drift scan on FCS found 23%
   design coverage and three uncovered epics — the AI had designed the parts it
   found interesting and skipped the routine ones. Without a structured
   kickoff and a drift-scan gate, a new project will likely hit the same bias
   without catching it.
2. **Plans written before design.** Planning activities before the HLD exists
   produces roadmaps phrased as tasks ("set up auth, build dashboard") rather
   than as component/contract deliveries. The resulting plan is not
   reviewable against a design it predates.

Harness engineering (Böckeler, OpenAI, Anthropic) frames this as a missing
**guide** (feedforward control): the point of a kickoff skill is to steer the
agent *before* it produces design artefacts, not just review them after.

## Options Considered

### Option 1: Leave kickoff undefined, rely on `/architect` + `/create-plan`

Keep today's shape: human drives requirements → HLD by hand, uses
`/create-plan` freeform, then `/architect` per epic.

- **Pros:** No new skill.
- **Cons:** Undocumented critical path. Every new project re-invents the
  sequencing. No drift gate between requirements and design. `/create-plan`'s
  trigger description is broad and competes with anything shaped like
  planning.

### Option 2: Extend `/architect` to cover project bootstrap

Make `/architect` produce the HLD, ADRs and plan in addition to per-epic LLDs.

- **Pros:** One skill owns all design artefacts.
- **Cons:** Conflates project-wide Levels 1–3 with per-epic Level 4. The two
  operate at different scopes and cadences (once vs per epic). A single skill
  that does both becomes long, hard to maintain, and hard to gate cleanly.

### Option 3: New `/kickoff` skill owning Levels 1–3, plan-after-HLD

Introduce a dedicated skill that takes a requirements document as input and
produces the HLD, load-bearing ADRs, the implementation plan, and Phase-0
epics/tasks on the board. Three human gates: after HLD, after ADRs, after
plan. `/architect` remains per-epic and owns Level 4.

- **Pros:** Clean seams between Levels 1–3 (project-wide), Level 4 (per epic)
  and Level 5 (per task). Encodes the FCS experience as a reusable path.
  Explicit gates match the "stop for human review" pattern used elsewhere.
  HLD-before-plan makes the plan reviewable against the component and
  interaction design it is derived from.
- **Cons:** New skill to maintain. Requires repositioning `/create-plan` so the
  two do not overlap.

## Decision

**Option 3: introduce `/kickoff` as a dedicated bootstrap skill, with HLD
before plan and three human gates.**

The project lifecycle becomes:

```
requirements → /kickoff → /architect → /feature → /feature-end → /retro
```

Design-level ownership across skills:

| Skill        | Levels owned            | Scope            |
| ------------ | ----------------------- | ---------------- |
| `/kickoff`   | 1–3 (Capabilities, Components, Interactions) | project-wide |
| `/architect` | 4 (Contracts)           | per epic/task    |
| `/feature`   | 5 (Implementation)      | per task         |

`/kickoff` produces, in order, with a human gate after each:

1. `docs/design/v1-design.md` (HLD covering Levels 1–3)
   → gate: run `requirements-design-drift` agent, review coverage matrix
2. `docs/adr/NNNN-*.md` for each load-bearing technical decision the HLD
   forces (stack, auth, storage, deployment, external integrations)
   → gate: human approval per ADR
3. `docs/plans/YYYY-MM-DD-*-implementation-plan.md` derived from the HLD
   → gate: second drift scan, human review
4. Epics on the board plus task issues for Phase 0 only (later phases stay
   epic-level until their turn)

`/create-plan` is repositioned as "implementation plan from an existing HLD",
not freeform planning, so it does not compete with `/kickoff` for the same
trigger surface.

## Consequences

- New projects have a single documented path from requirements to first
  implementation task. The FCS eight-session bootstrap becomes a reusable
  pattern rather than tacit knowledge.
- Drift scans become a gate on the critical path, not an optional check. The
  "AI gravitates to novel problems" bias is caught before it reaches
  implementation.
- Human intent enters the system at four named points (HLD, each ADR, plan,
  then later each LLD and each PR) rather than implicitly through session
  steering.
- `/create-plan` needs its trigger description narrowed to avoid overlap with
  `/kickoff`. Tracked as a follow-up.
- An engineering-process document (`docs/process/engineering-process.md`) will
  describe the full lifecycle narratively, with this ADR as the justification
  for the bootstrap stage specifically.
- The template repository work (future) can now extract `/kickoff` as a
  first-class harness asset instead of re-deriving it per project.
- Cost: one new skill to maintain, and a small amount of CLAUDE.md churn to
  point at the process document.
