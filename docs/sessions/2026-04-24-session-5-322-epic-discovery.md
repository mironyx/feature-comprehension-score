# Session 5 — 2026-04-24 — Epic-aware artefact discovery (#322)

Session ID: `258791ed-f49f-423a-ae4a-1123d29e8e40`

## Work completed

Implemented Epic 2 Stories 2.1 – 2.3 (issue #322): epic-aware artefact discovery. When the
assessment caller supplies issue numbers, the pipeline now expands them into their child
issues (sub-issues API + task-list parsing), pulls the merged PRs linked to those children,
and feeds the union of PRs + issue content into the rubric generation pipeline.

Changes shipped in PR #324 (merged):

- `src/lib/engine/ports/artefact-source.ts` — added `EpicDiscoveryResult`, extended
  `ArtefactSource` with `discoverChildIssues(params: IssueQueryParams)`.
- `src/lib/engine/prompts/artefact-types.ts` — added optional `number` to `LinkedIssueSchema`
  so `mergeIssueContent` can dedup by number rather than title.
- `src/lib/github/artefact-source.ts` — added `EPIC_DISCOVERY_FRAGMENT`,
  `buildEpicDiscoveryQuery` / `buildBatchCrossRefQuery` (dynamic-alias batched queries),
  pure helpers `parseTaskListReferences`, `extractMergedPrNumbers`, `collectDiscoveryResults`,
  `DiscoveryMechanism` type, and the adapter methods `discoverChildIssues`,
  `queryEpicDiscovery`, `batchDiscoverLinkedPRs`.
- `src/app/api/fcs/service.ts` — `extractArtefacts` now unions provided + child issue numbers;
  `resolveMergedPrSet` takes `childIssuePrs` as its third source; `mergeIssueContent` dedups
  by issue number when available.
- New tests: `tests/lib/github/epic-discovery.test.ts` (42), `tests/app/api/fcs-child-issues.test.ts`
  (17), `tests/evaluation/epic-discovery.eval.test.ts` (3 adversarial from evaluator).
- `tests/mocks/github.ts` — new factories `mockGraphQLEpicDiscovery`, `mockGraphQLBatchCrossRef`.

Post-review follow-up (commit `e824d5f`): the two new private methods were taking
`(owner: string, repo: string)` as separate params while the rest of the class uses
`RepoCoords`. Refactored to match the existing pattern. Opened issue #325 to consolidate
the wider `RepoCoords` / `RepoRef` / inline `{owner, repo}` divergence across the codebase.

LLD reconciled via `/lld-sync`: `docs/design/lld-v4-e2-epic-discovery.md` bumped to v0.2
(Revised). Captured the `collectDiscoveryResults` extraction, the `DiscoveryMechanism`
log field, and the `RepoCoords` signatures for `queryEpicDiscovery` / `batchDiscoverLinkedPRs`.

## Decisions made

- **2-query batched GraphQL over N REST calls.** Followed the LLD's design — Query 1
  (body + subIssues + nested PRs per sub-issue) uses dynamic aliases to cover all provided
  issues in one request; Query 2 (PRs for task-list-only children) batches via aliases
  again and is conditional on the task-list-only set being non-empty.
- **Dedup by issue number when available; fall back to title.** `LinkedIssueSchema.number`
  is optional — issues discovered via PR body cross-references don't have a reliable number,
  so the title fallback stays for them. Number-keyed dedup fixes the corner case of two
  distinct issues with identical titles (I6 in the LLD invariants table).
- **Graceful degradation on GraphQL failure.** Both Query 1 and Query 2 catch and log at
  warn level, returning empty results. Sub-issue PRs already resolved by Query 1 still flow
  through even if Query 2 fails. Justification comments added per CLAUDE.md's
  "no silent catch without explanation" rule.
- **Pressure tier: standard.** 282 src lines across 4 files. Triggered the full pipeline
  (`test-author` sub-agent for tests, `feature-evaluator` for coverage audit).

## Review feedback addressed

- **Evaluator FAIL on `discoveryMechanism` log field (AC coverage gap).** The acceptance
  criterion required logs to include a `discoveryMechanism` value ∈ `'sub_issues' | 'task_list' | 'both'`.
  Initial implementation only logged `childIssueCount` / `childIssueNumbers`. Fixed by
  adding the `DiscoveryMechanism` type, tracking per-issue `sawSubIssue` / `sawTaskList`
  flags inside `collectDiscoveryResults`, and surfacing the derived value in the log entry.
- **Silent catch blocks (blocking rule).** Added `// Justification:` comments explaining
  the degradation semantics (I7: pipeline continues unchanged when discovery fails).
- **Complexity budget on `discoverChildIssues` (34 lines, over 20).** Extracted the
  reduce-loop into `collectDiscoveryResults` — pure, unit-tested, brings the method to 16 lines.
- **User feedback (post-PR): 3 shapes for `{owner, repo}`.** The two new private methods
  used `(owner, repo)` separate params while the rest of the file uses `RepoCoords`.
  Fixed in commit `e824d5f` (9 lines). Wider cross-file consolidation (RepoCoords /
  RepoRef / inline) is genuinely out-of-scope for this PR — raised as issue #325 so the
  work doesn't get lost.

## Cost retrospective

| | Cost | Input | Output | Cache-read | Cache-write |
|---|---|---|---|---|---|
| PR creation (from PR body) | $15.87 | 1,028 | 107,945 | 24,694,581 | 499,692 |
| Final total | $22.17 | 2,934 | 150,927 | 32,760,458 | 698,660 |
| **Post-PR delta** | **+$6.30** | +1,906 | +42,982 | +8,065,877 | +198,968 |

The $6.30 post-PR overhead covers: the `RepoCoords` refactor commit (small), the `/lld-sync`
run, session log writing, and `/pr-review-v2` re-run. No review-driven code fixes — both
reviewers came back clean / with one non-blocking warning about an unspecified private
helper (resolved by the LLD update in this session).

### Cost drivers

- **Context compaction × 1** (mid-implementation, after PR creation). Contributed a
  noticeable cache-write bump but unavoidable at 203 turns.
- **22 vitest runs.** A large chunk came from iterating on MSW handler chaining — both
  `mockGraphQLEpicDiscovery` and `mockGraphQLBatchCrossRef` register against the same
  GraphQL endpoint and fall through based on query string. The first pass used
  `return new Response(null, { status: 501 })` as the "not mine" sentinel, which MSW
  treated as a terminal response rather than a fallthrough; second pass used `return undefined`
  which does fall through but trips over MSW's body-already-consumed error when two
  handlers both `await request.json()`. Final fix: `await request.clone().json()` inside
  each handler.
- **5 agent spawns** (test-author, feature-evaluator, ci-probe, 2× pr-review). Each
  re-sends the full diff. The test-author and evaluator costs feel proportionate — they
  write / audit real test code. The two pr-review agents together returned exactly one
  warning; next time on a similar-size diff (~280 lines), running the single-agent
  path would probably have been sufficient (the `pr-review-v2` heuristic uses a 150-line
  threshold which is probably too conservative for a diff that's 60% test code).

### Improvement actions

1. **MSW fall-through pattern.** When chaining two handlers on the same endpoint, always:
   (a) read via `request.clone().json()`, (b) return `undefined` (not a `Response`) from
   the non-matching handler. Saved as a reusable insight — add to the testing playbook.
2. **Heuristic: write the complexity-budget check into the initial skeleton.** The
   `discoverChildIssues` body was over-budget on first pass. If the LLD snippet is
   already ≥ 20 lines when you paste it, extract the helper BEFORE implementing — not
   after `/diag` flags it.
3. **Grep same-file patterns before picking a parameter shape.** The memory
   `feedback_grep_existing_types_before_inventing.md` existed already — it didn't
   prevent the RepoCoords/(owner, repo) mistake because I didn't re-read it before
   adding the new private methods. Sharpened the memory with "same-file inconsistency"
   as the concrete trigger.

## CI / verification

- Full vitest run: 1351 / 1351 passing
- `tsc --noEmit`: clean
- `npm run lint`: clean
- GitHub Actions CI on `feat/epic-aware-discovery`: green (ci-probe background agent reported success)

## Next steps / follow-ups

- **Issue #325** — consolidate `RepoCoords` / `RepoRef` / inline `{owner, repo}` across
  `src/app/api/fcs/`, `src/lib/engine/ports/`, `src/lib/github/`. Added to the board at Todo.
- **Epic #321 checklist** — issue #322 ticked off when #324 merges; next E2 work (if any
  Stories 2.4+ exist) picks up from there.

## References

- Issue: <https://github.com/mironyx/feature-comprehension-score/issues/322>
- PR: <https://github.com/mironyx/feature-comprehension-score/pull/324>
- LLD: `docs/design/lld-v4-e2-epic-discovery.md` (v0.2, Revised)
- Follow-up issue: #325 (repo-coordinate type unification)
