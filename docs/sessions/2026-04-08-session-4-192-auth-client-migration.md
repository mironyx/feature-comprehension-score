# Session 4 — 2026-04-08 — Issue #192 (createGithubClient installation-token migration)

## Work completed

- **Issue:** [#192](https://github.com/mironyx/feature-comprehension-score/issues/192) — migrate `createGithubClient` from user OAuth token to installation token.
- **PR:** [#199](https://github.com/mironyx/feature-comprehension-score/pull/199) — merged into `main`.
- **LLD:** [docs/design/lld-onboarding-auth-client-migration.md](../design/lld-onboarding-auth-client-migration.md) (new, written during this session as a thin bridge between HLD §5.4 and the implementation).

Implementation:

- New `createGithubClient(installationId, { getToken? })` in [src/lib/github/client.ts](../../src/lib/github/client.ts), backed by the cached `getInstallationToken` from `app-auth.ts`.
- `RepoInfo` extended with `installationId`; `fetchRepoInfo` joins `organisations.installation_id`.
- `createFcs` and `triggerRubricGeneration` now pass `repoInfo.installationId` instead of building a user-token client.
- `retriggerRubricForAssessment` drops the unused `userId` parameter.
- New unit test [tests/lib/github/client.test.ts](../../tests/lib/github/client.test.ts) — happy path + rethrow on `getToken` failure.
- Follow-up commit added `installation_id: 42` to org fixtures in four existing test files (per LLD §5).

## Decisions made

- **`createGithubClient` takes a number, not a Supabase client.** Removing the DB dependency aligns with HLD §4.3: `installation_id` enters at one of three edges and is passed downstream as a parameter; no service-role free-form lookup. Tests inject a `getToken` stub instead of mocking RPCs.
- **Sequential `fetchRepoInfo` → `createGithubClient`** in `createFcs` (was `Promise.all`). The new factory needs `installation_id` from the repo row, so the previous parallel pattern no longer composes. The latency cost is negligible — both calls are sub-100ms.
- **Out-of-scope work documented, not done:**
  - Denormalising `installation_id` onto `assessments` rows (HLD M1) — keeps the retry path on adminSupabase for now; tracked for follow-up.
  - Dropping the `get_github_token` SQL function and Vault storage (HLD M3) — only remaining reference is in generated `src/lib/supabase/types.ts`.
- **`/lld-sync` skipped:** the LLD was authored fresh in the same session and the implementation matches it 1:1. No drift to capture.

## Review feedback addressed

- **User flagged LLD §5 fixture updates were not in the PR.** Three sub-items:
  1. `createGithubClient` mock signature — no change needed; `vi.mocked(...).mockResolvedValue` ignores arguments.
  2. `get_github_token` RPC stubs — none existed in any of the four test files (the RPC was always hidden inside the mocked factory).
  3. `installation_id` on org fixtures — **was missing.** Added in commit `2519609` to `tests/app/api/fcs.test.ts`, `tests/app/api/fcs-service-logging.test.ts`, `tests/app/api/fcs-rubric-failure.test.ts`, `tests/app/api/assessments/[id].retry-rubric.test.ts`.
- **Root cause of the miss:** I skipped the `feature-evaluator` step (Step 6b) for this "small" task. `pr-review-v2` checks `src/` design conformance but does not treat LLD test-strategy sections as contracts, so the gap fell through both nets. Saved as memory `feedback_dont_skip_evaluator.md` — never skip the evaluator when an LLD exists, regardless of diff size.

## Next steps / follow-up items

- **HLD M1 (denormalise `installation_id` on `assessments`)** — separate issue. Hardens the retry path to honour §4.3 ("no service-role lookup of installation_id").
- **HLD M3 (drop `get_github_token` SQL function + Vault storage)** — separate issue. After this, the generated `types.ts` reference disappears too and the §4.3 §"current state" addendum on ADR-0020 can be removed.
- **Follow-up issue #179 (full cutover)** is now unblocked: every server-to-server GitHub call goes through an installation token.

## Cost retrospective

| Stage | Cost | Tokens (in / out / cache-read / cache-write) |
|---|---|---|
| At PR creation | $2.29 | 58 / 14,129 / 2,870,258 / 100,511 |
| Final | $5.28 | 138 / 21,753 / 5,493,479 / 344,311 |
| **Post-PR delta** | **$2.99** | **80 / 7,624 / 2,623,221 / 243,800** |

Time to PR: 9 min.

### Cost drivers

| Driver | Detected | Impact |
|---|---|---|
| Skipped evaluator → user-caught fixture miss → second commit + push + re-run cost | Yes — `2519609` is a follow-up commit triggered by user feedback | Medium (~$1.50 of the post-PR delta is the second cycle) |
| `pr-review-v2` agent spawn after PR creation | Yes — single agent path (small diff) | Low |
| ci-probe background agent | Yes — necessary, low cost | Low |
| Re-running full vitest suite twice (once before PR, once after fixture commit) | Yes — 480 tests × 2 ≈ ~50s × 2 | Low |

### Improvement actions

1. **Never skip `feature-evaluator` when an LLD exists.** Saved as `feedback_dont_skip_evaluator.md`. The evaluator is the only agent that treats LLD test-strategy sections as a contract; `pr-review-v2` does not.
2. **Treat LLD §5 (test strategy) as part of the implementation diff, not as guidance.** When the LLD lists fixture changes, mock-signature changes, or new test files, those are line items to check off in Step 4 (TDD), not background reading.
3. **For migrations that touch existing test fixtures, grep for the old shape (`organisations: {`) up front** to enumerate every fixture call site, then update them in the same commit as the production code. The fact that the old fixtures continued to type-check and pass tests was the smell — it meant the production change was less specific than it should have been about its inputs.
