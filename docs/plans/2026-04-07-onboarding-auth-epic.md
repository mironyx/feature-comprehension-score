# Onboarding & Auth — Installation-Token Org Membership Implementation Plan

**Date:** 2026-04-07
**Input:** [docs/requirements/req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md)
**Related:**
- [ADR-0020 — Org membership via GitHub App installation token](../adr/0020-org-membership-via-installation-token.md) (Accepted)
- [ADR-0001 — GitHub App](../adr/0001-use-github-app.md)
- [ADR-0003 — Auth provider](../adr/0003-supabase-auth-github-oauth.md) (partially superseded by ADR-0020)
- [ADR-0018 — Epic/task work organisation](../adr/0018-epic-task-organisation.md)
- [lld-phase-2-web-auth-db.md](../design/lld-phase-2-web-auth-db.md) §2.3 (to be superseded by per-task LLDs under this epic)

## Overview

Replace the current OAuth-token-based org membership lookup with the GitHub App
installation token, per ADR-0020. Customer onboarding collapses to a single step
(install the GitHub App), OAuth scopes drop to `read:user`, and the
`user_github_tokens` table and its Vault key are removed.

## Current State

Sign-in today stores the user's GitHub OAuth `provider_token` in
`user_github_tokens` and uses it in [src/lib/supabase/org-sync.ts](../../src/lib/supabase/org-sync.ts)
to call `/user/orgs` and `/orgs/{org}/memberships/{user}`. This path is
invisibly blocked by GitHub's "OAuth App access restrictions" on any enterprise
org that has not pre-approved the Supabase OAuth app — landing users on a
silent dead-end.

- `org-sync.ts` is the only non-callback consumer of the user provider token.
- [src/app/auth/callback/route.ts](../../src/app/auth/callback/route.ts) passes
  the token through to `org-sync.ts`.
- [lld-phase-2-web-auth-db.md](../design/lld-phase-2-web-auth-db.md) §2.3
  documents the current flow and will be superseded by per-task LLDs from this
  epic.
- [req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md)
  defines six user stories (O.1–O.6) for the new flow.
- Nothing from this feature set has been deployed to production — the cutover
  is atomic, no feature flag, no dual-write.

## Desired End State

- Admin installs the GitHub App and signs in immediately, landing on `/assessments`.
- Sign-in never calls `/user/orgs` and does not read `session.provider_token`.
- OAuth consent requests only `read:user` — no `read:org`, no `repo`.
- `user_github_tokens` table and associated Vault key are gone.
- Non-member users see a clear `/org-select` empty state with a visible sign-out button.
- Install lifecycle webhooks keep `organisations` and `repositories` in sync.
- `signin.success|no_access|error` telemetry events are emitted per sign-in.
- `docs/onboarding/customer-setup-guide.md` exists and lists every GitHub App permission.

**Verification:**
- E2E test: admin install flow lands on `/assessments` on first sign-in.
- Grep: zero references to `provider_token` or `user_github_tokens` under `src/`.
- Unit tests for `resolveUserOrgsViaApp` cover member / non-member / personal-account / first-install-race cases.
- `npx supabase db diff` is clean after the migration lands.

## Out of Scope

Pulled from requirements §Non-Goals and ADR-0020 §6 (as amended):

- Real-time session revocation when a user is removed upstream. Access is rechecked at sign-in only. Issue #175 tracks this and stays out of this epic.
- In-app invite flow. GitHub org membership is the source of truth.
- Mirror table (`org_members`), webhook-driven member sync, reconciliation job. ADR-0020 §6 was simplified — we call GitHub live per sign-in.
- Branded OAuth consent screen (would require dropping Supabase Auth — rejected in ADR-0020 Option C).
- Replacing Supabase Auth.

## Approach

Design-down level: this plan is Level 5 (Implementation). Levels 1–4 are
covered by the requirements doc and ADR-0020.

Seven tasks under a single epic. Tasks 1–4 form the critical path for sign-in
cutover. Task 5 (install lifecycle webhooks) is independent and parallelisable
with 2–3 via `/feature-team`. Tasks 6 (telemetry) and 7 (docs) land after the
cutover.

All task LLDs live under `docs/design/lld-onboarding-auth-<task-slug>.md` per
ADR-0018 naming.

## Epic

**Title:** Onboarding & Auth — installation-token org membership
**Label:** `epic`

**Success criteria:**
- [ ] Admin install → sign-in → lands on `/assessments` (one-step onboarding).
- [ ] Sign-in does not call `/user/orgs` and does not read `session.provider_token`.
- [ ] OAuth consent requests only `read:user`.
- [ ] `user_github_tokens` table and Vault key removed.
- [ ] `/org-select` non-member empty state with sign-out button.
- [ ] Install lifecycle webhooks (`installation.*`, `installation_repositories.*`) keep `organisations` and `repositories` in sync.
- [ ] `signin.success|no_access|error` telemetry events emitted.
- [ ] `docs/onboarding/customer-setup-guide.md` published.

