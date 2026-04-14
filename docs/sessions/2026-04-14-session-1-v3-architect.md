# Session Log — 2026-04-14 Session 1: V3 Architect

## Summary

Ran `/architect` against `docs/requirements/v3-requirements.md` to produce design artefacts for the two v3 epics: answer guidance hints (#214) and configurable comprehension depth (#215).

## What was done

1. **Codebase analysis** — read all files in the change surface: `schemas.ts`, `prompt-builder.ts`, `score-answer.ts`, `assess-pipeline.ts`, `artefact-types.ts`, `service.ts` (FCS creation), `create-assessment-form.tsx`, `question-card.tsx`, `results/page.tsx`, `functions.sql`, `tables.sql`.

2. **LLD: E1 Answer Guidance Hints** (`docs/design/lld-e1-hints.md`)
   - 3 stories: hint generation (schema + prompt), hint storage (DB + RPC), hint display (UI)
   - Schema: optional `hint` field in `QuestionSchema` (max 200 chars), nullable `hint` column in `assessment_questions`
   - Prompt: add hint instruction to system prompt with "do not reveal reference answer" constraint
   - UI: `QuestionCard` gets `hint` prop, muted italic style below question text

3. **LLD: E2 Configurable Comprehension Depth** (`docs/design/lld-e2-comprehension-depth.md`)
   - 4 stories: depth config (DB + form + API), depth-aware generation (prompt), depth-aware scoring, depth results display
   - Schema: `config_comprehension_depth` column on `assessments` (NOT NULL, default `'conceptual'`, CHECK constraint)
   - Prompt: depth-conditional system prompt section (conceptual = reasoning, detailed = specifics)
   - Scoring: depth-conditional calibration block in scoring prompt
   - PRCC path: defaults to `'conceptual'` via DB default — no webhook change needed

4. **Issue enrichment** — updated #214 and #215 with story tables, acceptance criteria, BDD specs, file references, and design doc pointers.

5. **Committed** — `d244ef4`

## Decisions

- **Two separate LLDs** (one per epic) rather than combined — each epic has distinct concerns despite shared prompt surface.
- **Sequential implementation** (1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 2.4) — simpler than wave-based parallelism for 7 small stories.
- **Combined migration** for Stories 1.2 and 2.1 — single `db diff` for both `hint` column and `config_comprehension_depth` column.
- **No ADRs needed** — both features are requirements-driven, not cross-cutting architectural decisions.
- **No epic splits** — each story is already sized for a single `/feature` cycle (< 200 lines).

## Open items

- **#212 (scoring scale bug)** must be resolved before Story 2.3 (depth-aware scoring).
- Stories 1.2 and 2.1 share a migration — implement 1.2 first, then 2.1 adds to the same schema files before generating the migration.

## Next steps

1. Review the two LLDs.
2. `/feature` for Story 1.1 (hint generation in rubric pipeline).
