---
date: 2026-04-21
session: 7
issue: 291
pr: 293
epic: 286
---

# Session 7 — Fix: persist issue_title in fcs_issue_sources (#291)

| Field | Value |
|-------|-------|
| Issue | #291 (E19 follow-up, parent epic #286) |
| PR | [#293](https://github.com/mironyx/feature-comprehension-score/pull/293) |
| Branch | `fix/e19-fix-issue-title` |
| LLD reference | `docs/design/lld-e19.md` §19.1 |

## Work completed

Aligned the E19 implementation with the LLD §19.1 spec. The `fcs_issue_sources.issue_title` column and the `ValidatedIssue[]` return type were specified in the LLD but dropped from the initial implementation (shipped in E19.1 / #287). This session closed the gap.

- Added `issue_title text NOT NULL` to `fcs_issue_sources` (declarative schema + generated migration `20260421160558_add_issue_title_to_fcs_issue_sources.sql`).
- Updated RPC `create_fcs_assessment` to read `iss->>'issue_title'` from `p_issue_sources` into the new column.
- Changed `validateIssues` signature from `Promise<void>` to `Promise<ValidatedIssue[]>`. Title captured from the GitHub REST `issues.get` response's `data.title` field.
- Replaced `CreateAssessmentParams.issueNumbers: number[]` with `validatedIssues: ValidatedIssue[]`; threaded through `createFcs`.
- Regenerated `src/lib/supabase/types.ts` for the new column.

## Decisions made

- **Simple signature change, no new abstractions.** The fix threads one extra field through an existing params object; no new helper functions, no new types beyond `ValidatedIssue`. Matches `feedback_simplicity_first.md` — fix at source.
- **No LLD deviations to record.** The LLD §19.1 was correct from the start; this PR simply realigned the implementation. Updated LLD Document Control with a new "Revised" row citing issue #291.
- **Migration adds `NOT NULL` without DEFAULT.** Declarative schema has no default, so the generated migration matches the spec. E19 shipped 2026-04-21 — prod `fcs_issue_sources` is expected to be empty. Added a deploy note to the PR body so the operator confirms before applying.
- **Test-author agent wrote tests first against the LLD contract.** 2 new persistence tests + 4 updated. Evaluator returned PASS with zero adversarial tests.

## Review feedback addressed

`/pr-review-v2` posted one warn — migration `ADD COLUMN NOT NULL` without DEFAULT could fail if rows exist. Surfaced as a deploy-time concern in the PR body. No code change needed since the declarative schema is correct and the target DB is empty.

Evaluator surfaced a pre-existing silent-fallback pattern in `retriggerRubricForAssessment` (both `fcs_merged_prs` and `fcs_issue_sources` queries drop `error` and null-coalesce to `[]`). Not introduced by this PR; tracked for a future ticket if retry reliability becomes a concern.

## Next steps or follow-up items

- Epic #286 checklist: tick off #291 (automated in Step 6.5).
- Potential new issue: harden `retriggerRubricForAssessment` to surface query errors instead of silently falling back to empty arrays.

## Final feature cost

| Stage | Cost | Input tokens | Output tokens | Cache-read | Cache-write |
|-------|------|--------------|---------------|------------|-------------|
| PR creation | $4.7027 | 16,071 | 31,175 | 6,037,222 | 216,770 |
| Final (post feature-end) | $7.5115 | 16,173 | 45,252 | 10,061,060 | 299,581 |
| Delta | +$2.81 | +102 | +14,077 | +4,023,838 | +82,811 |

## Cost retrospective

**Drivers:**

| Driver | Observation | Impact |
|--------|------------|--------|
| Fix cycles | RED → GREEN in a single round. No re-runs of vitest. | Low |
| Agent spawns | `test-author`, `feature-evaluator`, `pr-review-v2` (single agent path, diff <300 but mostly generated), `ci-probe` (background) | Medium — each re-sends diff + LLD |
| LLD quality gap | LLD §19.1 was correct — no design churn during implementation. | None |
| Mock complexity | Existing mock chain in `fcs-issue-numbers.test.ts` reused cleanly. One `mockResolvedValueOnce` chain needed for per-issue titles. | Low |
| Context compaction | None in this session. | None |
| Post-PR delta | ~$2.81 — covers CI probe, PR review round, cost query, session log writing. | Expected overhead |

**Improvement actions:**

- No corrective actions identified. Session ran cleanly: LLD was correct, test-author produced the right tests first-try, evaluator confirmed PASS, pr-review surfaced one deploy-time warn (not a code issue), CI green on first run.
- For future E19-style follow-ups where an LLD field was dropped from implementation: spot these earlier by diffing the LLD's schema specs against generated Supabase types at PR review time on the original epic.

## Verification

- `npx vitest run` — 1123/1123 passed
- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npx supabase db reset` + `db diff` — clean
- CI (PR #293 run 24733355597) — all 5 jobs green (lint/types, unit, integration, Docker, Playwright E2E)
