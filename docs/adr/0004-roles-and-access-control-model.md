# 0004. Roles & Access Control Model

**Date:** 2026-03-06
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS Tool needs a role model that determines who can do what. The requirements define four roles:

- **Org Admin** (persistent) — installs the app, configures settings, creates FCS assessments, skips PRCC gates.
- **User** (persistent) — any authenticated member of an organisation with the app installed. Can view assessments and answer those they participate in.
- **Author** (contextual) — PR author for a specific PRCC assessment. Assigned automatically.
- **Reviewer** (contextual) — required reviewer on a PR for a specific PRCC assessment. Assigned automatically.

Key constraints:

1. **GitHub is the identity provider.** Users authenticate via GitHub OAuth (ADR-0003). We do not maintain separate credentials.
2. **GitHub already defines org-level roles.** Organisation owners/admins in GitHub should map to Org Admin in our app. We should not create a parallel permission hierarchy.
3. **Supabase RLS enforces multi-tenancy.** Every table is scoped by `org_id`. RLS policies need to know the user's org membership and admin status to filter queries (see ADR-0003, ADR-0008).
4. **Contextual roles are per-assessment.** A User becomes an Author or Reviewer only within a specific assessment — not permanently.
5. **No repo-level admin role.** The requirements explicitly state repo-level configuration is exercised by Org Admins, not repo admins/maintainers.

The decision is: how do we resolve, store, and enforce these roles?

## Options Considered

### Option 1: GitHub-derived roles with login-time cache

Fetch the user's GitHub org memberships and admin status at login. Store in a `user_organisations` junction table with an `is_admin` boolean. Contextual roles (Author, Reviewer) stored as a `role` column on the `assessment_participants` table. No separate roles/permissions table.

- **Pros:**
  - GitHub is the single source of truth for persistent roles. No drift between "GitHub says admin" and "app says not admin".
  - Simple schema: one junction table for org membership, one column for contextual role.
  - Aligns with ADR-0003 which already caches org membership on login.
  - No admin UI needed for role management — permissions follow GitHub.
  - RLS policies can reference `user_organisations` directly.

- **Cons:**
  - Cache goes stale between logins. If a user loses GitHub admin status, the app does not know until they log in again.
  - Cannot assign Org Admin to someone who is not a GitHub org admin (no override).
  - Adding a new persistent role later requires schema changes.

- **Implications:** We accept staleness between logins as a V1 trade-off. The failure mode is minor: a demoted admin retains access until their session expires or they re-login. A manual "refresh permissions" button is a simple V2 addition if needed.

### Option 2: App-managed roles table

Maintain a dedicated `roles` or `user_roles` table. Seed from GitHub on first login but allow manual assignment and override via the web app.

- **Pros:**
  - Full control over role assignment. Can grant Org Admin to non-GitHub-admins.
  - Can add custom roles (e.g., "Team Lead") without schema changes.
  - Fast lookups from a purpose-built table.

- **Cons:**
  - Two sources of truth for admin status: GitHub and our roles table. Users will be confused when their GitHub role does not match their app role.
  - Requires admin UI for role management — additional implementation work.
  - Sync complexity: what happens when GitHub admin status changes? Do we override the app role? Ignore it? Notify?
  - Over-engineered for V1 where the only persistent distinction is admin vs not-admin.

- **Implications:** Introduces governance overhead (who manages roles?) and sync bugs. Solves a problem we do not have in V1.

### Option 3: Real-time GitHub API checks on every request

No caching. Call the GitHub API to verify org membership and admin status on every authenticated request.

- **Pros:**
  - Always current. No staleness.
  - No cache table to maintain.

- **Cons:**
  - Adds latency to every request (GitHub API round-trip).
  - Subject to GitHub API rate limits (5,000 requests/hour per installation token, less for user tokens).
  - A GitHub API outage would make our app unusable even if our own services are healthy.
  - Wasteful: org membership rarely changes between requests.

- **Implications:** Poor user experience and fragile availability. Unacceptable for a web application.

## Decision

**Option 1: GitHub-derived roles with login-time cache.**

The reasoning:

1. **Simplicity.** The V1 role model has exactly one meaningful persistent distinction: admin vs not-admin. A boolean on a junction table is the right level of complexity for a binary distinction. A full roles table is premature.

