# Session Log — 2026-04-21 Session 4 — #287 Accept issue numbers at assessment creation (E19.1)

**Issue:** [#287](https://github.com/mironyx/feature-comprehension-score/issues/287)
**PR:** [#289](https://github.com/mironyx/feature-comprehension-score/pull/289)
**Branch:** `feat/e19-accept-issue-numbers` (worktree: `../fcs-feat-287-e19-accept-issue-numbers`)
**Session IDs:** `1dee2898-cf35-464e-b522-057e8400bf34`

## Scope

E19.1 — accept `issue_numbers` in the POST `/api/fcs` request body alongside or instead of `merged_pr_numbers`. Either of the two can be provided; at least one is required. New `fcs_issue_sources` table persists issue numbers per assessment so the retry path can rebuild artefacts from issues alone. Issue body + comments are fetched into `linked_issues` and deduped by title against PR-discovered issues. Frontend form gets an Issue numbers input with at-least-one helper text.

## Work completed

- **Schema** — added `fcs_issue_sources` table (id, org_id, assessment_id, issue_number, created_at) with an `fcs_issues_select_member` RLS policy and an `idx_fcs_issues_assessment` index. Generated migration `20260421130150_fcs_issue_sources.sql` via `npx supabase db diff` after editing the declarative schema; `db reset` confirmed clean.
- **RPC** — extended `create_fcs_assessment` with `p_issue_sources jsonb DEFAULT '[]'`. Inserts into `fcs_issue_sources` in the same transaction as PR + participant inserts.
- **Port** — added `IssueContentParamsSchema` + `fetchIssueContent` to `src/lib/engine/ports/artefact-source.ts`.
- **GitHub adapter** — implemented `GitHubArtefactSource.fetchIssueContent` and the private `fetchSingleIssue` helper. Fetches issue + comments in parallel via Octokit, combines into `${body}\n\n## Comments\n\n${comments.join('\n\n---\n\n')}`. Transient errors log + return null (intentional, noted as observability follow-up).
- **Service layer** — made `merged_pr_numbers` optional on `FcsCreateBodySchema`, added optional `issue_numbers`, `.refine()` enforcing at-least-one with exact 422 message. `validateIssues` rejects 422 for not-found or PR-that-looks-like-issue with verbatim guidance. `extractArtefacts` refactored to params object, merges explicit issue content into `linked_issues` via `mergeIssueContent` (dedup by title). Retry path reads both `fcs_merged_prs` and `fcs_issue_sources` in parallel.
- **Frontend** — added `issueNumbers` FormState field, `findInvalidNumbers` helper, renamed `parsePrNumbers` → `parsePositiveIntegers`, at-least-one validation, new input with helper text. Updated `tests/evaluation/ui-polish-forms.eval.test.ts` AC-1b: replaced "PR numbers required `*`" check with "at least one of PR numbers or issue numbers" helper-text check.
- **Tests** — 49 new: 29 in `tests/app/api/fcs-issue-numbers.test.ts` (schema validation, issue validation 422s, persistence, retry path); 15 in `tests/app/assessments/create-assessment-form-issue-numbers.test.ts`; 5 adversarial from the evaluator in `tests/lib/github/artefact-source.test.ts` covering `fetchIssueContent` shape and dedup-by-title.

## Decisions made

- **No dedicated LLD** — E19.1 is scoped tightly enough to work directly against `docs/requirements/v2-requirements.md` §Story 19.1. Step 1.5 `/lld-sync` skipped because no LLD file exists (`docs/design/lld-e19*.md` absent).
- **Comment concatenation** — `fetchSingleIssue` concatenates comments into the body string with a `## Comments` separator. Keeps `LinkedIssue` shape unchanged but means §Story 19.1's "truncate comments before body" promise cannot be satisfied at the current seam (the budget module sees one opaque string). Flagged by the evaluator as a spec/impl gap; deferred to 19.2 where a structured `{ body, comments }` shape would let the budget module truncate in priority order.
- **REST over GraphQL for validation** — `validateIssues` + `fetchSingleIssue` each make one REST call per issue (2N total). Explicitly kept REST here per user guidance; 19.2 will collapse both into a single GraphQL batch query.
- **Defence-in-depth org scoping** — `adminSupabase` bypasses RLS, so the retry-path reads on `fcs_merged_prs` and `fcs_issue_sources` were scoped by `org_id` in addition to `assessment_id`. Follow-up commit after team-lead note on bypass risk.
- **Justification comments added post-review** — `mergeIssueContent`, `fetchSingleIssue`, and `findInvalidNumbers` each got `// Justification:` comments after pr-review-v2 flagged them as unspecified helpers (LLD-less project). The `as unknown as Json` double-cast on `p_issue_sources` was left in place — consistent with adjacent `p_merged_prs` / `p_participants` casts; project-wide refactor material, not this PR's concern.

## Review feedback addressed

- **pr-review-v2** — 0 blockers, 4 warnings. Fixed 3 of 4 in commit `2c620b0` (justification comments). 1 anti-pattern (`as unknown as Json`) acknowledged, left for project-wide refactor.
- **Team lead — RLS scoping** — scoped `adminSupabase.from('fcs_*').select(...)` reads by `org_id` in commit `2bddab5`.
- **Team lead — GraphQL note** — acknowledged, deferred to 19.2.

## Feature-evaluator verdict

PASS WITH WARNINGS. 5 adversarial tests appended to `tests/lib/github/artefact-source.test.ts`:

1. `fetchSingleIssue` returns body-only when no comments
2. appends comments under `## Comments` separator
3. fetches multiple issues in parallel
4. gracefully handles 404 (null + filter out)
5. `mergeIssueContent` dedup-by-title property

Two warnings (both non-blocking, deferred):

1. AC-8 comment-truncation priority has no enforceable seam in the current `LinkedIssue` shape. Follow-up.
2. `fetchSingleIssue` silently drops issues on transient GitHub errors. Intentional; observability follow-up.

## CI

PR #289 CI run 24726881178 — all jobs green (lint + type-check, unit, integration-Supabase, E2E-Playwright, Docker). ~5 min.

## Cost retrospective

| Metric | Value |
| --- | --- |
| PR-creation cost | $12.1201 |
| Final cost | $17.8534 |
| Delta (post-PR) | $5.7333 |
| Tokens (final) | 22,604 input / 125,806 output / 22.85M cache-read / 790k cache-write |
| Time to PR | 1h 2min |

### Cost drivers

- **Context compaction** (high) — the session hit compaction mid-commit, forcing a full context re-read and re-summarise. The post-compact continuation accounts for most of the $5.73 post-PR delta (evaluator + review + justifications + org_id scoping happened after compaction). Compaction is expensive because the full JSONL + summary get rehydrated on every tool call until the cache warms up again.
- **Agent spawns** (medium) — 1 test-author + 1 feature-evaluator + 3 pr-review agents + 2 ci-probe + 1 diagnostics-checker = 8 sub-agents in total. Each one receives a targeted prompt with diff excerpts rather than the full diff, so spawn cost is low per agent.
- **RED→fix cycles** (low) — one pre-existing test failure to fix (`ui-polish-forms.eval.test.ts` AC-1b needed relaxing because PR numbers became optional). One eslint unused-import fix. No multi-round mock debugging.

### Improvement actions

- **Compaction mitigation** — the session log writer (Step 2) ran post-compaction and still had access to the draft snapshot from `docs/sessions/2026-04-21-session-4-draft.md`. Draft snapshots are working as intended; no action needed.
- **Evaluator role** — evaluator returned 5 adversarial tests, 2 of them recognisably feature-stage coverage (AC-7 `fetchIssueContent` body/comments shape). The test-author prompt said "test the HTTP API surface," which meant `fetchIssueContent` was not tested at module level by the feature-stage test file. For the next port-introducing feature, **extend the test-author prompt to include `tests/lib/<adapter>/<file>.test.ts` for each new port method**, so the evaluator stays in its coverage-audit role rather than backfilling port tests.
- **REST → GraphQL on port boundary** — already captured as work for 19.2.

## Next steps

- 19.2 (GraphQL batch fetch + structured `LinkedIssue { body, comments }` for budget-module prioritisation)
- Continue with next epic E19 task from the board.
