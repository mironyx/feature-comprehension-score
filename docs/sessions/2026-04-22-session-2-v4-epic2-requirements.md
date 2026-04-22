# Session Log — 2026-04-22 Session 2: V4 Requirements — Epic 2

## Skill

`/requirements`

## Summary

Extended `docs/requirements/v4-requirements.md` with Epic 2: Epic-Aware Artefact Discovery. Three stories, 13 ACs, all open questions resolved, testability validated, finalised.

## Context

Testing with epic #294 as an assessment source revealed that the pipeline discovers zero PRs and zero files. Root cause: V2 Epic 19's `discoverLinkedPRs` only checks cross-references on the provided issue itself. Epics link to child task issues (#295, #296, #297), and those child issues have the merged PRs — not the epic directly. The LLM received only ~2,356 input tokens (epic body text) and generated questions from almost no context.

## Decisions

- **Extend V4 rather than create V5** — V4's Epic 1 (question generation quality) is not yet implemented, so adding Epic 2 here keeps related pipeline improvements together
- **Two discovery strategies, union both** (OQ-3) — GitHub native sub-issues + task list reference parsing (`- [x] #N`), deduplicated by issue number
- **Always attempt child discovery** (OQ-4) — no label check or `is_epic` flag; simplest approach, no-op if no children found
- **Sub-issues = reliable path, task list = best-effort** — admin always has manual workaround (provide child issue numbers or PRs explicitly)
- **Gradual GraphQL adoption** — use GraphQL for new Epic 2 features; don't mandate migrating existing REST calls
- **No Jira adapter** — keep `ArtefactSource` port provider-agnostic where cheap, but no abstract issue tracker interface
- **One-level traversal only** — epic → child issues, no recursive expansion

## Stories added

| Story | Summary | ACs |
|-------|---------|-----|
| 2.1 | Discover child issues from epics (sub-issues + task list parsing) | 9 |
| 2.2 | Feed child issue PRs into artefact extraction | 7 |
| 2.3 | Include child issue content in LLM context | 5 |

## Testability fixes

- Story 2.1: Added AC for no-children logging case (`childIssueCount: 0`, `discoveryMechanism` omitted)
- Story 2.3: Noted token budget AC is forward-looking (budgeting not yet active)

## Commits

- `6971cb0` — docs: v4 requirements structure — Epic 2
- `f0420ab` — docs: v4 requirements — acceptance criteria for Epic 2
- `25752b0` — docs: v4 requirements — testability fixes for Epic 2
- `50eb21a` — docs: finalise v4 requirements — Epic 2 reliability note, status Final

## Next steps

1. Run `/architect` for Epic 2 (separate LLD — different codebase surface from Epic 1)
2. Run `/feature` for Epic 2 stories: 2.1 → 2.2 → 2.3
