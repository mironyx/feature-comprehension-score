# Session: 2026-04-13 — Participant discovery bug fix

## Issue

- #206: bug: participant cannot discover assessments before link_participant fires

## Work completed

- PR #209: fix: unlinked participants cannot discover assessments
- Added `link_all_participants()` SQL function — bulk-links unlinked `assessment_participants` rows by `github_user_id` at login time
- Called from auth callback (`src/app/auth/callback/route.ts`) after org membership resolution
- Updated Supabase types to include new RPC
- Migration: `20260413150504_link_all_participants.sql`
- Tests: 2 unit tests (callback), 11 eval tests
- Process improvement: added Step 3b (approach selection) and error test requirement to feature-core skill

## Decisions made

- **Approach: link at login, not RLS changes.** Initial implementation modified `is_assessment_participant()` and `participants_select_own` RLS policy with github_user_id fallback subqueries. User review identified this as unnecessarily complex — linking participants at login time is simpler and lets existing RLS policies work unmodified.
- **Best-effort linking.** `link_all_participants` error is logged with `logger.warn` but does not block login. The per-assessment `link_participant()` on `/assessments/[id]` remains as a safety net for participants added after the user's last login.
- **No LLD for this issue** — standalone bug fix, no design doc to sync.

## Review feedback addressed

- Reworked from RLS approach to login-time linking (simpler, per CLAUDE.md "Simplicity first")
- Added error inspection on `rpc()` result (evaluator finding: silent error discard)

## Cost retrospective

Prometheus unavailable — no cost data. Key cost drivers observed:

| Driver | Impact | Action |
|--------|--------|--------|
| Wrong initial approach (RLS changes) | High — full implementation + revert + reimplementation | Added Step 3b to feature-core: enumerate approaches, pick simplest |
| Eval tests finding basic error handling gaps | Medium — extra fix cycle | Added error test requirement to Step 4 of feature-core |
| Node.js not installed in environment | Medium — time spent installing fnm + node | Environment setup (one-time) |
| 2x feature-evaluator runs | Medium — one per approach | Avoidable if first approach was correct |
| 2x CI probe runs | Low — background, no blocking | Unavoidable with approach change |

## Next steps

- Monitor that bulk-linking works correctly in production
- Consider whether `link_all_participants` throw (network error) should be isolated from the login try/catch (eval test AC-3 documents this design risk)