2. **Single source of truth.** GitHub org admin status is the canonical answer to "who can configure this organisation?" Duplicating that into an app-managed table creates a second source of truth with no clear benefit.

3. **Alignment with ADR-0003.** We already decided to cache org membership at login for the org switcher (Story 1.2). Adding a `github_role` column to the same cache is trivial — admin status derived via `is_org_admin()` function.

4. **Contextual roles are data, not configuration.** Author and Reviewer are determined by assessment creation (from PR metadata or manual nomination), not by role assignment. They belong on the `assessment_participants` table as a `role` column, not in a roles system.

### Specific implementation decisions

**Persistent role resolution:**

| GitHub org role | App role | How resolved |
|----------------|----------|-------------|
| Owner or Admin | Org Admin | GitHub API: `GET /user/memberships/orgs` returns `role: "admin"` for owners and admins |
| Member | User | Same API: `role: "member"` |
| Not a member | No access | Org not present in membership response |

**Storage schema (conceptual):**

```
user_organisations
  - user_id       (FK → auth.users)
  - org_id        (FK → organisations)
  - github_role   (text — 'admin', 'owner', or 'member'; admin status derived via is_org_admin())
  - updated_at    (timestamp — when last refreshed)
  - UNIQUE(user_id, org_id)
```

**Contextual role storage:**

```
assessment_participants
  - assessment_id  (FK → assessments)
  - user_id        (FK → auth.users)
  - role           (enum: 'author' | 'reviewer' | 'participant')
  - ...
```

The `participant` value covers FCS participants who are neither author nor reviewer.

**RLS policy approach:**

- All tables have `org_id` column and base RLS policy: user must have a row in `user_organisations` for that `org_id`.
- Admin-only operations (configuration, FCS creation, gate skip) add: `AND is_org_admin(org_id)` (derives admin status from `github_role IN ('admin', 'owner')`).
- Assessment access adds: user must be in `assessment_participants` for that assessment, OR be an Org Admin for that org.
- A PostgreSQL function `get_user_org_role(org_id)` encapsulates the lookup, reusable across policies.

**Staleness mitigation:**

- Session expiry (Supabase Auth default: 1 hour access token, refreshed automatically) does NOT trigger a permissions refresh — only a full re-login does.
- V1 accepts this. The worst case: a user demoted from GitHub admin retains Org Admin in the app until they log out or their refresh token expires.
- V2 option if needed: periodic background refresh or a manual "refresh permissions" action.

## Consequences

- **Easier:** No role management UI. No sync logic. No role governance decisions. Admin status "just works" based on GitHub.
- **Easier:** RLS policies are straightforward — check `user_organisations` for membership and admin status, check `assessment_participants` for assessment access.
- **Easier:** Contextual roles require no special infrastructure — they are a column on participant records, populated when assessments are created.
- **Harder:** Cannot grant Org Admin to non-GitHub-admins. If an organisation wants a non-admin to configure the tool, they must grant that person GitHub org admin. This is intentional — the tool should not create a shadow permission structure.
- **Harder:** Role cache is stale between logins. Acceptable for V1 given the low-risk failure mode.
- **Follow-up:** ADR-0008 (data model) must include `user_organisations` table with `github_role` column and define RLS policies referencing `is_org_admin()`.
- **Follow-up:** The `get_user_org_role(org_id)` PostgreSQL function should be defined in ADR-0008 or L4 contracts.
- **Explicitly not doing:** App-managed roles — the V1 role model is too simple to justify a roles system. If V2 introduces team-level roles or custom permissions, we can revisit with a new ADR that supersedes this one.
- **Explicitly not doing:** Repo-level admin — requirements state Org Admins handle repo configuration. GitHub repo maintainers/admins have no special privileges in our app.

## References

- Requirements: Roles section, Stories 5.1, 5.2, 2.7
- ADR-0003: Auth — Supabase Auth + GitHub OAuth (org membership cache, RLS integration)
- ADR-0008: Data model & multi-tenancy (pending — must incorporate `user_organisations` schema)
- Design: `docs/design/v1-design.md` — C5 (Authentication & Access Control)
