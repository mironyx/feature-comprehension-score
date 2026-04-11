# Session Log — 2026-04-11 Session 3: /requirements Skill Creation

## Context

Roadmap item 3 from `docs/plans/2026-04-11-article-and-skills-roadmap.md`. Now that `/discovery` exists (session 2), created the `/requirements` skill to bridge discovery output to `/kickoff`.

## What was done

### /requirements skill created

- New skill at `.claude/skills/requirements/SKILL.md`
- Flexible input: accepts a discovery doc (preferred) or a freeform brief for smaller projects
- Output: `docs/requirements/v{N}-requirements.md` matching the format established by `v1-requirements.md`
- Six-step process: orient, domain clarification (brief only), draft structure, write ACs, testability validation, finalise

### Key design features

- **Priority ordering** — epics numbered in priority order with stated rationale (Product Owner perspective)
- **INVEST check** — applied inline while writing each story (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- **Testability validation** (Step 5) — evaluator step that scans every AC for vague qualifiers, missing preconditions, unclear outcomes, and missing negative cases. Produces a testability report table and fixes issues in-place
- **Two human gates** — Gate 1 after structure (epics, stories, roles — no ACs yet), Gate 2 after full ACs with testability report
- **`[Review]` markers** — same async feedback pattern as `/discovery`

### CLAUDE.md updated

- Pipeline updated: `idea → /discovery → /requirements → /kickoff → /architect → /feature → /feature-end → /retro`
- `/requirements` added to Custom Skills list
- `/discovery` description updated to point to `/requirements` instead of `/kickoff`

### /discovery skill updated

- Replaced all "future `/requirements` skill" references with concrete `/requirements` pointers
- Updated pipeline diagram: `idea.md → /discovery → discovery.md → /requirements → requirements.md → /kickoff`
- Next steps section now points to `/requirements` as first step after finalising discovery

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input flexibility | Discovery doc or freeform brief | New projects use discovery; smaller features can skip it |
| Priority ordering | Included (PO perspective) | User confirmed — priority is important for downstream sequencing |
| Gates | 2 (structure, then full ACs) | Matches discovery pattern; catch epic/story shape errors before investing in AC detail |
| Testability validation | Built into skill as Step 5 | Evaluator-at-every-stage pattern from roadmap item 4; catches vague ACs before they propagate |
| Domain research | Only for freeform briefs (2-3 searches) | Discovery docs already contain research; avoid redundant work |

## Not done

- No GitHub issue created (roadmap says "convert to issues when ready to implement")
- Evaluator coverage audit (roadmap item 4) — independent track, not started
- Article revision (roadmap item 1) — independent, ready now

## Next steps

- Test `/requirements` on a real discovery doc or brief to validate the flow
- Consider adding evaluator checks to `/kickoff` and `/architect` (roadmap item 4)
- Article revision can proceed independently
