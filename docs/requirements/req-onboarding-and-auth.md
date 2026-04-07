# Requirements: Onboarding and Authentication Experience

**Epic:** Onboarding & Auth Experience
**Status:** Draft
**Date:** 2026-04-07
**Author:** LS / Claude
**Related:** ADR-0001, ADR-0003, **ADR-0020**, lld-phase-2-web-auth-db.md

## Context

The original sign-in flow used the user's GitHub OAuth provider token to call `/user/orgs`. GitHub's "OAuth App access restrictions" make any org with a security policy invisible to that call, landing users on a silent dead-end. **ADR-0020** fixes this by using the GitHub App installation token to check org membership directly — bypassing OAuth restrictions entirely.

This document describes the user-facing requirements for that change.

## Goals

- Customer onboarding is one step: an admin installs the GitHub App. Nothing else.
- The one remaining failure mode ("you are not a member") is clearly explained and never traps the user.
- Membership changes on GitHub propagate to FCS on the user's next sign-in.

## Non-Goals

- Real-time revocation of an existing active session when a user is removed upstream. Access is rechecked at sign-in; a removed user retains access until their current session ends or they sign in again. Acceptable for V1.
- Replacing Supabase Auth (rejected in ADR-0020).
- In-app invite flow — GitHub org membership is the source of truth.

## Personas

| Persona | First-run path |
|---|---|
| **Admin** | Installs GitHub App → signs in → on `/assessments`. |
| **Member** | Signs in → on `/assessments`. |
| **Multi-org member** | Signs in → picks org → continues. |
| **Non-member** | Signs in → "no access" page → can sign out. |

## User Stories

### O.1: One-step onboarding

**As an** admin, **I want** to install the GitHub App and have my org immediately usable, **so that** no second approval flow is needed.

**Acceptance Criteria:**

- Public install URL exists and is documented.
- `installation.created` webhook creates an `organisations` row with `status='active'`.
- The installer can sign in immediately afterwards and lands on `/assessments`.
- The OAuth consent screen requests only `read:user`. No `read:org`, no `repo`.

### O.2: Sign-in via installation token

**As a** user, **I want** my org membership verified against the GitHub App rather than my OAuth token, **so that** OAuth App restrictions on my employer's org do not block sign-in.

**Acceptance Criteria:**

- Sign-in does not call `/user/orgs` or use the user provider token for authorisation.
- For each installed org in the `organisations` table, sign-in calls `GET /orgs/{org}/memberships/{username}` using the installation token. 200 → member; 404 → not a member.
- Matching orgs are written to `user_organisations`; non-matching rows are removed.
- The `user_github_tokens` table and any code storing the OAuth provider token are removed.

### O.3: Non-member empty state

**As a** user who is not a member of any installed org, **I want** a clear message with a way out, **so that** I am not trapped.

**Acceptance Criteria:**

- The empty `/org-select` page states: "You do not have access to any organisation using FCS. Ask your admin to install the app or add you to an org where it is installed."
- The page links to the GitHub App install URL.
- A visible Sign out button is present; signing out clears the session and redirects to `/auth/sign-in`.
- Sign-out does not delete `auth.users` or historical records.

### O.4: Install lifecycle webhooks

**As the** system, **I want** to keep our view of each install in sync with GitHub, **so that** access and repo visibility reflect what the customer actually granted.

**Acceptance Criteria:**

- `installation.created` creates the `organisations` row (covered by O.1) and records the initial repository selection in the `repositories` table.
- `installation.deleted` sets `organisations.status='inactive'` and removes all `user_organisations` rows for that org. Subsequent sign-ins skip inactive orgs.
- `installation_repositories.added` inserts rows into `repositories` for the newly granted repos.
- `installation_repositories.removed` deletes (or marks inactive) rows in `repositories` for the revoked repos; any assessments referencing a removed repo remain readable but cannot be re-scored against it.
- `installation.suspend` and `installation.unsuspend` toggle `organisations.status` accordingly.

### O.5: Telemetry

**As the** team, **I want** structured sign-in outcome events, **so that** we can detect onboarding failures in production.

**Acceptance Criteria:**

- Each sign-in emits one of: `signin.success`, `signin.no_access`, `signin.error`, carrying `user_id`, `github_user_id`, and `matched_org_count`.

### O.6: Customer onboarding doc

**As a** customer admin, **I want** a one-page setup guide, **so that** I know what I am installing.

**Acceptance Criteria:**

- `docs/onboarding/customer-setup-guide.md` covers: install, sign in, add team members, run first assessment.
- Lists every GitHub App permission and what it is used for.

## Out of Scope

- OAuth App restriction handling (ADR-0020 eliminates it).
- Branded OAuth consent screen.
- Forced session invalidation when a user is removed upstream.
- Mirror tables, reconciliation jobs, cached member lists — we call GitHub directly per sign-in. Revisit only if API load becomes measurable.

## Open Questions

- **Personal-account installs:** a GitHub App can be installed on a personal account, which has no `memberships` API. Treat the installer as the sole member; skip the API call for personal accounts. Confirm with a test install.
