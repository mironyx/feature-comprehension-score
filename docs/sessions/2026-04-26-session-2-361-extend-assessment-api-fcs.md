# Session Log — 2026-04-26 — Session 2 — Issue #361

**Issue:** [#361 feat: extend GET /api/assessments/[id] with FCS source data and full participant list](https://github.com/mironyx/feature-comprehension-score/issues/361)
**PR:** [#367](https://github.com/mironyx/feature-comprehension-score/pull/367)
**Branch:** `feat/extend-assessment-api-fcs`
**Session ID:** `5f7b20fb-5fd0-4f5f-885a-295cfcdcd921`
**Epic:** [#359](https://github.com/mironyx/feature-comprehension-score/issues/359) — V8 Assessment Detail View

---

## Work completed

Extended `GET /api/assessments/[id]` (T1 of epic #359) to return FCS source data and
role-aware participant information.

### Changes

**`src/app/api/assessments/[id]/route.ts`** (+82 / −15):
- Added `FcsPr`, `FcsIssue`, `ParticipantSummary`, `ParticipantStatus`, `ParticipantDetail`
  contract types.
- Extended `AssessmentDetailResponse` with `fcs_prs`, `fcs_issues`, `caller_role`, and changed
  `participants` to `ParticipantSummary | ParticipantDetail[]`.
- Extended `ParallelData` with `fcsPrs`, `fcsIssues`, and added `github_username` to
  `allParticipants`.
- Added `assessmentType` to `FetchContext`.
- Added 2 conditional FCS queries inside existing `Promise.all` (no extra sequential round trips).
- Extracted `buildParticipantsField` helper to branch on `callerRole`.
- Added `.eq('org_id', orgId)` defence-in-depth filter to all 4 `adminSupabase` queries.

**`tests/app/api/assessments/[id].test.ts`** (+180 / −5):
- Added mock state for `fcsPrsResult` and `fcsIssuesResult` in `mockServiceClient`.
- Added `github_username` to existing participant fixtures (required by new allParticipants type).
- Added 9 new tests under `describe('GET /api/assessments/[id] — FCS enrichment (T1)')`.

---

## Decisions made

**`buildParticipantsField` helper extracted (LLD deviation):**
The LLD sketched the participants branch as an inline ternary inside `buildResponse`. Extracting
it into a private helper keeps `buildResponse` focused and enables the named `ParticipantStatus`
cast. No behaviour change. Noted in LLD sync.

**`assessmentType` added directly to `FetchContext` (LLD correction):**
LLD used an intersection type (`FetchContext & { assessmentType }`). Adding it directly to the
interface is cleaner and consistent with how `orgId` is already carried.

**`org_id` filter added to all `adminSupabase` queries (post-review addition):**
Raised by user during PR review. The initial RLS-scoped assessment lookup is the primary auth
gate; `org_id` filters on downstream service-role queries are defence-in-depth. Added to all 4
`adminSupabase` queries for consistency (questions, allParticipants, fcs_merged_prs,
fcs_issue_sources). No test changes needed — mock returns whatever is configured regardless.

**`helpers.ts` not touched:**
LLD mentioned it as an optional edit for type declarations. All new types fitted cleanly into
`route.ts` without needing extraction.

---

## Review outcome

`/pr-review-v2 367` — no blockers, no warnings. Informational notes posted:
- `buildParticipantsField` extraction is consistent with SRP.
- `Promise.resolve` placeholder shape correctly matches `{ data, error }` destructuring.
- `status as ParticipantStatus` cast is constrained by DB CHECK constraint on the four values.

CI: all jobs passed (lint/typecheck, unit, integration, Docker build, E2E Playwright).

---

## LLD sync

`docs/design/lld-v8-assessment-detail.md` updated to v0.2. Corrections recorded:
- `FetchContext` signature (intersection → direct field).
- `buildParticipantsField` extracted helper (not in original spec).
- `org_id` filter on all `adminSupabase` queries.

---

## Cost retrospective

| Snapshot | Cost | Notes |
|----------|------|-------|
| At PR creation | $3.64 | 8 min to PR |
| Final (post-review) | $7.45 | +$3.81 post-PR |

**Post-PR delta ($3.81):** Driven by the security review discussion and org_id fix commit
(extra Bash/Edit/test-runner round), plus lld-sync and feature-end overhead.

**Cost drivers:**
- Heavy cache-read usage (8.46M tokens) — context was warm throughout; cache was effective.
- Post-PR round for org_id hardening added ~1 test-runner + 1 commit cycle.
- lld-sync sub-skill reads the full LLD and diff — moderate cost for this size of change.

**Improvement actions:**
- The org_id defence-in-depth pattern should be added to `.claude/skills/shared/anti-patterns.md`
  so pr-review-v2 Agent C catches it automatically on future BE routes, avoiding a post-PR round.
- Pressure tier: called Light but src lines were ~70 (Standard threshold is 30). Skipping
  test-author was correct (existing mock infra), but the Light classification should use
  the Standard pipeline for features ≥30 src lines even when tests extend an existing file.

---

## Next steps

- #362 — T3: Icon action buttons in assessment overview table
- #363 — T4: My Assessments description
- #364 — T2: Role-based page rendering on `/assessments/[id]`
