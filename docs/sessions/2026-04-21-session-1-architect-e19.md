# Session Log — 2026-04-21 Session 1: Architect E19

| Field | Value |
|-------|-------|
| Date | 2026-04-21 |
| Skill | `/architect` |
| Scope | Epic 19 — GitHub Issues as Artefact Source |
| Duration | ~30 min |

## What was done

1. **Read and analysed** E19 requirements (v2-requirements.md, Stories 19.1–19.3).
2. **Explored codebase** — mapped assessment creation pipeline (`POST /api/fcs`, `service.ts`, `artefact-source.ts`, `create_fcs_assessment` RPC, `fcs_merged_prs` table, `CreateAssessmentForm`).
3. **Identified requirements gap** — Story 19.1 specifies the API change but is missing frontend form ACs. User confirmed adding frontend ACs to 19.1 in the LLD.
4. **Produced LLD** — `docs/design/lld-e19.md` covering all three stories with Part A (flows, diagrams, invariants, ACs) and Part B (file-level contracts, BDD specs, internal decomposition).
5. **Created issues:**
   - #286 — epic: GitHub Issues as Artefact Source (E19)
   - #287 — feat: accept issue numbers at assessment creation (E19.1)
   - #288 — feat: discover linked PRs from issues (E19.2)
   - #282 — updated existing issue with epic reference and design detail (E19.3)
6. **Committed** LLD.

## Key design decisions

- **GraphQL only for 19.2** (PR discovery via cross-reference events). 19.1 uses REST for issue fetching — simpler, N is small.
- **New `fcs_issue_sources` table** mirrors `fcs_merged_prs` pattern. Separate table, not mixed.
- **Frontend ACs added to 19.1** — issue numbers input field, relaxed validation (at least one of PRs or issues).
- **Sequential execution** — all three tasks share `service.ts`, so waves are T1→T2→T3.

## Execution waves

| Wave | Issue | Task |
|------|-------|------|
| 1 | #287 | Accept issue numbers (DB + API + FE) |
| 2 | #282 | Enhanced logging |
| 3 | #288 | Discover linked PRs (GraphQL) |

## Open questions

None — all ambiguities resolved during the session.

## Next steps

Human reviews LLD and issues, then `/feature` implements #287 first.
