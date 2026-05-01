# Session log — 2026-05-01 — V11 E11.3 T3.2 (#422 / PR #429)

## Work completed

Closed issue **#422** (V11 E11.3 T3.2 — `loadProjectPromptContext` + FCS rubric reads project context). PR **#429** merged into `main`.

- New `src/lib/supabase/project-prompt-context.ts` mirroring `loadOrgPromptContext` shape; predicate is `.eq('project_id', $1).maybeSingle()` (no org-level fallback per Invariant I8).
- `extractArtefacts` in `src/lib/api/fcs-pipeline.ts` now calls `loadProjectPromptContext`; computes `effectiveQuestionCount = organisation_context?.question_count ?? repoInfo.questionCount` and passes it to `buildTruncationOptions`.
- `projectId` threaded through `RubricTriggerParams`, `ExtractArtefactsParams`, and `AssessmentRetryRow`; retry-rubric route's SELECT now includes `project_id` and the create-FCS service forwards it to `triggerRubricGeneration`.
- `OrganisationContextSchema` extended with optional `glob_patterns` (max 50) and `question_count` (3..8); `domain_notes` cap raised 500 → 2000; `AssembledArtefactSetSchema.question_count` cap raised 5 → 8 (V11 upper bound per LLD update 62c97b9).
- `loadOrgPromptContext` retained for the org-level `/organisation` UI (Invariant I5 covered by tests).
- 13 new tests across two files: 5 resolver specs (`tests/lib/supabase/project-prompt-context.test.ts`) + 8 pipeline specs (`tests/lib/engine/fcs-pipeline-project-context.test.ts`). All 13 pass; 51/51 across the four touched test files.

### Drive-by fixes

- Inlined the partition helper into `src/app/(authenticated)/projects/[id]/assessment-list.tsx` — the `partition` module was deleted by #427 without updating callers, breaking `tsc --noEmit` on bare `main`. 5-line inline helper, single-use; PR body documents the fix.
- Updated `tests/lib/engine/prompts/artefact-types.test.ts` and `tests/app/api/organisations/[id].context.test.ts` boundary specs to match the new caps (500 → 2000 for `domain_notes`, max 5 → 8 for `question_count`). Updated docstring in `src/app/api/organisations/[id]/context/route.ts`.

### Mid-session design correction

