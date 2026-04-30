# 0029. Repo Admin Permission: Sign-in Snapshot

**Date:** 2026-04-30
**Status:** Accepted
**Deciders:** LS / Claude

## Context

V11 introduces a **Repo Admin** role: a GitHub org member who holds admin
access to at least one repository in the org. Repo Admins can create and
edit projects, configure project context, and create FCS assessments —
but only against repos where they themselves hold GitHub admin permission.

[ADR-0020](0020-org-membership-via-installation-token.md) already
establishes the pattern V11 needs. At sign-in, the membership-resolver
calls GitHub via the installation token and snapshots the user's
**org-level role** into `user_organisations.github_role` (see
`supabase/schemas/tables.sql:90–98`). Non-auth endpoints read the
snapshot; they do not call GitHub on every request. The snapshot is a
*cache* of GitHub state, refreshed on each sign-in — never a grant.

V11 extends this snapshot with one more slice of GitHub state: per
`(user_id, org_id)`, the set of repository IDs the user holds admin
access on. No new pattern is introduced — same lifecycle, same refresh
trigger, same trust model.

The repo selector on the FCS-create form is filtered using the snapshot
for ergonomics (Repo Admins should not see repos they cannot use). That
filter is a **client-visible UI hint**, not a security boundary — a
hand-crafted POST can submit any repo ID. The server must re-check on
the write, but it re-checks against the **same snapshot**, not against a
fresh GitHub call.

Project CRUD endpoints (`POST/PATCH/DELETE /api/projects[/...]`) need a
*coarser* gate than FCS-create: a Repo Admin can manage any project in
their org, not just those touching their admin repos. So the FCS-create
endpoint adds a per-repo check on top of the coarse check; both reads
hit the same snapshot.

## Decision

1. **Snapshot the user's admin-repo set at sign-in.** Extends the
   existing `user_organisations` snapshot path (ADR-0020). Storage shape
   is an LLD-level decision (JSONB column on `user_organisations` or a
   sibling junction table both satisfy the contract).

2. **All V11 Repo-Admin checks read the snapshot. Zero GitHub calls per
   request.**

   | Endpoint class | Gate (all DB reads of the snapshot) | Rejects with |
   |---|---|---|
   | Project CRUD (`/api/projects`, `/api/projects/[id]`) | User is Org Admin **or** snapshot's admin-repo set is non-empty for this org | 403 |
   | FCS create (`/api/projects/[pid]/assessments`) | Above **and** every repo in the request payload is in the snapshot's admin-repo set | 403 |

3. **The repo selector filter is advisory.** Both the selector and the
   FCS-create endpoint read the same snapshot. Bypassing the selector
   returns 403 because the snapshot says so, not because of a fresh
   GitHub call.

4. **Snapshot refresh cadence.** Refreshed on every sign-in. No
   background refresh, no webhook invalidation in V11. A user whose
   GitHub admin permissions change mid-session sees the new state on
   next sign-in.

## Consequences

**Positive**
- One source of truth for V11 authorisation reads: the snapshot. One
  gate-helper per check, one data path. No two-tier model, no per-
  request GitHub calls.
- Project CRUD and FCS-create both have zero GitHub-call overhead per
  request — every Repo-Admin-gated endpoint behaves like the existing
  org-membership-gated endpoints.
- Refresh cadence matches the existing `github_role` window. We do not
  introduce a new staleness class — V11 extends an accepted one.
- No background job, no webhook subscription, no schedule to maintain.

**Negative**
- Mid-session GitHub permission changes do not propagate until the
  user's next sign-in. A user who lost GitHub admin on a repo five
  minutes ago can still create one FCS assessment on that repo until
  they re-authenticate. Accepted: FCS create is not destructive on the
  repo; the user is still bounded by org tenancy and org membership
  (also snapshot-cached); admin-permission churn is rare.
- A new column or table is added to persist the admin-repo set. Mild
  schema cost; LLD chooses the exact shape.

**Reversibility.** Tightening the staleness window (background refresh,
webhook-driven invalidation, fresh per-write GitHub fetch) is a pure
addition — the snapshot read remains the default and a tighter check
layers on top. Fully reversible.