## Tasks

### Task 1: Add `members:read` permission to GitHub App manifest

- **Scope:** Update the GitHub App manifest / config to request `members:read` (Organisation members → Read-only). Document the re-consent flow for existing installs (mironyx).
- **Maps to:** ADR-0020 §Decision point 5, prerequisite for O.2.
- **Files touched:** GitHub App manifest/config, `docs/onboarding/customer-setup-guide.md` (permission list section only).
- **Design artefact:** New LLD `docs/design/lld-onboarding-auth-app-permission.md`.
- **Depends on:** none.
- **Estimated size:** ~80 lines + docs.
- **Acceptance criteria:**
  - [ ] GitHub App manifest lists `members:read`.
  - [ ] mironyx install re-consented (out-of-band, documented).
  - [ ] Customer-facing permission list updated.

### Task 2: `resolveUserOrgsViaApp` service

- **Scope:** New service function replacing `syncOrgMembership`. For each `organisations` row with `status='active'`, call `GET /orgs/{org}/memberships/{username}` using the installation token. 200 → member, 404 → not a member. Upsert `user_organisations` for matches, delete stale rows. Handle personal-account installs (skip API call, installer is sole admin).
- **Maps to:** O.2, ADR-0020 §Decision point 3.
- **Files touched:** new `src/lib/supabase/org-membership.ts` (or similar), unit tests.
- **Design artefact:** New LLD `docs/design/lld-onboarding-auth-resolver.md`.
- **Depends on:** Task 1 (needs the permission granted to actually call the API).
- **Estimated size:** ~180 lines.
- **Acceptance criteria:**
  - [ ] Service takes `(userId, githubUserId, githubLogin)` and returns matched org IDs.
  - [ ] Uses installation token exclusively — no provider token, no `/user/orgs`.
  - [ ] Personal-account installs handled as special case.
  - [ ] Unit tests cover: member, non-member, personal-account, mixed multi-org, 404 vs 500 distinction.

**BDD sketch:**

```
describe('resolveUserOrgsViaApp')
  it('returns matching orgs when user is a member of one installed org')
  it('returns empty array when user is not a member of any installed org')
  it('assigns installer as admin of a personal-account install')
  it('distinguishes 404 (not member) from 500 (API error) and throws on 500')
```

### Task 3: Sign-in cutover

- **Scope:** Atomic cutover with no feature flag (nothing is deployed yet).
  - Wire `resolveUserOrgsViaApp` into [src/app/auth/callback/route.ts](../../src/app/auth/callback/route.ts).
  - Delete [src/lib/supabase/org-sync.ts](../../src/lib/supabase/org-sync.ts) and any remaining provider-token code paths.
  - Drop `user_github_tokens` table + Vault key via schema file + generated migration.
  - Drop `read:org` and `repo` scopes from [src/components/SignInButton.tsx](../../src/components/SignInButton.tsx) (or wherever the OAuth scopes are set) — leaving only `read:user`.
  - Implement the first-install-and-sign-in race mitigation from ADR-0020 Open Questions.
- **Maps to:** O.1, O.2, ADR-0020 §Decision points 3 & 4.
- **Files touched:** `src/app/auth/callback/route.ts`, `src/lib/supabase/org-sync.ts` (delete), `src/components/SignInButton.tsx`, `supabase/schemas/tables.sql`, new migration, tests.
- **Design artefact:** New LLD `docs/design/lld-onboarding-auth-cutover.md`.
- **Depends on:** Task 2.
- **Estimated size:** ~220 lines. Over the soft limit but has no natural seam now that dual-write is gone — splitting would create artificial coupling between the resolver wire-up and the table drop.
- **Acceptance criteria:**
  - [ ] Zero references to `provider_token` or `user_github_tokens` under `src/`.
  - [ ] Zero references to `/user/orgs` under `src/`.
  - [ ] OAuth scope string contains only `read:user`.
  - [ ] `npx supabase db diff` is clean after migration.
  - [ ] First-install-race case handled (installer signs in immediately after install).
  - [ ] E2E happy path: install → sign in → `/assessments`.

### Task 4: `/org-select` non-member empty state

- **Scope:** Empty state on [src/app/org-select/page.tsx](../../src/app/org-select/page.tsx) when the user matches no installed org: clear message, link to GitHub App install URL, visible Sign out button. Sign-out clears the session and redirects to `/auth/sign-in`; does not delete `auth.users` or historical records.
- **Maps to:** O.3.
- **Files touched:** `src/app/org-select/page.tsx`, possibly a small shared sign-out action, tests.
- **Design artefact:** New LLD `docs/design/lld-onboarding-auth-empty-state.md`.
- **Depends on:** Task 3.
- **Estimated size:** ~120 lines.
- **Acceptance criteria:**
  - [ ] Empty-state copy matches req O.3 exactly.
  - [ ] Install URL is correct and documented.
  - [ ] Sign out redirects to `/auth/sign-in` with cleared session.
  - [ ] Unit/component test covers the empty state.

