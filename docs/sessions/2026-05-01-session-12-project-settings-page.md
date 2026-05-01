# Session 12 — V11 E11.3 T3.1: Project settings page + glob parseability validation

**Date:** 2026-05-01
**Issue:** #421 (T3.1)
**PR:** #428 — <https://github.com/mironyx/feature-comprehension-score/pull/428>
**Branch:** `feat/project-settings-page` (parallel teamtask, worktree mode)
**Sibling fix PR:** #430 (restore partition.ts)

## Work completed

Implemented the project settings page at `/projects/[id]/settings`, glob-parseability validation on `UpdateProjectSchema`/`CreateProjectSchema`, and a DB CHECK relaxation from 3..5 to 3..8 on `org_config` and `repository_config` question_count columns (T3.1 also owns the schema bump per LLD §B.0).

Files added/modified on this branch:

- `src/app/api/projects/validation.ts` — `superRefine` on `glob_patterns`, raised `question_count` cap to 8 across both schemas.
- `src/app/(authenticated)/projects/[id]/settings/page.tsx` — server component, two-query load (project + organisation_contexts), Org Member → `/assessments`, 404 on unknown project.
- `src/app/(authenticated)/projects/[id]/settings/settings-form.tsx` — client form (TagInput-style globs, domain_notes textarea, question_count number). Submits PATCH /api/projects/[id] with the changed subset; reads `body.details.issues` for per-glob row error mapping.
- `supabase/schemas/tables.sql` — 4 CHECK constraints relaxed to BETWEEN 3 AND 8.
- `supabase/migrations/20260501202822_relax_question_count_to_8.sql` — generated.
- `package.json` — `picomatch` (runtime), `@types/picomatch` (dev).
- Tests: `tests/app/api/projects/validation.test.ts` (new, 13 tests), `tests/app/(authenticated)/projects/[id]/settings/page.test.ts` (new, 11 tests), `tests/app/api/projects/update.test.ts` (existing, 2 tests bumped to 3..8 bounds), `tests/evaluation/v11-e11-3-t3-1.eval.test.ts` (new, 3 tests — error-body shape regression pin).

