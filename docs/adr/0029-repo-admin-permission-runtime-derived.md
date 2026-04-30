# 0029. Repo Admin Permission Derived from GitHub Admin Access at Runtime

**Date:** 2026-04-30
**Status:** Accepted
**Deciders:** LS / Claude

## Context

V11 introduces a **Repo Admin** role: a GitHub org member who holds admin
access to at least one repository in the org. Repo Admins can create and
edit projects, configure project context, and create FCS assessments —
but only against repos where they themselves hold GitHub admin permission.

[ADR-0004](0004-roles-and-access-control-model.md) and
[ADR-0020](0020-org-membership-via-installation-token.md) established the
existing pattern: roles are derived from GitHub at request time using the
installation token, never persisted in an in-app role table. V11 must
either follow that pattern for the new Repo Admin role or break it by
introducing role storage.

A second decision is where the per-repo enforcement lives. The repo
selector on the FCS-create form is filtered to the user's admin repos for
ergonomics (Repo Admins should not see repos they cannot use). That
filter is a **client-visible UI hint**, not a security boundary — a hand-
crafted POST can submit any repo ID. The server must therefore re-check.

Project CRUD endpoints (`POST/PATCH/DELETE /api/projects[/...]`) need a
*coarser* gate: a Repo Admin can manage any project in their org, not
just those touching their admin repos. So the per-repo check applies to
FCS-create only.

## Decision

1. **No `project_members`, no `repo_admins`, no role-cache table.** Repo
   Admin status is computed at request time from GitHub's API using the
   installation token (extending [ADR-0020](0020-org-membership-via-installation-token.md)).

2. **Two distinct enforcement points, two distinct gate functions:**

   | Endpoint class | Gate | Rejects with |
   |---|---|---|
   | Project CRUD (`/api/projects`, `/api/projects/[id]`) | User is Org Admin **or** holds GitHub admin on at least one repo in the org | 403 |
   | FCS create (`/api/projects/[pid]/assessments`) | Above **and** every repo in the request payload is one where the user holds GitHub admin | 403 |

3. **The repo selector filter is advisory.** The selector calls a
   server-side endpoint that returns the user's admin-repo set; the FCS-
   create endpoint re-checks each submitted repo against the same
   GitHub-derived set. Bypassing the selector returns 403, not silent
   acceptance.

4. **No caching across requests in V11.** Every project-CRUD or FCS-
   create request issues fresh GitHub permission lookups via the
   installation token. Revisit if hot-path latency demands a per-session
   cache; do not pre-optimise.

## Consequences

**Positive**
- One source of truth for "is this user a repo admin": GitHub. Removing
  a user's GitHub admin access on a repo immediately removes their app-
  level Repo Admin powers — no in-app revocation step.
- No drift between GitHub permissions and app permissions. No background
  job, no webhook subscription, no role-table maintenance.
- Defence in depth: the UI filter and the server check use the same
  source, so they cannot diverge.

**Negative**
- Each project-CRUD and FCS-create request makes one or more GitHub API
  calls. Repo-list lookups are paginated and can be slow on orgs with
  hundreds of repos. Acceptable in V11 given expected request rates;
  flagged as a candidate for a per-session cache later.
- GitHub API rate-limit pressure increases with admin activity volume.
  Installation tokens have generous limits (5 000/hour per installation),
  but we should monitor — ADR-0020 already discusses this surface.
- A user who loses GitHub admin access mid-session loses Repo Admin
  capabilities on the next request. There is no in-app session
  invalidation. Acceptable — matches the existing org-membership model.

**Reversibility.** Adding a cache table or a role-snapshot is a pure
addition (no removal of the runtime check). The decision is fully
reversible.
