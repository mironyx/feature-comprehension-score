# Session Log — 2026-04-11 Session 1: LLD & Review Process Redesign

## Context

Discussion session exploring how to make AI-generated code review more efficient while preserving theory building (per Naur). Motivated by a planned article — Part 2 of the harness development series, focused on the review process.

## Key Discussion Points

### The Review Bottleneck is a Specification Problem

The conversation started from the widely held view that line-by-line code review is a bottleneck when working with AI-generated code. The core insight: **the bottleneck isn't review — it's specification**. If you shift verification left (from code review to LLD review), you're reviewing intent rather than implementation, which is where human judgement adds value.

### Sequence Diagrams as Primary Review Artefacts

Sequence diagrams sit at the right abstraction level for human review because they capture **behaviour** — interactions, contracts, ordering constraints — without drowning in structural detail. A correct sequence diagram constrains the solution space enough that automated checks (types, tests, linting) can catch implementation errors.

### UML Revival — But Different

UML fell out of fashion because it was used for documentation (which rots) and ceremony (which slows teams). But if diagrams become **executable specifications** — inputs to AI agents that generate code from them — the cost-benefit flips. The diagrams are the source of truth, not redundant documentation.

### Structural Diagrams: Modules and Classes

Initial pushback on class diagrams was withdrawn. The key insight: visual representation helps theory building regardless of paradigm. The solution is **paradigm-agnostic structural diagrams** using mermaid `classDiagram` syntax:

- **Classes** — show with methods and relationships
- **Modules** — use `<<module>>` stereotype, show exported functions
- **Interfaces/Ports** — use `<<interface>>`, show who implements them

This accommodates the current project's function-heavy TypeScript and future Python projects with classes.

### Invariants as Verification Contracts

Constraints were previously scattered as inline `> **Constraint:**` blocks in LLDs. Collecting them into a dedicated **Invariants** table (with verification methods) creates a checklist that:
- The reviewer signs off on
- `/pr-review-v2` and `/feature-evaluator` can verify automatically
- Bridges the gap between "LLD is correct" and "code is correct"

### Two-Part LLD Structure

The LLD template was restructured into **Part A** and **Part B**, distinguished by review depth, not audience:

- **Part A** — read by both human reviewer and implementing agent. Contains: purpose, behavioural flows (sequence diagrams), structural overview (class/module diagrams), invariants table, acceptance criteria, BDD specs, HLD coverage assessment. Self-contained for theory building — a reviewer can stop here.
- **Part B** — extends Part A with implementation precision: file paths, internal types, function signatures, internal decomposition, error handling. The agent reads both parts; the human may scan Part B but doesn't need to review line-by-line.

### The "Feeling" Caution

The idea that reviewers should just get a "feeling" from scanning code was challenged. Without precision about what "feeling" means in practice, it's indistinguishable from not reviewing at all. The article framing should be: **shift your cognitive budget** — spend 70% on LLD review (Part A), 30% on code scanning for things diagrams can't express (error handling, edge cases, performance).

### Connection to Naur's Theory Building

The original Naur framing says theory lives in people's heads, not in artefacts. But if the right artefacts (sequence diagrams, structural overviews, invariants) are close enough to the theory, then reviewing them actually builds understanding. You're not reading 500 lines of generated code — you're looking at 3-5 interactions and asking "does this match my mental model of how this feature works?"

## Changes Made

### `/lld` skill ([.claude/skills/lld/SKILL.md](.claude/skills/lld/SKILL.md))

- **Restructured template** into Part A (human-reviewable design) and Part B (agent implementation detail)
- **Added Behavioural Flows section** — mandatory mermaid sequence diagrams for multi-component interactions, with "when required" / "when optional" guidance
- **Added Structural Overview section** — mermaid class/module diagrams supporting both class-based and module-based codebases
- **Added Invariants section** — hard constraints collected in a table with verification methods
- **Moved acceptance criteria and BDD specs** into Part A
- **Updated guidelines** — diagrams are not optional decoration; invariants must be verifiable; Part A is the shared foundation read by both human and agent

### `/architect` skill ([.claude/skills/architect/SKILL.md](.claude/skills/architect/SKILL.md))

- **Added 3 new review health checks**: missing behavioural flows, missing structural overview, unverifiable invariants
- **Updated LLD production step** to reference the Part A + Part B structure with explicit guidance on what each part contains

## Article Themes (for Part 2)

1. **Reframe the question** — not "how do we review AI code faster?" but "what's the minimum artefact we need to review to maintain sufficient theory?"
2. **Shift left** — from code review to design review. Requirements → LLD → automated code verification.
3. **Diagrams as executable specifications** — UML's comeback in the AI age, but as agent inputs rather than documentation ceremony.
4. **Cognitive budget allocation** — 70% LLD review, 30% code scan. Not "skip code review" but "invest review time where it has the highest return."
5. **Invariants bridge the gap** — between "design is correct" and "code is correct." They're the verification contract that automated tools enforce.
6. **Theory building through the right artefacts** — adapting Naur for the AI age. You don't need to read every line to build theory; you need the right visual and contractual artefacts.

## Decisions

- LLD template restructured — Part A / Part B split adopted
- Structural diagrams use mermaid `classDiagram` syntax for both modules and classes
- Invariants collected in tables rather than scattered inline
- Existing LLDs are not retroactively updated — new format applies going forward

## Next Steps

- Write Part 2 article using the themes above and the harness changes as concrete examples
- Test the new LLD template on the next `/architect` or `/lld` invocation
- Consider whether `/pr-review-v2` should explicitly check Part A invariants against the implementation