54 tests passing on the changed surface. CodeScene 9.38–10 across all changed files. lint clean. tsc clean (post-#430).

## Decisions made

1. **picomatch needs `{ strictBrackets: true }`.** The LLD §B.1 sketch used bare `picomatch.makeRe(p)` plus a try/catch on the assumption that picomatch throws on bad input. picomatch v4 is permissive by default — `makeRe('[')` returns `/^(?:\[\/?)$/` rather than throwing. Open question 1's resolution only verified the API exists at the top level. Implementation now passes `{ strictBrackets: true }` so unclosed brackets actually fail. LLD §B.1 corrected.
2. **Form reads `body.details.issues`, not `body.issues`.** `validateBody` (from `@/lib/api/validation`) wraps Zod errors in `ApiError(422, 'Validation failed', { issues: [...] })`; `handleApiError` serialises `details` as `body.details`. Initial form code read `body.issues` and silently dropped per-glob error display. Caught by adversarial evaluation (`tests/evaluation/v11-e11-3-t3-1.eval.test.ts`). Form fixed to read `body.details?.issues` and accept both 400 and 422 defensively. Kernel updated to document the response shape.
3. **Org Member redirect → `/assessments` (not `/projects/[id]`).** Issue body said `/assessments`. LLD I3 had been changed to `/projects/[id]` (commit 7cbbe1e) after the issue was filed. T3.2's lld-sync (#422) reverted I3 back to `/assessments` with the rationale: settings is admin-only and Org Members have no UI link to it from `/projects/[id]`, so redirecting back there would be a no-op redirect loop. My initial implementation followed the older LLD; during /feature-end's lld-sync, the divergence was caught and the implementation amended to redirect to `/assessments`.
4. **Test file path differs from LLD.** LLD §B.0 listed `tests/app/api/projects/[id]/validation.test.ts (extend)` but no such file existed. Created focused unit test at `tests/app/api/projects/validation.test.ts`; route-level integration coverage already lives in `update.test.ts`. The two existing question_count boundary tests in `update.test.ts` (`> 5` and `at boundary 5`) were updated to use 9 and 8 respectively to reflect the new V11 cap.
5. **Form internal decomposition partial.** LLD prescribed `GlobPatternList`, `DomainNotesField`, `QuestionCountField` sub-components. `GlobPatternList` was kept (manages own draft-input state and per-row errors); `DomainNotesField` and `QuestionCountField` were inlined per CLAUDE.md "don't extract single-use helpers". Two pure helpers (`buildChangedSubset`, `mapIssuesToGlobErrors`) were added instead so `handleSubmit` stays short.
6. **Stale-error fix on row remove/add.** Removing or adding a glob shifted indices in the `globs` array but not in the `globErrors` index map, leaving 422 errors attached to wrong rows. Fix: clear `globErrors` on add/remove. Caught by self-review (Agent A in pr-review-v2).

## Review feedback addressed

- pr-review-v2 (Agent A — Quality): 3 warns. Fixed the stale-error bug (commit `c6258cf`). Deferred two minor UX items per LLD-as-written: empty-subset success state, project-query-before-auth ordering.
- pr-review-v2 (Agent C — Design conformance): 0 findings.
- feature-evaluator: caught the body.details.issues vs body.issues bug; eval test file pins it.

## Sibling fix PR

PR #430 (`fix/restore-assessments-partition`) restored `src/app/(authenticated)/assessments/partition.ts`, deleted by #427. The deletion broke tsc on main (4 errors gating CI for every PR since #427). Filed at the team lead's direction, merged before #428 was rebased.

## Cost retrospective

| Driver | Detected | Impact |
|--------|----------|--------|
| Mid-flight LLD change (Org Member redirect target) | T3.2's branch updated I3 while T3.1 was in progress; second /lld-sync caught the divergence | Medium — required a redirect impl change + page test edit + force-push + second CI cycle |
| Pre-existing main-branch breakage (partition.ts deletion in #427, polling-badge useContext null, generate-with-tools assertion) | First CI run on PR #428 | Medium — required diagnosing whether errors were caused by my PR or pre-existing; opened sibling fix PR #430 |
| Adversarial evaluation caught a real form bug | `feature-evaluator` agent flagged `body.issues` vs `body.details.issues` | Low — saved a post-merge fix; one extra commit during /feature-core |
| picomatch v4 default permissiveness | Test-author agent flagged that `makeRe('[')` does not throw | Low — one-line fix (`strictBrackets: true`); avoided shipping broken validation |

### Improvement actions

- **Shared LLD lock for parallel teamtasks.** When two teammates work on adjacent tasks within the same LLD section, the second one's lld-sync can change invariants the first is implementing against. Either declare a designated LLD owner per section, or run an explicit `git pull --rebase` step in feature-core's Step 3 to pick up sibling LLD changes after the design-read phase.
- **CI baseline check before opening PRs.** Running `gh run list --branch main --limit 1 --json conclusion` at the start of `/feature` would surface broken-trunk situations early and let the teammate decide whether to open a fix PR first instead of triaging post-CI failure.
- **Kernel doc accuracy gate.** The kernel said `validateBody` throws `ApiError(400)` but the source throws 422. Stale kernel entries cause silent client-side bugs. Suggest a periodic kernel-vs-source diff in `/drift-scan`.
- **Adversarial eval pays off.** This run's evaluator found a real defect (the body shape mismatch). Keep `feature-evaluator` in the standard pipeline and write its findings as regression-pin tests in `tests/evaluation/`.

## Final feature cost

| Stage | Cost | Tokens (in/out/cache-read/cache-write) |
|-------|-----:|-----------------------------------------|
| At PR creation (PR body `Usage`) | $10.0028 | 1,118 / 74,644 / 15,120,442 / 386,681 |
| Final (after rebase + lld-sync + redirect fix + session log) | $26.4222 | 1,470 / 131,625 / 39,543,477 / 907,049 |
| **Delta (post-PR)** | **+$16.4194** | post-PR work: review fix (globErrors), evaluator iteration, sibling fix PR #430, rebase + force-merge cycle, redirect amendment, /lld-sync, session log |

## Next steps

- T3.2 (#422) is already merged; together with T3.1 this completes E11.3 implementation.
- E11.4 (settings-link nav, deferred) is the only remaining UX gap — without it, the settings page is reachable only by direct URL.
- The two pre-existing unit-test failures (polling-badge useContext null; generate-with-tools `validation_failed` vs `malformed_response`) need a separate fix on main.
