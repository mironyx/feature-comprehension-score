# Session Log — 2026-04-13 Session 3: Scoring Analysis & Tiered Process

## Context

First real assessment submitted with participant answers. Analysis of scores
revealed critical bugs and prompted process improvements for handling new
features within an existing project.

## Issues Created

| # | Type | Title |
|---|------|-------|
| #212 | Bug | Scoring prompt doesn't specify 0-1 scale — inverted scores |
| #213 | Bug | NULL score not retried or surfaced to user |
| #214 | Feature | Rubric generator produces answer-guidance hints per question |
| #215 | Feature | Configurable comprehension depth for rubric generation |

### Scoring bugs (#212, #213)

Analysed `participant_answers_rows.csv` and `assessment_questions_rows.csv`
from the first real assessment. Findings:

- **Score inversion:** All 4 scored answers got 1.00 (maximum on 0-1 scale)
  despite rationales describing poor/incorrect answers. Root cause: the scoring
  prompt in `src/lib/engine/scoring/score-answer.ts` says
  `{ "score": number }` but never specifies the 0-1 range. The LLM returns 1
  meaning "lowest on a 1-5 scale", which the Zod schema accepts as valid.
- **NULL score on Q5:** The modification_capacity question was marked relevant
  but has no score or rationale. Likely caused by the LLM returning a score >1
  (e.g. 3 on a 1-5 scale), which Zod rejects as `validation_failed`
  (non-retryable).

### Reference answer depth discussion (#215)

Reviewed the article (`local-docs/medium-article-review-and-theory-v3.md`) and
discussed whether reference answers are testing theory (Naur's sense) or
memorisation. Key insight: reference answers are at Part B depth
(implementation precision) when Part A depth (behavioural understanding) would
better measure actual comprehension. Proposed configurable depth setting
(conceptual vs detailed) for rubric generation and scoring.

### Answer guidance (#214)

Participants had no calibration for expected answer depth — all answers were
5-10 words against paragraph-length reference answers. Proposed `hint` field
per question generated alongside the rubric.

## Process Decisions

### ADR-0022: Tiered Feature Process

Identified that the full pipeline (`/discovery → /requirements → /kickoff →
/architect → /feature`) is overkill for single features within an existing
project. Formalised four tiers:

| Tier | Scope | Pipeline |
|------|-------|----------|
| 1 | Bug/hotfix | Issue → `/feature` |
| 2 | Feature | `/requirements` → `/architect` → `/feature` |
| 3 | Large epic/phase | Add `/kickoff` |
| 4 | New project | Add `/discovery` |

### `/architect` accepts requirements docs

Extended Step 1 to detect whether input is a plan file or requirements
document. When requirements doc: extract epics/stories directly, skip
`/kickoff`-specific concerns. Minimal change — one paragraph added.

### `/requirements` accepts GitHub issue numbers

Added support for `/requirements #215` and `/requirements #214,#215` to read
issue bodies directly via `gh issue view`. Eliminates manual copy-paste of
issue content into freeform briefs. Multiple issues combined into a single
requirements doc.

## Commits

- `5045623` — ADR-0022 + `/architect` requirements input + CLAUDE.md update
- `ad2b7a6` — `/requirements` GitHub issue number support

## Next Steps

1. Fix #212 (scoring prompt scale) — tier 1, straight to `/feature`
2. Fix #213 (NULL score handling) — tier 1, same or separate PR
3. Test tier-2 process: `/requirements #214,#215` → `/architect` → `/feature`
4. Push commits from this session