User flagged that the T3.1 redirect target (`/projects/[id]` for non-admins reaching `/projects/[id]/settings`) was wrong — settings is admin-only and Org Members have no UI affordance to reach it, so redirecting back to the project page is a no-op redirect loop. Updated LLD §A.1 sequence diagram, Invariant I3, Story 3.1 acceptance, B.1 page sketch + comment, T3.1 task description, T3.1 acceptance checklist, and BDD spec to redirect to `/assessments` instead. The actual code edit lives on the T3.1 branch (#421, separate teammate); the LLD change here will be picked up on their next sync.

## Decisions made

- **Schema cap = 8 (not 5).** Issue body said `max(5)` but LLD commit 62c97b9 (more recent) raised the schema bound to 8 to match the V11 upper bound. Followed the LLD; documented as a Design deviation in the PR body.
- **Defensive null-guard on `assessment.project_id` in retry-rubric service** — generated `Database` types still type the column `string | null` despite the DB CHECK constraint, so a one-line guard is needed to narrow for TS. Branch is unreachable in practice. A non-null assertion (`!`) was rejected as silently lossy. LLD §B.2 caller-plumbing now documents this trade-off as an Implementation note.
- **Followed LLD literally on schema decision (Option A).** `OrganisationContextSchema` extended in place rather than introducing a parallel `ProjectPromptContextSchema`. The org-level table is inert for FCS in V11; carrying extra optional fields costs nothing.
- **Glob-driven file fetching deferred.** Story 3.2 AC 4 ("repo-level exempt patterns still exclude files matched by project globs") is not implemented in T3.2 — globs propagate through `organisation_context` but `extractFromPRs` is not called with `contextFilePatterns`. Marked deferred per LLD §B.4 ("V11 NOTE: glob-driven file selection is out of scope for T3.2"); flagged by feature-evaluator as the only AC gap.

## Review feedback addressed

- pr-review-v2 found 1 warn (defensive null-guard nominally deviates from LLD §B.2 "no null-handling branch is needed"). LLD §B.2 was updated by `/lld-sync` in this session to document the TS-narrowing requirement. No code change.
- feature-evaluator: PASS WITH WARNINGS — 0 adversarial tests written; the only gap is glob-driven file fetching (out of scope per LLD §B.4 and not in #422 ACs).

## CI status

CI failing on `main` and on this branch with the same pre-existing failures (PollingStatusBadge React-context issue, `generate-with-tools` assertion mismatch, legacy tests still importing the renamed `createFcs` API). Triaged via `git stash` baseline run — none introduced by T3.2. Documented in PR body's "Notes on baseline test failures" section.

## Next steps / follow-up

- **#421 (T3.1 settings page).** Picks up the redirect-target LLD change committed on this branch (Org Member → `/assessments`, not `/projects/[id]`). The teammate on #421 should rebase or merge `main` after T3.2 lands so their `page.tsx` matches the updated LLD.
- **PRCC future.** When project-scoped PRCC is implemented (deferred), reuse `loadProjectPromptContext` rather than introducing a parallel resolver. Kernel entry now records this.
- **Glob-driven file fetching.** Track as a separate issue under the PRCC epic — the project `glob_patterns` are wired to the `organisation_context` plumbing but the `extractFromPRs` integration is not yet built.

## Cost

| Stage | Cost | Input tokens | Output tokens | Cache-read | Cache-write |
|-------|------|--------------|---------------|------------|-------------|
| At PR creation | $14.2753 | 1,293 | 87,353 | 23,687,754 | 478,938 |
| Final | $25.9254 | 35,259 | 132,496 | 40,549,125 | 835,009 |
| **Delta** | **$11.65** | **+33,966** | **+45,143** | **+16,861,371** | **+356,071** |

Time to PR: 36 min. Total session time: ~70 min.

## Cost retrospective

**Cost drivers (post-PR delta = $11.65 / 70 min total):**

| Driver | Detected | Estimated cost share |
|--------|----------|---------------------|
| pr-review-v2 (3 agents incl. web-search) | Agent A + B + C concurrent; B did 2 web searches | ~$3 |
| feature-evaluator | 71k tokens, 69 tool uses (deep evaluation) | ~$3 |
| Triaging pre-existing test failures | 3 separate stash/pop cycles to confirm baseline | ~$2 |
| LLD redirect mid-session correction | User flagged T3.1 redirect target; updated 7 LLD locations | ~$1.5 |
| lld-sync | Updated kernel + LLD §B.2 in this session | ~$1 |
| ci-probe (background) | Two probes; first one didn't actually wait, relaunched | ~$0.5 |

**Improvement actions for next time:**

- **Triage budget.** Spent ~$2 confirming pre-existing failures via stash/pop cycles. Next time, run a single targeted vitest on bare `main` BEFORE making changes, save the failing-test list, and diff against the post-change list. One stash, not three.
- **ci-probe waiting behaviour.** First ci-probe agent reported "I've started polling" instead of waiting for completion. Next time, add explicit "block until checks complete; return only when all checks reach a terminal state" instruction. Saved the relaunch on this run.
- **LLD currency before implementation.** The LLD said "no null-handling branch is needed" without considering generated Supabase types. For future LLDs that touch DB rows, mention the generated type's nullability explicitly so the implementer doesn't discover it at tsc time.
- **Pre-existing main breakage.** A drive-by fix for a deleted module reference cost ~$0.5 of investigation. The drift-scan should catch this kind of orphaned import — consider running `npx tsc --noEmit` as a CI gate that fails the merge of any PR (like #427) that leaves the tree in a non-compiling state.
- **Sibling task overlap.** T3.1 (#421) and T3.2 (#422) both touch the LLD. The redirect correction landed in T3.2's branch but the page code lives on T3.1's branch — the teammate on #421 needs to sync. Consider a "shared LLD lock" or designated owner to reduce coordination overhead in parallel teamtask execution.
