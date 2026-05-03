# Team Session — Admin View Navigation Fixes

**Date:** 2026-05-03  
**Issues:** #444, #445, #446  
**Lead:** feature-team-444-445-446  

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|---|---|---|---|---|
| #444 | Restore `PollingStatusBadge` during `rubric_generation` in admin detail view | #448 | `feat/fix-polling-rubric-generation` | 2026-05-03 |
| #445 | Remove stale "← Back to Organisation" back-link from `AssessmentAdminView` | #447 | `feat/fix-back-link-admin-view` | 2026-05-03 |
| #446 | Add `SetBreadcrumbs` to `/results` and `/submitted` pages | #449 | `feat/fix-breadcrumbs-results-submitted` | 2026-05-03 |

## Cross-cutting decisions

- **Single wave, all parallel.** All three issues are independent enough to run simultaneously despite #444 and #445 both touching `assessment-admin-view.tsx` — they modify different line ranges (polling logic vs. the back-link block), so no merge conflict arose.
- **Rebase alerting.** Lead pre-emptively notified teammate-445 to rebase after #444 merged first. In practice the rebase was a no-op (different lines), but the alert is the right habit.
- **No new abstractions.** All three fixes reused existing patterns: `PollingStatusBadge`, `SetBreadcrumbs`, `getOrgRole`. No helpers were extracted.

## Coordination events

- Teammates 444 and 445 spawned simultaneously despite overlapping file; lead issued a rebase advisory to teammate-445 after #448 merged.
- Teammate-446 caught and fixed an RLS-scope violation during `/pr-review` (inline `user_organisations` query via `adminSupabase` in `submitted/page.tsx` replaced with `getOrgRole`). This was the only substantive post-review fix across all three PRs.
- Teammate-444 had one deferred warning (hardcoded `initialStatus` prop matches existing codebase pattern — acceptable).
- CI E2E jobs cancelled on #448 due to a GitHub Actions npm cache HTTP 400 flake — not a code defect.

## Costs

| Issue | PR-creation | Final | Post-PR delta |
|---|---|---|---|
| #444 | $0.98 | $1.28 | $0.30 |
| #445 | ~$1.00 | $1.36 | ~$0.36 |
| #446 | $2.45 | $4.82 | $2.37 |
| **Total** | | **~$7.46** | |

#446's post-PR delta ($2.37) was the largest — driven by the kernel anti-pattern fix and RLS-scope correction caught in review. The LLD did not pre-specify the `getOrgRole` helper as the canonical path for admin-check in page-level server components; specifying that in the LLD would have prevented the review cycle.

## What worked / what didn't

**Worked:**
- Parallel spawn across all three issues with a single-wave plan completed in one lead turn.
- Pre-emptive rebase advisory eliminated a potential merge conflict.
- All teammates self-corrected blockers from `/pr-review` without lead intervention.

**Didn't work as well:**
- #446's RLS-scope violation was avoidable — the LLD for breadcrumb pages should have referenced `getOrgRole` explicitly as the required pattern for `caller_role` resolution. Without that, the teammate reached for an inline query.

## Process notes for `/retro`

- For page-level server components that need a role check, the LLD should explicitly name `getOrgRole(supabase, ...)` as the required helper — not just describe the behaviour. This prevents the inline-query anti-pattern from recurring.
- The `adminSupabase` / `getOrgRole` boundary is still tripping teammates on new pages. Consider adding a one-line rule to CLAUDE.md: "Never call `adminSupabase` for role checks in page components — use `getOrgRole`."
