# Session Log — 2026-04-24 Session 3: Architect E2

| Field | Value |
|-------|-------|
| Skill | architect |
| Scope | V4 Epic 2 — Epic-Aware Artefact Discovery |
| Issues | #321 (epic), #322 (task) |

## What was done

- Read V4 requirements (Epic 2: Stories 2.1, 2.2, 2.3) and predecessor LLD (E19)
- Explored codebase surface: `ArtefactSource` port, `GitHubArtefactSource` adapter, `resolveMergedPrSet`, `extractArtefacts`, `mergeIssueContent`, `CROSS_REF_QUERY`
- Assessed decomposition: all three stories share `artefact-source.ts` and `service.ts`, total ~150 lines — single task, no split
- Produced LLD: `docs/design/lld-v4-e2-epic-discovery.md` (Part A + Part B)
- Created epic issue #321 and task issue #322 with acceptance criteria and BDD specs
- Committed LLD

## Design decisions

- **Single task** — all three stories share files, total under 200 lines, no clean seam for independent deployment
- **Sub-issues API** — GitHub's native `subIssues` GraphQL field (available since 2025) for reliable child discovery
- **Task list parsing** — best-effort `- [x] #N` regex as secondary mechanism, unioned with sub-issues
- **Number-based dedup** — `mergeIssueContent` switches from title-based to issue-number-based deduplication to prevent incorrect merging of distinct issues with the same title
- **Optional `number` field on `LinkedIssue`** — backward compatible; PR-body-discovered issues don't carry a number
- **No caching** — `fetchIssueBody` fetches body a second time (also fetched by `fetchIssueContent`); acceptable for 1–3 issues

## Next steps

- `/feature` for #322 — implement all three stories in order (2.1 → 2.2 → 2.3)
