# Session Log: 2026-04-18 Session 2 — installation_id test assertions

**Issue:** #261 — fix: fetchRepoInfo omits installation_id from Supabase select
**PR:** #262
**Branch:** `fix/fetchrepoinfo-installation-id`

## Work completed

- Investigated issue #261 and found the source code fix was already applied in commit `81b13e7`
- Added 2 test assertions verifying `createGithubClient` is called with the numeric installation ID (`42`), not `undefined`:
  - `tests/app/api/fcs.test.ts` — main FCS creation path
  - `tests/app/api/assessments/[id].retry-rubric.test.ts` — retry-rubric path
- Updated `/baseline` skill to require verification of discrepancies against current code before reporting them as Critical or Divergent (the root cause of this spurious issue)

## Decisions made

- **No source code changes needed** — the bug was already fixed; only the test coverage gap remained
- **Baseline skill improvement** — added verification gate to prevent future false-positive critical findings from stale drift reports
- **LLD sync skipped** — no LLD covers this bug fix

## Review feedback

- PR review: clean, no findings
- CI: integration tests failed on transient Supabase CLI download corruption; re-run triggered

## Cost retrospective

Cost data unavailable — session tagging wrote to WSL path, not the Windows path the cost script reads.

**Cost drivers identified:**
- Very small change (10-line diff); minimal cost overall
- CI probe ran but hit a transient infrastructure failure, requiring a re-run

**Improvement actions:**
- Fix session tagging to write to a path accessible from both WSL and Windows environments

## Next steps

- Monitor CI re-run for PR #262
- Pick next task from the board
