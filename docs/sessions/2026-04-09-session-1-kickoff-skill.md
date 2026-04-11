# Session Log — 2026-04-09 Session 1: /kickoff Skill & Engineering Process

## Context

Discussion and implementation session addressing a gap in the harness: the "requirements → first design" stretch had no skill, no named artefact, and no gate. The current chain jumped from hand-authored requirements to `/architect`, which assumed a plan already existed. This session introduced `/kickoff` to own that gap.

Conducted in Windsurf (Windows). Commit `00ff401`.

## Discussion

### The Gap

The existing pipeline was `requirements.md → ??? → plan.md → /architect → LLDs → /feature`. The `???` was where humans improvised — no skill owned it, no artefact was named, no gate existed. The FCS project evolved this implicitly over ~8 sessions; new projects would have nothing to copy.

### Design Decisions

**HLD before plan, not after.** The plan should be derived from the HLD, not the other way around. Writing a plan first risks committing to an implementation shape before the design levels are established.

**Three human gates within /kickoff:**
1. After HLD (Levels 1–3) — does the design make sense?
2. After ADRs — are the load-bearing decisions right?
3. After implementation plan — is the breakdown achievable?

**Separate process doc.** ADR is too "decision-shaped" and CLAUDE.md too terse for a refresher read. The process doc (`docs/process/engineering-process.md`) serves as the narrative walkthrough — an index with glue, not a re-statement.

### Reusability Discussion

Brief discussion about making the harness reusable across projects via a `claude-harness-template/`. Parked for later — the immediate need was to codify the process for FCS, with reusability as a future concern.

### TDD Execution Strategy (parked)

Tangential discussion about strict Red-Green-Refactor vs batched-per-criterion TDD. The strict approach burns tokens on confirm-it-fails round-trips. Decision: update `/feature-core` and the process doc to describe batched-per-criterion TDD now, defer the proper ADR (ADR-0022) to a later session. CLAUDE.md § TDD Discipline left unchanged pending that ADR.

### /drift-scan Dual Role

Identified that `/drift-scan` plays two roles:
1. As a gate inside `/kickoff` — after HLD and after plan (mandatory)
2. As periodic garbage collection — end of phase, before `/retro`

Updated the process doc to reflect both, plus the `/drift-scan → /retro` ordering when both are due.

## Changes Made

| # | Artefact | Path | Purpose |
|---|----------|------|---------|
| 1 | ADR-0021 | `docs/adr/0021-project-bootstrap-pipeline.md` | Decision: kickoff → architect → feature pipeline, HLD-before-plan, three gates |
| 2 | `/kickoff` skill | `.claude/skills/kickoff/SKILL.md` | Nine-step process owning Levels 1–3, four human gates |
| 3 | Engineering process doc | `docs/process/engineering-process.md` | End-to-end lifecycle narrative, artefact map, skills index, ADR index, gates and sensors tables |
| 4 | CLAUDE.md update | `CLAUDE.md` | Added Engineering Process section + `/kickoff` to custom skills list |
| 5 | `/create-plan` repositioning | `.claude/skills/create-plan/SKILL.md` | Narrowed description so it no longer competes with `/kickoff` for bootstrap trigger |
| 6 | `/feature-core` TDD update | `.claude/skills/feature-core/SKILL.md` | Relaxed strict Red-Green-Refactor to batched-per-criterion TDD |

## Decisions

- `/kickoff` owns Levels 1–3 (Capabilities, Components, Interactions); `/architect` owns Level 4 (Contracts); `/feature` owns Level 5 (Implementation)
- HLD precedes plan — the plan is derived from the design, not vice versa
- Process doc is the "5-minute refresher" — ADRs are decisions, CLAUDE.md is navigation, process doc is narrative
- Batched-per-criterion TDD adopted in `/feature-core` pending a formal ADR-0022
- Harness template for reuse across projects: parked

## Next Steps (as of session end)

- ADR-0022 for TDD execution strategy (still pending as of 2026-04-11)
- Harness template for project portability
- Test `/kickoff` on next new project or version bootstrap
