# Article Review & Skills Roadmap

Date: 2026-04-11
Source: Review of `local-docs/medium-article-review-and-theory.md` (Part 2 of harness series)

---

## 1. Article Revision (Part 2)

### Structural changes

- **Lead with Naur**, not the complaint. The review bottleneck becomes evidence for why theory matters, not the hook.
- **Add devil's advocate section**: "Why do you need theory if AI can fix it?" — address head-on with arguments:
  1. Diagnosis requires theory (you can't even write the right prompt without understanding causality)
  2. Compound errors — each fix without theory introduces subtle misalignments
  3. Verification requires intent — can't verify "correct" without knowing what correct means in context
  4. Feedback loop — someone must decide what to build and why, regardless of model capability
- **Define "theory debt" explicitly**: the gap between what the system does and what the team understands about why. Unlike tech debt (slows delivery), theory debt makes delivery *unsafe*.

### Line-level fixes

| Line | Issue | Fix |
|------|-------|-----|
| 8 | Generic opening | Lead with the real-world framing: AI generates volume, reviewers can't keep up |
| 14 | "All of these are true..." melodrama | Cut or compress to one sentence |
| 23 | Understanding is only part of the problem | Add: maintainability, resilience, evolvability |
| 34 | "debt" undefined | Define theory debt explicitly |
| 52 | "improvised" — too casual | "handled ad-hoc" or "worked through manually" |
| 58 | Session numbers | Replace with "early in the project" / "after initial sessions" |
| 95 | "reviewing intent is not new" | Own it: "not new — what's new is AI makes it necessary" |
| 125 | "wall of text" — AI smell | Rephrase: "175 lines of detail, unsure whether you'd validated the design" |
| 143 | "invariants" vs "constraints" | Use "constraints" in article, keep "invariants" in technical templates |
| 151 | Counter "freedom to the model" argument | Design is a contract, not a constraint. "Freedom" = freedom from accountability |
| 159 | "mandatory sequence diagrams" | Broaden: "mandatory diagrams" — sequence, structural, optionally state |

---

## 2. New Skill: `/discovery` (Lean Inception)

### The gap

Current pipeline starts at `requirements.md`. But where do requirements come from?

```
idea → ??? → requirements.md → /kickoff → /architect → /feature
```

### Lean Inception (Paulo Caroli)

Research needed. Core activities to map:

- Product vision
- "Is / Is Not" boundaries
- Personas
- User journeys
- Feature brainstorm + prioritisation
- Sequencer (MVP slicing)

### Open questions

- Project-level only, or also before major phases?
- How much domain research should the skill do (web search, competitive landscape)?
- What are the human gates?
- Output format: structured doc? feeds directly into `/requirements`?

### LS context

> "human should provide initial idea with different level of details which produce the requirements doc... this is nothing new — we just replicating the standard process in the AI-era"

> "There is a concept — Lean inception when team learn about a project, brainstorm ideas. I think we should do this"

---

## 3. New Skill: `/requirements`

### Purpose

Takes discovery output + human input → structured requirements document.

### Distinct from `/discovery`

- `/discovery` = learning the domain, exploring the problem space
- `/requirements` = formalising intent into user stories with acceptance criteria

### Design considerations

- INVEST properties (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Maps to existing epic/task structure
- Possibly includes a "Product Owner" perspective — prioritisation, scope decisions
- Output: `docs/requirements/v{N}-requirements.md` in existing format

### Dependency

Depends on `/discovery` design — discovery output is this skill's input.

---

## 4. Evaluator Coverage Audit

### Current state

| Stage | Evaluator | Status |
|-------|-----------|--------|
| LLD → Code | feature-evaluator | Exists (ADR-0019) |
| Code → Main | /drift-scan | Exists |
| Requirements → HLD | — | **Gap** |
| HLD → LLD | — | **Gap** |
| Requirements completeness | — | **Gap** |

### LS context

> "we need to check whether our harness uses evaluator approach at all stages of our process"

### Design direction

Lightweight evaluator checks embedded in existing skills, not standalone:

- In `/kickoff`: check HLD covers all requirements
- In `/architect`: check LLD satisfies HLD contracts
- In `/requirements` (new): check acceptance criteria are testable

### Open question

Are these separate agents, or validation steps within existing skills?

---

## 5. Article Part 3 Prep

Teased topic: costs, metrics, and what FCS reveals about theory loss in AI-assisted teams.

New material from this roadmap:
- The full pipeline evolution (discovery → requirements → kickoff → architect → feature)
- Evaluator-at-every-stage pattern
- Metrics from running the harness across sessions

Not actionable yet — accumulates as items 2-4 progress.

---

## Sequencing

```
1 (article revision)  — ready now, independent
2 (discovery research) — next, research Lean Inception methodology
3 (requirements skill) — after 2 (takes discovery output as input)
4 (evaluator audit)    — independent, can parallel with 2
5 (part 3 prep)        — ongoing, accumulates from 2-4
```

Items 1 and 4 can start in parallel. Item 2 before 3.

---

## When to create GitHub issues

Convert to issues when ready to implement (not before). This doc is the tracking artefact until then.
