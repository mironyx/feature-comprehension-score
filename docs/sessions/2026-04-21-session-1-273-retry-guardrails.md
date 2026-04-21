# Session Log — 2026-04-21 Session 1

**Issue:** #273 — feat: assessment retry guardrails & error display (E18.2)
**Epic:** #271 (Pipeline Observability & Recovery — Wave 2, Story 18.2)
**PR:** #277 — <https://github.com/mironyx/feature-comprehension-score/pull/277>
**Branch:** `feat/e18-retry-guardrails`
**Worktree:** `../fcs-feat-273-e18-retry-guardrails`
**Session ID:** `c04fe043-a0e5-4a3a-bd3c-872ca3438402`
**LLD:** `docs/design/lld-e18.md` §18.2

## Work completed

- Added `rubric_retry_count integer NOT NULL DEFAULT 0` to `supabase/schemas/tables.sql`;
  generated migration `20260420230842_e18_2_rubric_retry_count.sql` via `supabase db diff`.
- Extended `Database['public']['Tables']['assessments']` Row/Insert/Update for the new column.
- `src/app/api/assessments/[id]/retry-rubric/service.ts` — added guardrail checks:
  - 404 if assessment not readable (RLS-scoped, see Decisions below).
  - 403 if caller is not org admin.
  - 400 for wrong status, retry-count cap (`>= MAX_RUBRIC_RETRIES = 3`), non-retryable error.
- `src/app/api/fcs/service.ts` — `retriggerRubricForAssessment` now:
  - delegates payload construction to new private helper `buildRetryResetUpdate(retryCount)`
    (status reset, counter increment, clear all error/observability/progress fields);
  - scopes the update by both `id` and `org_id` (ADR-0025 defence-in-depth);
  - exports `MAX_RUBRIC_RETRIES = 3`.
- `src/app/(authenticated)/assessments/page.tsx` — extended Supabase select + displayed
  error code adjacent to the Failed badge for `rubric_failed` rows.
- `src/app/(authenticated)/assessments/retry-button.tsx` — added guardrail props
  (`retryCount`, `maxRetries`, `errorRetryable`), extracted private helper
  `getDisabledReason` for guardrail precedence, rendered disabled reason messages
  and `Retry (Attempt N of 3)` label.
- Added 37 tests across three files (service, button, page) + 1 cross-org RLS
  regression test added in response to review.

## Decisions made

- **Initial SELECT goes through `ctx.supabase`, not `ctx.adminSupabase`.** LLD §18.2
  originally showed the read using `adminSupabase`; caught in post-PR review — service
  role bypasses RLS and leaks cross-org existence before `assertOrgAdmin` runs. Fixed in
  commit `c4c6934`; added a regression test simulating RLS-denied cross-org access.
  Pattern recorded in memory (`feedback_adminsupabase_rls_scope.md`) — this is the
  second time it has come up across E18 stories.
- **Writes still use `adminSupabase`, but with `.eq('id').eq('org_id', ...)`** for
  defence-in-depth per ADR-0025. Documented in LLD callout.
- **Two private helpers not in LLD internal decomposition.** `buildRetryResetUpdate`
  (extracted from `retriggerRubricForAssessment`) and `getDisabledReason` (extracted
  from `RetryButton`) were added to keep their callers under the 20-line body budget.
  Both carry `// Justification:` comments — added after `/pr-review-v2` flagged them.
- **Error display rendered as two adjacent elements** rather than the LLD's
  concatenated `Failed: malformed_response` string. Avoids duplicating `"Failed"`
  copy between the badge and the error row. Documented as a design deviation in the
  PR body and now reflected in the LLD.
- **Exported `MAX_RUBRIC_RETRIES = 3`** rather than inlining the literal — matches the
  `retry-button.tsx` `maxRetries` prop contract and gives a single source of truth.

## Review feedback addressed

- `/pr-review-v2 277` (Agent C — design conformance): flagged `getDisabledReason` and
  `buildRetryResetUpdate` as unspecified helpers missing `// Justification:` comments.
  Resolved in commit `f386529`.
