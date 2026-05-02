# Session 6 — Fix #440: Settings link + New Assessment CTA missing from project dashboard

**Date:** 2026-05-02
**Issue:** [#440](https://github.com/mironyx/feature-comprehension-score/issues/440)
**PR:** [#442](https://github.com/mironyx/feature-comprehension-score/pull/442)
**Branch:** `fix/settings-link-new-assessment-cta`
**Session ID:** `e0f8b674-cc06-4ced-b65e-b0baa0e6455a`

## Work completed

Two UI regressions on `/projects/[id]` fixed in a single pass:

1. **Settings link:** Added `<Link href="/projects/[id]/settings">` as a sibling element between `<PageHeader>` and `<InlineEditHeader>`. Visible to all users who reach the page — access-control is handled by the existing `if (!role) redirect('/assessments')` guard at line 35 (Org Members redirect before the link is reached). Added an inline comment to make this implicit guard explicit.

2. **New Assessment button:** Hoisted from `AssessmentList`'s empty-state branch to the page-level section header, so it renders whether the project has assessments or not. The original "Create the first assessment" CTA in the empty state is retained for aesthetics.

**Files changed:**
- `src/app/(authenticated)/projects/[id]/page.tsx` — +18 lines
- `tests/app/(authenticated)/projects/dashboard-page.test.ts` — +55 lines (3 new tests)

**Tests added:** 3 regression tests (admin sees Settings link, repo_admin sees Settings link, New Assessment button at page level with correct href). Full suite: 2142 tests pass.

## Decisions made

- **Settings link placement:** LLD §B.6 says "in the page header or alongside the Delete button". Placed as a sibling `<Link>` element rather than inside the `action` prop. Reason: `action` is null for repo_admin in existing tests; restructuring would require changing the action shape for all roles. The "or in the page header" clause covers sibling placement. Noted as a design deviation in the PR body for future `/lld-sync`.

- **lld-sync skipped:** < 30 src lines, bug fix only, no new exports. The deviation is already documented in the PR body.

- **Transient CI failure:** First CI run failed on `fcs-pipeline-error-capture.test.ts` (6/22) — an existing flaky test unrelated to our diff. Tests pass in isolation and in the full local suite. Follow-up commit (comment addition from PR review) re-triggered CI; all jobs passed.

## Review feedback addressed

- **Implicit access-control intent (warn):** Added inline comment `{/* Visible to admin and repo_admin only — Org Members redirect at line 35 */}` to make the access-control rationale explicit.
- **Missing negative test for Org Member (warn):** Noted as already covered by the existing redirect test; no action needed (component throws before returning output, so a `not.toContain` assertion would be unreachable).

## Cost retrospective

| Stage | Cost |
|---|---|
| At PR creation | $0.8554 |
| Final total | $2.4594 |
| Post-PR delta | $1.60 |

**Post-PR cost drivers:**
- PR review agent (~$0.30)
- CI probe ×2 (first run + re-run after transient failure) (~$0.20)
- Diagnostics / code health check (~$0.15)
- Comment addition commit + re-push (~$0.05)
- Context overhead across all steps (~$0.90)

**Improvement actions:**
- The transient CI failure cost ~$0.20 in re-run overhead. No fix needed; flaky tests in the existing suite are a known issue.
- PR-creation cost was low ($0.85) for a Light-pressure bug fix — the Light-pressure path (no sub-agents, inline tests) was the right call.

## Next steps

- The Settings link placement deviation should be reconciled by `/lld-sync` when E11.3's LLD is next touched.
- The `AssessmentList` empty-state "Create the first assessment" CTA now duplicates the page-level "New Assessment" button. Could be cleaned up in a future UX pass — low priority.