### Task 5: Install lifecycle webhooks (parallelisable with 2–3)

- **Scope:** Handlers for:
  - `installation.created` — insert `organisations` row (`status='active'`) + initial `repositories` rows.
  - `installation.deleted` — set `organisations.status='inactive'`, remove `user_organisations` rows for that org.
  - `installation.suspend` / `installation.unsuspend` — toggle `organisations.status`.
  - `installation_repositories.added` / `installation_repositories.removed` — insert/remove rows in `repositories`.
- **Maps to:** O.4.
- **Files touched:** webhook route handler(s), new installation-handlers file, tests.
- **Design artefact:** New LLD `docs/design/lld-onboarding-auth-webhooks.md`.
- **Depends on:** none (shares no files with the sign-in path). Can run in parallel with Tasks 2–3 under `/feature-team`.
- **Estimated size:** ~200 lines.
- **Acceptance criteria:**
  - [ ] All six webhook event types handled with unit tests.
  - [ ] Signature verification remains intact (existing webhook pattern).
  - [ ] Assessments referencing a removed repo remain readable but cannot be re-scored (req O.4).
  - [ ] Idempotency: replaying a webhook does not double-insert or fail.

**Coordination note for `/feature-team`:** Task 5 touches webhook handlers and `organisations`/`repositories` tables. Task 3 touches the `auth/callback` path and `user_github_tokens` table. No file overlap. Safe to parallelise.

### Task 6: Sign-in telemetry events

- **Scope:** Emit one structured event per sign-in: `signin.success`, `signin.no_access`, or `signin.error`. Payload: `user_id`, `github_user_id`, `matched_org_count`.
- **Maps to:** O.5.
- **Files touched:** `src/app/auth/callback/route.ts`, observability helper (if existing pattern), tests.
- **Design artefact:** Update to existing observability LLD if one exists, otherwise inline in `lld-onboarding-auth-cutover.md`.
- **Depends on:** Task 3.
- **Estimated size:** ~80 lines.
- **Acceptance criteria:**
  - [ ] Each of the three events fires in its respective code path.
  - [ ] Payload fields present and correctly typed.
  - [ ] Test asserts event emission for each branch.

### Task 7: Customer onboarding guide

- **Scope:** Write `docs/onboarding/customer-setup-guide.md` covering: install the app, sign in, add team members, run first assessment. List every GitHub App permission and what it is used for.
- **Maps to:** O.6.
- **Files touched:** `docs/onboarding/customer-setup-guide.md` (new).
- **Design artefact:** None — docs only.
- **Depends on:** Task 1 (needs the final permission list).
- **Estimated size:** Docs only (~150 lines of Markdown).
- **Acceptance criteria:**
  - [ ] Guide covers install → sign in → team → first assessment.
  - [ ] Every GitHub App permission listed with a one-line justification.
  - [ ] markdownlint and cspell pass.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `members:read` permission change requires mironyx re-consent; owner must click approve on a GitHub email. | Document in Task 1; verify re-consent before starting Task 3. |
| Task 3 is the largest task (~220 lines, over soft limit). | No natural seam to split on post-simplification. Accept the overrun; call out in the PR description for reviewer awareness. |
| First-install-and-sign-in race: admin installs app, then signs in before webhook handler has run. | Handled explicitly in Task 3 per ADR-0020 Open Questions: if the signing-in user matches the `sender` of a recent `installation.created` event for an org with no confirmed members yet, treat them as a member. |
| Personal-account installs have no `memberships` API. | Task 2 handles this as a special case — installer is sole admin, skip the API call. Verified by test. |
| Parallel Task 5 lands before Task 3, creating `organisations` rows the sign-in path cannot yet use. | Non-issue — old sign-in path can already consume `organisations` rows. New webhook handler is backward-compatible. |

## References

- [docs/requirements/req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md)
- [docs/adr/0020-org-membership-via-installation-token.md](../adr/0020-org-membership-via-installation-token.md)
- [docs/adr/0018-epic-task-organisation.md](../adr/0018-epic-task-organisation.md)
- [docs/design/lld-phase-2-web-auth-db.md](../design/lld-phase-2-web-auth-db.md) (§2.3 superseded)
- [src/lib/supabase/org-sync.ts](../../src/lib/supabase/org-sync.ts) (to be deleted in Task 3)
- [src/app/auth/callback/route.ts](../../src/app/auth/callback/route.ts)

## Next Step

1. Create the epic issue on the project board with the Epic section above as its body.
2. Run `/architect epic <epic-issue-number>` to produce per-task LLDs and create the seven task issues.
3. Then `/feature` (sequential) or `/feature-team 1 2 3` for the parallelisable subset (Task 5 alongside 2–3).
