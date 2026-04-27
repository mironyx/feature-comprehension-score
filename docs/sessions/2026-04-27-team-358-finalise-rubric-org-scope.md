# Session Log — 2026-04-27 — Team Session — Issue #358

**Session recovered from crashed teammate (original session: `7db631c3-9eeb-46a0-bad4-5f4a3e5dc9fa`).**

## Feature

**Issue:** [#358 fix: finalise_rubric RPCs missing org_id scope in UPDATE WHERE clause](https://github.com/mironyx/feature-comprehension-score/issues/358)
**PR:** [#378 fix: add org_id scope to finalise_rubric UPDATE WHERE clauses](https://github.com/mironyx/feature-comprehension-score/pull/378)
**Branch:** `feat/fix-finalise-rubric-org-scope`
**Worktree:** `/home/leonid/projects/fcs-feat-358-fix-finalise-rubric-org-scope`

## Work Completed

**Root cause:** Both `finalise_rubric` overloads (3-arg and 8-arg) accepted `p_org_id` but only used it as the INSERT value for `assessment_questions.org_id` — not as a WHERE predicate on the UPDATE. This meant a caller with a valid `assessmentId` from a different org could transition that org's assessment to `awaiting_responses`.

**Fix — Phase 1 (commit `ddec3c7`):** Added `AND org_id = p_org_id` to the UPDATE WHERE clause in both overloads. This satisfies the ADR-0025 requirement for explicit org scoping.

**Fix — Phase 2 (commit `036012e`):** During PR review (`/pr-review-v2 378`), a deeper atomicity bug was identified: with only the WHERE fix, the INSERT into `assessment_questions` ran unconditionally before the UPDATE. If `p_org_id` was wrong, questions were silently inserted with mismatched `org_id` and the UPDATE no-oped with no rollback. Fixed by adding an ownership guard at the start of both overloads that raises an exception before any writes if the assessment doesn't belong to the org:

```sql
IF NOT EXISTS (SELECT 1 FROM assessments WHERE id = p_assessment_id AND org_id = p_org_id) THEN
  RAISE EXCEPTION 'assessment % does not belong to org %', p_assessment_id, p_org_id;
END IF;
```

This makes the function atomic: either all writes succeed (correct org) or the transaction aborts before any writes (wrong org).

**Files changed:**
- `supabase/schemas/functions.sql` — both `finalise_rubric` overloads updated with ownership guard + scoped WHERE
- `supabase/migrations/20260427124537_fix-finalise-rubric-org-scope.sql` — generated migration
- `tests/helpers/transaction-functions.integration.test.ts` — new `finalise_rubric — org_id scoping` describe block with regression tests for both overloads

**Tests added:** 2 integration tests (wrong-org scenarios for 3-arg and 8-arg overloads)

**Schema drift verification:** `npx supabase db diff` confirmed empty after `db reset`.

## Decisions Made

1. **Ownership guard over WHERE-only fix:** The WHERE-only approach was technically compliant with ADR-0025 but left a partial-write vulnerability (INSERT succeeds, UPDATE no-ops, no rollback). The ownership guard is the correct pattern per ADR-0025's atomicity intent.

2. **RAISE EXCEPTION before any writes:** This is the idiomatic plpgsql pattern — fail fast at the top of the function body so BEGIN/END atomicity guarantees prevent any partial state.

3. **lld-sync skipped:** Zero `src/` lines changed (pure SQL + migration + integration tests). No architectural change warranting LLD update.

4. **Pressure tier: Light** — 3-line ownership guard added to two SQL functions; single test file touched.

## Review Feedback Addressed

The `/pr-review-v2` review identified one **blocker**: the initial WHERE-only fix left a partial-write atomicity gap where `INSERT INTO assessment_questions` ran unconditionally before the scoped UPDATE. Fixed in commit `036012e` by adding the pre-write ownership guard to both overloads.

## Cost Retrospective

- **PR-creation cost:** $0.7084 (902 input / 9,589 output / 1,364,921 cache-read / 65,487 cache-write)
- **Final total:** $2.2854 (6,581 input / 34,559 output / 3,919,009 cache-read / 203,665 cache-write)
- **Post-PR delta:** ~$1.58 (context compaction + recovery session overhead)

**Cost drivers:**
- **Context compaction:** The session ran out of context mid-feature and was recovered via a second agent session — this accounts for most of the post-PR delta (re-summarising inflates cache-write tokens).
- **Two-phase fix:** The initial WHERE-only fix required a second commit after PR review identified the atomicity gap. One additional `test-runner` invocation.
- **Low agent spawns:** Only test-runner agents launched (no lld-sync, no feature-evaluator — Light pressure path).

**Improvement actions:**
- When fixing ADR-0025 violations in plpgsql, check for partial-write scenarios immediately rather than discovering them in PR review. The pattern is: if there are writes before the scoped UPDATE, add an ownership guard first.
- Keep feature sessions under context budget — this was a ~15 min session that hit context limits, triggering a recovery run.

## Next Steps

- Issue #376: fix relative-URL self-fetch in `/assessments/[id]` page
- Issue #377: move RetryButton from My Assessments to Organisation admin view
