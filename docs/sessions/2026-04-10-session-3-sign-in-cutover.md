# Session Log — 2026-04-10 Session 3

**Issue:** #179 — feat: sign-in cutover to installation-token org membership
**Branch:** `feat/sign-in-cutover`
**PR:** [#205](https://github.com/mironyx/feature-comprehension-score/pull/205)
**Session ID:** `93b39557-ac0f-4d55-8b28-052ae216164c`

## Work completed

- Rewrote `/auth/callback` around `resolveUserOrgsViaApp` + `emitSigninEvent`
- Deleted `src/lib/supabase/org-sync.ts` and its test file
- Dropped `user_github_tokens` table, Vault secrets cleanup, `store_github_token`/`get_github_token` RPCs
- Reduced OAuth scopes from `user:email read:user read:org repo` to `read:user`
- Added metadata validation guard for malformed `provider_id`/`user_name` (LLD §4.3)
- Updated `src/lib/supabase/types.ts` to remove `user_github_tokens` and related types
- Generated and hand-edited migration (Vault secrets cleanup step)
- Updated integration tests and test helpers to remove dropped table references
- Feature evaluator ran: found 4 metadata edge-case gaps, 1 silent failure, 1 spec deviation — all fixed
- PR review (2-agent): found silent-swallow in `findFirstInstallAsInstaller` — fixed with `logger.error`
- **Post-review simplification:** removed entire first-install-race fallback per user feedback (KISS)

## Decisions made

1. **First-install-race fallback removed (KISS).** The LLD specified a 5-minute-window fallback
   with `installer_github_user_id` column, `findFirstInstallAsInstaller` helper, and
   `firstInstallFallback` option. User correctly identified that the installer rarely signs in
   immediately — the entire mechanism was speculative engineering. Removed 291 lines of code.
   If the race becomes a real user complaint, the fix is to decouple the GitHub App setup URL
   from `/auth/callback`.

2. **`emitSigninEvent` field names use snake_case** (`matched_org_count`) rather than the
   camelCase (`matchedOrgCount`) shown in the LLD — matches telemetry convention.

3. **`src/lib/github/client.ts` audit deferred.** The file still references `get_github_token`
   but has no active callers that block the cutover. Cleanup deferred to a follow-up issue.

4. **LLD synced.** Updated `docs/design/lld-onboarding-auth-cutover.md` from Draft to Revised —
   corrected §4.1 code snippet, marked §6 as descoped, updated acceptance criteria.

## Review feedback addressed

- **[silent-swallow] `findFirstInstallAsInstaller`:** Added `logger.error` calls for both DB
  query failure paths. Subsequently removed the entire function (KISS decision).
- All other review findings were clean.

## Verification

- 511 tests passing across 70 test files
- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- 3 commits on branch

## Cost retrospective

### Cost summary

- PR-creation cost: unavailable (Prometheus unreachable)
- Final total: unavailable (session tagging did not persist in worktree)

### Cost drivers

| Driver | Detected | Impact |
|--------|----------|--------|
| Context compaction | Yes — session continued from compact summary | High — full re-read of all files |
| Fix cycles | 9 vitest runs before green | Medium |
| Agent spawns | 4 (evaluator, CI probe, 2× PR review) | Medium |
| Post-review simplification | User-requested removal of fallback (extra commit cycle) | Low |

### Improvement actions

- **Evaluate KISS earlier:** The fallback complexity should have been questioned during LLD
  review, not after implementation. Future LLDs should flag speculative mitigations with a
  "Do we actually need this?" checkpoint.
- **Worktree cost tracking:** Session tagging did not persist in the worktree — investigate
  whether `tag-session.py` writes to the correct prom directory when in a worktree.

## Next steps

- `src/lib/github/client.ts` cleanup (follow-up issue)
- Consider decoupling GitHub App setup URL from sign-in callback (follow-up if race reported)