- User review (this session): `adminSupabase` was used for the initial SELECT without
  an org-id guard. Switched to `ctx.supabase` in commit `c4c6934`; added cross-org RLS
  regression test; saved pattern to persistent memory.

## LLD sync (issue #273)

Updated `docs/design/lld-e18.md` §18.2 in commit `f055a50` with:

- Change-log row dated 2026-04-21.
- Code example switched from `ctx.adminSupabase` to `ctx.supabase`.
- Update example scoped by both `id` and `org_id`.
- Implementation-note callout for the adminSupabase→RLS-scoped switch.
- Implementation-note callouts for the two extracted helpers.
- Implementation-note callout for the error-display rendering deviation.
- Constant `MAX_RUBRIC_RETRIES = 3` documented in prose.

## Verification

- `npx vitest run` — 1033/1033 pass (107 test files).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run lint:md` — clean.
- `npx supabase db reset` + `db diff` — no drift.
- CI run 24695956816 — pass (lint, types, unit, integration, Docker build, E2E).

## Next steps / follow-up

- Story 18.3 (#274, PR #276) already merged; E18 Wave 2 (18.1 #272 + 18.2 #273) now complete.
- Board: move #273 to Done, tick `- [ ] #273` in epic #271.
- Potential follow-up: audit other API route handlers for the same
  `adminSupabase`-initial-SELECT pattern flagged in this PR. Grep shows
  `src/app/api/organisations/[id]/retrieval-settings/service.ts` and
  `src/app/api/organisations/[id]/context/service.ts` already use `ctx.supabase` —
  the retry-rubric route was the outlier. A quick audit issue would verify.

## Cost retrospective

| Stage | Cost | Tokens (in / out / cache-read / cache-write) |
|-------|------|----------------------------------------------|
| At PR creation | $13.43 | 10,769 / 106,076 / 16.18M / 748k |
| Final (post-review) | $16.92 | 10,853 / 126,289 / 21.33M / 812k |
| **Delta** | **+$3.49** | +84 / +20,213 / +5.15M cache-read / +64k cache-write |

### Cost drivers

| Driver | Evidence | Impact |
|--------|----------|--------|
| Context compaction mid-session | Session resumed from auto-summary before PR review completed; Agent A of `/pr-review-v2` had already returned `[]` and Agents B + C were launched after resume | **High** — the resume re-read the full context envelope including CLAUDE.md, skill definitions, and teammate wiring; cache-read grew by 5.15M tokens alone |
| Post-PR review round | User flagged adminSupabase→RLS gap → extra commits (`c4c6934` fix, `f055a50` LLD sync), one regression test, Prometheus re-query | Medium — $1–1.50 extra |
| Multiple `/pr-review-v2` agents in parallel (A, B, C) | 3 subagents each re-sent the full 1110-line diff | Medium — unavoidable given the review skill design, but each re-send is ~$0.30–0.50 |
| `lld-sync` re-read LLD + source | One additional full-file read of LLD §18.2 plus 4 surgical edits | Low |

### Improvement actions for next feature

- **`adminSupabase` defaults to dangerous.** Added memory
  `feedback_adminsupabase_rls_scope.md`. When writing the interface in Step 4a, default
  the initial SELECT to `ctx.supabase` and make the test-author prompt call out RLS
  scoping as a mandatory contract property.
- **LLD code snippets should show the RLS-scoped client by default.** Updated this
  LLD in sync; worth a one-off sweep of other LLDs to normalise the pattern.
- **Compaction inflates cache-read.** This session crossed the compaction boundary
  mid-review; $16.92 for a 1110-line PR is higher than comparable wave-2 stories
  (18.3/#274 landed at ~$9). Breaking the PR into a data-layer PR (schema + service)
  and a UI PR (page + button) would keep each under the compaction boundary and cut
  cache-read in half.
- **Keep `/pr-review-v2` single-agent for diffs under ~500 lines.** The 3-agent path
  is calibrated for ≥150 lines, but the extra cost is linear in diff size. A tighter
  threshold (≥500) would save ~$1 per review on medium PRs like this one.
