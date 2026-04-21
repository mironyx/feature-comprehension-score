# Session Log — 2026-04-21 (Session 6, FCS-288)

Session ID: `c22a241b-105d-494d-85b6-09835d7ece50`

## Issue / PR

- Issue: [#288 — feat: discover linked PRs from issues (E19.2)](https://github.com/mironyx/feature-comprehension-score/issues/288)
- PR: [#292](https://github.com/mironyx/feature-comprehension-score/pull/292)
- Parent epic: #286 (E19 — GitHub Issues as Artefact Source)
- Branch: `feat/e19-discover-linked-prs`

## Work completed

- Added `GitHubArtefactSource.discoverLinkedPRs` — GraphQL query on `CROSS_REFERENCED_EVENT` timeline items per issue, filters merged PRs, dedups across issues via `Set` + `Promise.all`.
- Extended the `ArtefactSource` port; initially introduced `DiscoverLinkedPRsParamsSchema` / `IssueContentParamsSchema`, then consolidated into a single shared `IssueQueryParams` (same input shape: `{owner, repo, issueNumbers}`) during review.
- Wired discovery into `extractArtefacts` via a private `resolveMergedPrSet` helper that unions explicit + discovered PRs, deduplicates, and logs `{explicitPrs, discoveredPrs, mergedPrs}` at info.
- Extracted `RepoCoordsSchema` / `RepoCoords` as a shared Zod base so `PRExtractionParamsSchema` and `IssueQueryParamsSchema` both `.extend()` it. Removed the duplicate private `RepoCoords` interface in the adapter and a new-but-duplicate `RepoRef` interface I introduced in `service.ts`.
- Added MSW factories for `mockGraphQLCrossRefs` and `mockGraphQLError` so the test-author sub-agent had ready tooling.
- Test-author produced 8 property tests for `discoverLinkedPRs`; I added 6 service-level integration tests covering union, dedup, issue-only, skip-when-no-issues, logging, and issue content merge.
- LLD `docs/design/lld-e19.md` updated (§19.1 + §19.2): port signatures changed to params-object form, `RepoCoordsSchema` added as base, `resolveMergedPrSet` noted, status bumped Draft → Revised.

## Decisions made

- **Params-object over positional.** LLD spec had `discoverLinkedPRs(owner, repo, issueNumbers)`; implementation uses `discoverLinkedPRs(params: IssueQueryParams)` so the Zod schema at the port boundary stays the single source of truth. Noted as a design deviation and synced to the LLD.
- **One schema per input concept, not per verb.** `discoverLinkedPRs` and `fetchIssueContent` have structurally identical inputs (`{ owner, repo, issueNumbers }`). KISS: one shared `IssueQueryParams` — the different outputs are already documented by method name and return type.
- **Reuse `RepoCoords`, don't invent `RepoRef`.** The adapter already had `interface RepoCoords`. I initially added a parallel `RepoRef` in `service.ts` and missed it; user caught it on review. Refactored to import `RepoCoords` from the port.

## Review feedback addressed

- PR review (automated) was clean on the initial commit.
- User review flagged:
  1. `DiscoverLinkedPRsParamsSchema` duplicated `IssueContentParamsSchema` — merged into shared `IssueQueryParams`.
  2. `interface RepoRef` in `service.ts` duplicated `RepoCoords` in `artefact-source.ts` — unified via shared port export.
  3. LLD `RepoCoords` type should be the base for all port schemas — done via `RepoCoordsSchema.extend(...)` pattern.
- Three commits on the branch: initial feat + two refactor commits (`8964173`, `67301bb`).

## Verification (final state)

- `npx vitest run` — 1121 passed (14 new tests: 8 unit + 6 service integration)
- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run lint:md` — 2 pre-existing errors in `docs/reports/retro/2026-04-21-process-retro.md` (unrelated)
- CI run 24730715958 — green (lint, types, unit, integration, E2E, Docker build)
- PR review (automated) — 0 findings on both Quality and Design Conformance agents

## Next steps

- E19.3 (#282) already shipped — epic next step is E19.4 (PR request body accepts `issue_numbers`) and frontend work on the form; check the parent epic #286 checklist for the next open task.

## Cost retrospective

### Summary

| Stage | Cost | Input | Output | Cache-read | Cache-write |
|-------|------|-------|--------|------------|-------------|
| At PR creation | $7.2291 | 2,896 | 49,858 | 8,052,967 | 361,105 |
| Final | $12.5657 | 3,080 | 83,447 | 15,219,453 | 525,657 |
| **Delta (post-PR)** | **+$5.34** | +184 | +33,589 | +7,166,486 | +164,552 |

Post-PR cost was **74% of the original PR-creation cost** — almost as much again on review fixes.

### Cost drivers

| Driver | Detected | Impact |
|--------|---------|--------|
| Context compaction | Yes — summary tag "This session is being continued…" at turn ~83 | High — summary + replay inflated cache tokens |
| Review fix cycles | 2 extra refactor commits after initial PR | Medium — each cycle ran full vitest + tsc + lint |
| Agent spawns | test-author ×1, feature-evaluator ×1, ci-probe ×1, pr-review quality ×1, pr-review design ×1 = 5 | Medium |
| Missed existing type | `RepoCoords` already in the same file I edited — forced a second refactor commit | Medium |
| Duplicate schema | `DiscoverLinkedPRsParamsSchema` == `IssueContentParamsSchema` — third refactor | Low–medium |

### Improvement actions

- **Grep for existing types before inventing new ones.** When adding a new `{owner, repo}`-style interface, `Grep` the file I'm editing and its sibling files first. Saved as feedback memory.
- **Compare param-object schemas at the port boundary before committing.** If two new schemas have structurally identical fields, merge them — structurally-identical schemas with different names is a code smell, not clarity.
- **LLD/implementation signature alignment at design time.** Spec'ing positional args when the rest of the port uses params-objects is a predictable churn source. Next LLD: flag inconsistency in signature style in the `/architect` phase.

## Links

- LLD: `docs/design/lld-e19.md` §19.1, §19.2 (Revised 2026-04-21)
- Test file (sub-agent): `tests/lib/github/discover-linked-prs.test.ts`
- Service integration tests: `tests/app/api/fcs-service-logging.test.ts` (`describe('extractArtefacts with issue numbers — Story 19.2 (#288)')`)
- Mocks: `tests/mocks/github.ts` (`mockGraphQLCrossRefs`, `mockGraphQLError`)
