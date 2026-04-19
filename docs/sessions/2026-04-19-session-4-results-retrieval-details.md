# Session 4 — 2026-04-19 — Results UI: Retrieval Details + Missing Artefacts (#247)

**Issue:** #247 — feat: results UI — retrieval details + missing artefacts summary
**PR:** [#270](https://github.com/mironyx/feature-comprehension-score/pull/270)
**Parent epic:** #240 (E17 — Agentic Artefact Retrieval)
**Branch:** `feat/feat-results-retrieval-details-ui`
**Design reference:** `docs/design/lld-v2-e17-agentic-retrieval.md §17.2b`

## Work completed

- New `RetrievalDetailsCard` component at `src/components/assessment/RetrievalDetailsCard.tsx`.
  Collapsible `<details>` section; hidden when `rubric_tool_call_count` is `0` or `null`.
  Renders header totals (calls · bytes · input tokens · duration), a "Missing artefacts"
  summary for `not_found` outcomes, and a list of entries with `text-destructive` warning
  styling on `forbidden_path`, `budget_exhausted`, and `iteration_limit_reached`.
- Wired into the FCS results page at `src/app/assessments/[id]/results/page.tsx`, narrowing
  the `rubric_tool_calls` JSONB column via `readonly ToolCallLogEntry[] | null`.
- 19 component tests (`tests/components/retrieval-details-card.test.ts`) — covering all
  11 BDD specs from the LLD plus 8 adversarial/extra cases. Written by the `test-author`
  sub-agent against the spec only; evaluator added one gap test for `error` outcome styling.
- LLD §17.2b synced: corrected file paths (no `(app)` route group; API contract/service
  files untouched because the results page bypasses the API layer and reads Supabase
  directly), added `iteration_limit_reached` to the warning set in component-behaviour
  bullets, fixed "total extra tokens" wording to "total extra input tokens".

## Decisions made

- **Simplicity first:** chose Option B (component + page wiring only) over extending
  the API contract. The results page already reads observability columns directly from
  the assessments row via `createSecretSupabaseClient` — threading the same data through
  the API route would have been pure churn.
- **Warning set widened to three outcomes:** the LLD component-behaviour bullet mentioned
  only `forbidden_path` and `budget_exhausted`, but the BDD specs required
  `iteration_limit_reached` too. Followed the BDD specs and fixed the bullet in the LLD
  sync.
- **Duplicate-key safety in `MissingArtefactsSummary`:** PR review flagged `key={p}` as
  unsafe when the same `not_found` path appears twice. Fixed to `key={`${i}-${p}`}`.
- **24-line render function left as-is:** PR review noted the render body exceeds the
  20-line CLAUDE.md budget. JSX-heavy render functions in the codebase routinely exceed
  this; the reviewer's own note was "a senior reviewer would generally wave through".
- **Pre-existing markdown lint failure fixed in the same branch:** `lld-v2-e17 §17.1d`
  had asterisk emphasis (`*or*`) inherited from PR #269 that failed markdownlint and
  blocked CI on this PR. Fixed as a 2-character emphasis-style change (`_or_`).

## Review feedback addressed

- `[design-contract]` duplicate-key risk → **fixed** in follow-up commit.
- `[compliance]` render function ~24 lines → **deferred**, documented in PR body.

## Cost retrospective

| Stage | Cost | Tokens (in/out) | Notes |
| --- | --- | --- | --- |
| PR creation | $6.6695 | 930 / 38,987 | 13 min to PR |
| Final | $10.4050 | 2,916 / 71,112 | +$3.74 post-PR work |

**Delta breakdown:**

- PR review: 1 quality agent (0 blockers, 2 warnings).
- ci-probe: 2 runs (initial + after follow-up commit).
- 1 follow-up commit (duplicate-key fix + markdown lint).
- 1 context compaction event (summary rebuild after turn ~132).

**Drivers:**

| Driver | Detected | Impact |
| --- | --- | --- |
| Context compaction | Yes — session resumed from summary after turn ~132 | High — re-summarising inflated cache-write tokens (478K cache-write is notable) |
| Agent spawns | 4 (test-author, evaluator, ci-probe ×2 if counting re-launch, pr-review) | Medium |
| Fix cycles | 1 post-review commit | Low |
| LLD gap | Yes — API contract files listed but not needed; warning set missed `iteration_limit_reached` | Low — surfaced in sync, no implementation delay |

**Improvement actions for next time:**

- **LLD should own the route-group assumption:** every FE-facing LLD section should
  check whether the target page is inside `(app)` / `(authenticated)` or a flat route
  before listing files to modify. This has now bitten three syncs in a row (#251, #246,
  #247). Consider adding a route-group callout template to `/lld`.
- **BDD ↔ behaviour bullets:** when the LLD contains both prose bullets and BDD specs,
  validate they agree on enumerated sets (e.g., which outcomes get warning styling)
  before handing to implementation. An earlier pass would have caught the
  `iteration_limit_reached` mismatch without a sync round.
- **Pre-existing markdown lint:** consider a repo-wide `npx markdownlint-cli2 --fix`
  sweep scheduled outside feature work; the 2-char fix here unblocked CI but leaked
  scope.

## Next steps

- E17 remaining tasks visible on the board: `gh issue list --label kind:task --state open`.
- No follow-ups spawned by this issue.
