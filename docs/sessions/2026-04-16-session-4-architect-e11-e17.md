# Session 4 — 2026-04-16 — Architect: E11 + E17 Design

## Summary

Ran `/architect --epics E11.* E17.*` to produce design artefacts for V2 Epics 11 (Artefact Quality Scoring) and 17 (Agentic Artefact Retrieval). E11 completed cleanly. E17's initial LLD was over-engineered around a deterministic orchestrator; user pushback prompted a full rearchitecture around a tool-use loop, codified in ADR-0023. Session also patched the `/feature-team` skill to derive execution waves from the epic's Mermaid dependency graph rather than requiring a parallel waves table.

## Shipped

| # | Commit | Scope |
|---|--------|-------|
| 1 | `docs: LLD for #240 — agentic artefact retrieval (E17)` (1409c94) | First E17 LLD — deterministic orchestrator shape |
| 2 | `docs: rewrite V2 Stories 17.1 and 17.2 around tool-use loop for #240` (3f122f2) | Requirements rewrite |
| 3 | `docs: ADR-0023 — tool-use loop for rubric generation` (c4523f2) | Architectural pivot |
| 4 | `docs: rewrite LLD for #240 — tool-use loop + observability` (0882896) | E17 LLD v2 |
| 5 | `docs(skill): feature-team parses dependency graph for wave derivation` (a9bffad) | Skill update |

E11 LLD (#233 epic + 6 task issues) committed earlier in the session. 12 GitHub issues mutated (created / rewritten / closed).

## Board state (end of session)

- **E11 (#233):** epic + 6 tasks all Todo. Ready for `/feature-team epic 233`.
- **E17 (#240):** epic + 8 active tasks (#241, #243, #245, #246, #247, #249, #250, #251). 3 tasks closed (#242, #244, #248 — superseded by ADR-0023). Ready for `/feature-team epic 240` in 4 waves per the dependency graph.

## Cross-cutting decisions

- **ADR-0023 adopted** — rubric generation moves from single-shot `generateStructured` to multi-turn `generateWithTools` with two read-only tools (`readFile`, `listDirectory`). Bounds: 5 calls / 64 KiB / 10k tokens / 60 s. Observability (tokens, call log, duration) persisted unconditionally on every rubric generation.
- **Cross-epic RPC ordering** handled via nullable columns: E11 adds `finalise_rubric_v2`; E17 adds `finalise_rubric_v3`. Implementing agent picks the correct version at branch creation based on `main` state.
- **`/feature-team` skill extended** — now derives waves from `## Dependency graph` Mermaid diagrams in epic bodies (previously required a separate `## Execution Order` table).

## What didn't go to plan

The original E17 LLD (commit 1409c94) implemented exactly what the V2 requirements described: a deterministic orchestrator consuming `additional_context_suggestions` against a strategy registry, gated behind a feasibility study. User flagged two problems:

1. **The feasibility framing was anachronistic** — by 2026, tool-use loops are the default coding-agent pattern; studying "feasibility" implies a 2023 mental model.
2. **The requirements themselves were the root cause** — they baked in a batch-suggest-then-fulfil shape and extended V1's passive `additional_context_suggestions` into a load-bearing primitive. The LLD faithfully implemented what was specified, but what was specified was the wrong architecture.

Rearchitecture took four commits (requirements → ADR → LLD → skill). Net effect: task list collapsed from 9 to 8 (3 closed, 4 rewritten, 3 new), design simpler (two tools + one bounded loop vs. registry + taxonomy + multiple strategies), observability landed inline rather than as a follow-on.

## Process notes for `/retro`

- **`/architect` should challenge requirements, not just implement them.** The architect skill today reads requirements and produces LLDs against whatever framing is given. It should sanity-check the framing — especially for anything tagged as a "feasibility study" or "research spike" in 2026. Candidate skill-level guardrail: flag feasibility-study framing and ask whether the underlying approach is already ecosystem-standard.
- **Session logs are missing from planning skills.** Only `/feature-end` writes session logs today. `/requirements`, `/kickoff`, `/architect` don't, so multi-hour design sessions like this one leave no trace beyond git log. User flagged this at end of session; follow-up committed separately patches the three skills to emit session logs.
- **Pre-compact hook stubs are not enough.** Today's draft (`2026-04-16-session-4-draft.md`) captured files touched and one milestone, but missed the decision arc, the rearchitecture, and the skill change. Stubs are useful breadcrumbs, not substitutes.
- **"Just give the LLM ReadFile" was a user insight the architect missed.** Minimalism over registry scaffolding. The architect skill should bias toward smallest viable tool set and let call-log data drive expansion.

## Next step

Start `/feature-team epic 233` (E11, six tasks) when user is ready. E17 (#240) is ready too but has tighter dependency structure (4 waves); start after E11 wraps or run in parallel with care around the `finalise_rubric_*` RPC.
