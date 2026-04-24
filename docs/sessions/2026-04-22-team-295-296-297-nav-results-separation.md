# Team Session Log — 2026-04-22 — Epic #294: Navigation & Results View Separation

**Issues shipped:** #295, #296, #297
**Epic:** [#294 — Navigation & Results View Separation](https://github.com/mironyx/feature-comprehension-score/issues/294)
**Team:** `feature-team-295-296-297` (lead + 3 teammates)
**Wave:** 1 of 1 (all tasks independent, spawned in parallel)

---

## Issues shipped

| Issue | Story | Branch | PR | Merged commit |
|---|---|---|---|---|
| #295 My Assessments: all statuses | 5.4 | `feat/my-assessments-all-statuses` | [#298](https://github.com/mironyx/feature-comprehension-score/pull/298) | `dbe1745` |
| #296 Org page: overview + New Assessment | 5.4 / 6.3 | `feat/org-assessment-overview` | [#300](https://github.com/mironyx/feature-comprehension-score/pull/300) | squash |
| #297 Results: role-based view separation | 3.4 / 6.2 | `feat/results-role-based-views` | [#299](https://github.com/mironyx/feature-comprehension-score/pull/299) | `53f7c17` |

All merged to `main`. Epic #294 closed.

---

## Cross-cutting decisions

**LLD §1–§3 Document Control collisions.** All three teammates ran `/lld-sync` against the same `docs/design/lld-nav-results.md` file. The Document Control table accumulated three Revised rows (v1.1 from #296, v1.2 from #297, v1.3 from #295). Each teammate resolved the rebase conflict by merging revision lines — no content was lost, but each needed 2–3 rebase/CI cycles. For future parallel runs touching a shared LLD, the lead should nominate one teammate to handle all lld-sync commits after the others have merged, or run `/lld-sync` as a single post-merge step in the lead.

**Next.js Page-export validator.** Teammate-295 hit a CI failure (not caught by `npx tsc` or `vitest`) because Next.js App Router rejects arbitrary named exports from `page.tsx` files. `partitionAssessments` and `AssessmentItem` were extracted to `partition.ts` to fix it. This constraint should be in CLAUDE.md or the LLD template for App Router pages: run `npm run build` whenever editing `src/app/**/page.tsx`, `layout.tsx`, or `route.ts`.

**Privacy bug caught by PR review (#297).** `fetchMyAnswers` lacked a `participant_id` filter. Because `answers_select_admin` is OR'd with `answers_select_own`, an admin-who-is-also-a-participant would have received all participants' answers. The LLD mentioned `answers_select_own` but did not document the OR'd admin policy surface. Improvement: when an LLD helper touches `participant_answers`, note the OR'd RLS policy explicitly so `test-author` enumerates the cross-role isolation property.

**RLS scoping pattern confirmed.** Self-view data in #297 was correctly queried through `createServerSupabaseClient` (user session, RLS-enforced), not the service-role client. This matches the `adminSupabase` feedback memory — initial lookups scoped to the user's session, service-role only for admin-aggregate counts.

---

## Coordination events

- All three teammates spawned in a single wave (no dependency edges).
- Teammate-295 reported a CI failure after initial PR creation (Next.js Page-export); fixed autonomously and pushed a follow-up commit. No lead intervention needed.
- Teammate-297 reported a PR review blocker (privacy leak); fixed autonomously. No lead intervention needed.
- Teammate-296 reported a PR review blocker (component called as function instead of JSX); fixed autonomously.
- `/feature-end` forwarded sequentially as user approved each PR (#296 first, then #295, then #297).
- Teammate-295 hit a merge race with #297 landing on main mid-rebase; recovered with a second rebase. Normal parallel hazard.
- All three worktrees cleaned up by their respective teammates.

---

## Cost summary

| Issue | PR-creation cost | Final cost | Delta |
|---|---|---|---|
| #295 | $5.27 | $12.50 | +$7.23 |
| #296 | $7.34 | $13.30 | +$5.96 |
| #297 | $5.96 | $13.12 | +$7.16 |
| **Total** | **$18.57** | **$38.92** | **+$20.35** |

Post-PR delta (~52% of total) is high relative to previous team runs. Driven by: context compaction in all three sessions, 2–3 rebase/CI cycles per teammate (LLD collision + merge races), and one blocker fix per PR.

---

## What worked / what didn't

**Worked:**
- All three tasks were genuinely independent; no cross-file conflicts during implementation, only during lld-sync.
- PR review caught two real bugs (privacy leak in #297, JSX call in #296) before merge.
- Teammates resolved all blockers autonomously — no lead intervention on code.

**Didn't work:**
- Shared LLD file with parallel lld-sync is a recurring pain point. Three rebase cycles across three teammates for one file is overhead that could be eliminated with a sequential lld-sync step.
- `test-author` did not enumerate cross-role absence properties for #297 (admin page must not leak self-view labels). Five adversarial tests were backfilled by `feature-evaluator`. The test-author prompt should be extended to include absence assertions when the LLD describes role-based branching.

---

## Process notes for `/retro`

1. **Shared LLD + parallel lld-sync = serial rebase pain.** Consider: lead runs `/lld-sync` for all tasks once the last PR merges, or teammates skip lld-sync and the lead handles it in a single post-wave pass.
2. **App Router page export constraint is not in CLAUDE.md.** Add: "run `npm run build` after editing any `src/app/**/page.tsx`, `layout.tsx`, or `route.ts` file."
3. **LLD RLS surface gap caused a post-PR blocker.** Add to `/lld` skill or LLD template: when a query touches a table with OR'd RLS policies (admin OR own), enumerate both policy branches in the contract.
4. **`test-author` should enumerate role-based absence properties.** When the LLD describes branching by viewer role, the test-author prompt should include: "for each role, assert that the OTHER role's content is absent."
5. **Post-PR delta ~52%.** Target < 30%. Main levers: fewer rebase cycles (sequential lld-sync), fewer context compactions (keep PRs under 150 lines for parallel runs).
