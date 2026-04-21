# Session Log — 2026-04-22 Session 1: V4 Requirements

## Skill

`/requirements`

## Summary

Produced `docs/requirements/v4-requirements.md` — question generation quality refinements based on real assessment data from 2026-04-21.

## Context

First real-world use of V3's hint and comprehension depth features revealed two quality issues:

1. Hints restate the question instead of scaffolding recall
2. Conceptual-depth questions leak implementation details (specific type names, file paths, function signatures)

## Decisions

- **New v4 doc** rather than extending v3 (v3 is finalised and fully implemented)
- **Single epic, three stories** — all prompt engineering changes to the same files
- **OQ-1:** Hints are always landmark-style; null if no landmark exists (no format-style fallback)
- **OQ-2:** Scoring calibration (Story 1.3) proceeds now alongside hint and depth fixes

## Artefacts Produced

- `docs/requirements/v4-requirements.md` (Final, v1.0)

## Stories

| Story | Name | File |
|-------|------|------|
| 1.1 | Scaffolding hints | `prompt-builder.ts` |
| 1.2 | Depth-enforced question generation | `prompt-builder.ts` |
| 1.3 | Scoring calibration refinement | `score-answer.ts` |

## Next Steps

1. `/architect` to produce LLD for the epic
2. `/feature` for each story: 1.1 → 1.2 → 1.3
