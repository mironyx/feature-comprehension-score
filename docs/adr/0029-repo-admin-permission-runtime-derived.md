# 0029. Repo Admin Permission: Sign-in Snapshot + Server-side Re-check on Writes

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
existing pattern: org-level roles are resolved from GitHub at sign-in and
**snapshotted** into `user_organisations` (`github_role` column,
refreshed on each sign-in — see `supabase/schemas/tables.sql:90–91`).
Non-auth endpoints read the snapshot; they do not call GitHub on every
request.

V11 must decide where Repo Admin status lives along the same axis. Per-
request GitHub calls are a non-starter: most Repo-Admin-gated endpoints
(rendering `/projects`, `GET /api/projects`, `PATCH /api/projects/[id]`,
NavBar role rendering) have no other GitHub interaction, and a fresh REST
call per request would add latency and rate-limit pressure for no gain
over a cached snapshot.

A second decision is where the per-repo enforcement lives for FCS create.
The repo selector on the FCS-create form is filtered to the user's admin
repos for ergonomics. That filter is a **client-visible UI hint**, not a
security boundary — a hand-crafted POST can submit any repo ID. The
server must re-check on the write.

Project CRUD endpoints (`POST/PATCH/DELETE /api/projects[/...]`) need a
*coarser* gate: a Repo Admin can manage any project in their org, not
just those touching their admin repos. So the per-repo check applies to
FCS-create only.

## Decision

1. **Snapshot the user's admin-repo set into the database at sign-in**,
   matching the existing `user_organisations.github_role` pattern. The
   snapshot is owned by the existing membership-resolver code path
   ([ADR-0020](0020-org-membership-via-installation-token.md)) and
   refreshed on every sign-in. No new in-app role *grant* table — the
   snapshot is a cache of GitHub state, not a source of truth.

   Storage shape (LLD-level detail; pinned here only as shape, not SQL):
   per `(user_id, org_id)`, persist the set of GitHub repository IDs the
   user holds admin on. A JSONB column on `user_organisations` or a
   sibling junction table both satisfy the contract; the LLD chooses.

2. **Two distinct enforcement points, two distinct gate functions:**

   | Endpoint class | Gate | Source | Rejects with |
   |---|---|---|---|
   | Project CRUD (`/api/projects`, `/api/projects/[id]`) | User is Org Admin **or** the snapshot's admin-repo set is non-empty for this org | DB snapshot only | 403 |
   | FCS create (`/api/projects/[pid]/assessments`) | Above **and** every repo in the request payload is in a freshly fetched admin-repo set from GitHub | DB snapshot for the coarse check, **fresh GitHub call** for the per-repo check | 403 |

3. **The repo selector filter is advisory.** The selector reads the
   snapshot; the FCS-create endpoint re-checks each submitted repo
   against a fresh GitHub fetch (defence in depth — the snapshot may be
   stale within a session). Bypassing the selector returns 403, not
   silent acceptance.

4. **Snapshot refresh cadence.** The snapshot is refreshed on every
   sign-in (matching `user_organisations`). No background refresh job
   in V11. A user whose GitHub admin permissions change mid-session
   sees the new state on next sign-in for project CRUD, and on the next
   FCS-create attempt for per-repo checks (because that path always
   re-fetches).

## Consequences

**Positive**
- GitHub remains the source of truth. The snapshot is a cache, not a
  grant: revoking a GitHub admin permission flows through on the user's
  next sign-in (project CRUD) or next FCS-create (per-repo check).
- Project CRUD endpoints have zero GitHub-call overhead per request —
  they read the snapshot, like every other org-membership-gated endpoint
  in the codebase today.
- The security-critical write (FCS create) cannot be fooled by a stale
  snapshot, because it re-fetches per-repo against GitHub.
- The snapshot refresh path is the existing sign-in flow — no new
  background job, no webhook subscription, no schedule to maintain.

**Negative**
- Project CRUD permissions can be stale within a session: a user whose
  GitHub admin was revoked mid-session retains project-CRUD access until
  their next sign-in. Consistent with the existing `github_role`
  staleness window and accepted on that basis.
- FCS-create issues GitHub calls per request. Installation tokens have
  generous limits (5 000/hour per installation); flagged for monitoring,
  not pre-optimisation.
- A new column or table is added to persist the admin-repo set. Mild
  schema cost; LLD chooses the exact shape.

**Reversibility.** Tightening the staleness window (background refresh,
webhook-driven invalidation) is a pure addition. Loosening it (replacing
fresh per-repo checks with snapshot-only) would weaken the security
posture and is explicitly rejected for V11.
