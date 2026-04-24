# 0022. Tiered Feature Process — Requirements-Driven /architect

**Date:** 2026-04-13
**Status:** Accepted
**Deciders:** LS / Claude

## Context

ADR-0021 established the full bootstrap pipeline for greenfield projects:

```
/discovery → /requirements → /kickoff → /architect → /feature
```

This works well for new projects and large epics. But for **single features
within an existing project** — where the HLD already exists and no new plan is
needed — the full pipeline adds ceremony without proportional value. Running
`/discovery` and `/kickoff` for "add a depth setting to rubric generation" is
overhead that won't catch design mistakes the LLD review wouldn't already catch.

The gap: `/architect` currently expects a plan file as input (with epics,
phases, and wave assignments). There is no path from a lightweight requirements
doc to an LLD without going through `/kickoff` first.

A secondary observation: the distinction between "feature" and "epic" is size,
not kind. A freeform brief fed to `/requirements` may produce a single story
(stays a task) or multiple stories (becomes an epic with tasks). The process
should handle both without the user needing to predict the outcome upfront.

## Decision

### Tiered process based on scope

| Tier | Scope | Pipeline | When to use |
|------|-------|----------|-------------|
| 1a | Bug (vague symptom) | `/bug` → `/feature` | Symptom known, root cause unknown — `/bug` investigates and creates the issue |
| 1b | Bug / hotfix (known fix) | Issue → `/feature` | Well-scoped fix, no design decisions |
| 2 | Feature (single or small epic) | `/requirements` → `/architect` → `/feature` | New capability within existing project |
| 3 | Large epic / new phase | `/requirements` → `/kickoff` → `/architect` → `/feature` | Multiple features, needs HLD update or new ADRs |
| 4 | New project | `/discovery` → `/requirements` → `/kickoff` → `/architect` → `/feature` | Greenfield, problem space unexplored |

The human decides the tier. When in doubt, start at tier 2 — if `/requirements`
reveals the scope is larger than expected, escalate to tier 3.

### `/bug` automates tier 1 triage

Tier 1a adds an investigation step before `/feature`. When the user has a
symptom but not a root cause, `/bug` takes free-form input (error message,
behaviour description, file reference) and:

1. Researches the codebase — traces affected code paths, identifies root cause.
2. Checks existing LLDs — the bug often exists because the LLD was incomplete
   or wrong. Notes the design gap alongside the code fix.
3. Creates a GitHub issue with: root cause analysis, affected files, fix
   approach, BDD specs, and acceptance criteria.
4. Assesses complexity:
   - **Simple** (single component, clear fix): issue is ready for `/feature`.
   - **Complex** (cross-cutting, architectural, multiple components): adds
     `needs-design` label, recommends `/architect` before `/feature`.

The skill replaces the manual "someone writes a bug issue" step. After `/bug`,
the normal flow resumes: `/feature` for simple bugs, or
`/architect` → `/feature` for complex ones.

### `/architect` accepts requirements docs as input

Extend `/architect` Step 1 to detect whether the input is a plan file
(`docs/plans/`) or a requirements document (`docs/requirements/`).

When the input is a requirements doc:

- Extract epics, stories, priorities, and acceptance criteria the same way it
  would from a plan.
- The `--epics` filter works identically (filter by epic number from the
  requirements doc).
- Skip `/kickoff`-specific concerns (HLD creation, ADR discovery, phase
  sequencing). The requirements doc is the authority for scope.
- Decomposition assessment applies as normal — a feature that needs splitting
  becomes an epic with task issues.
- LLD generation, issue creation, and human gates are unchanged.

No new invocation syntax: `/architect docs/requirements/v2-depth-config.md`
just works.

### `/requirements` handles feature briefs

`/requirements` already accepts freeform briefs (existing capability). For
tier 2 features, the output is a lightweight requirements doc — possibly a
single epic with 1–3 stories. The doc follows the same format as project-level
requirements but is proportionally smaller.

## Consequences

- Tier 1a bugs get structured triage — root cause, affected files, LLD gap
  analysis — without manual investigation. The issue `/bug` creates is
  well-formed enough for `/feature` to implement autonomously.
- Single features get design review (LLD Part A) without the overhead of
  `/kickoff`. The "mistakes at design stage are most costly" principle is
  preserved.
- `/architect` gains a small input-detection paragraph in Step 1. No
  structural changes to the rest of the skill.
- The boundary between "feature" and "epic" is fluid — `/requirements` output
  determines the shape, and `/architect` handles both.
- `/kickoff` remains the right choice when the HLD itself needs updating
  (new components, new interactions, new ADRs).
- Risk: a user might use tier 2 for something that genuinely needs HLD updates.
  Mitigation: `/architect` can flag when the feature touches components or
  interactions not covered by the existing HLD, and recommend escalating to
  tier 3.
