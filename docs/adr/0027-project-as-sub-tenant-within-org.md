# 0027. Project as a Sub-Tenant Within Organisation

**Date:** 2026-04-30
**Status:** Accepted
**Deciders:** LS / Claude

## Context

V11 introduces a `Project` entity that owns FCS assessments and per-project rubric
context. We need to decide whether `Project` is a new tenancy boundary (its own RLS
class, with project-level membership tables) or an organising layer within the
existing org tenancy.

[ADR-0008](0008-data-model-multi-tenancy.md) makes the organisation the tenant
boundary: every domain table carries `org_id` and every RLS policy filters by the
authenticated user's org membership. Adding a second boundary would double the
authorisation surface and require new policies, new membership tables, and new
join logic on every query that today is single-key by `org_id`.

The V11 requirements explicitly choose against project-level RBAC:

> **Design Principle 1.** Org is the tenant boundary. Projects are children of
> organisations. All RLS policies and data isolation remain at org level. Projects
> do not introduce a new security boundary.
>
> **What we are NOT building.** Project-level RBAC. No project-specific roles or
> membership lists. Access is governed by org-level roles.

This ADR pins that requirement-level decision into the architecture so that future
features (PRCC project scoping, cross-project views, project-level audit trails)
do not silently re-litigate it.

## Decision

`Project` is an organising layer **within** the existing org tenancy boundary, not
a new boundary.

- Every project row carries `org_id` and is reachable only through org-scoped RLS.
- Authorisation is decided by org role + (where applicable) GitHub admin scope —
  never by a project-level membership row. There is no `project_members` table.
- Queries on tables that gain a `project_id` column (`assessments`, future
  `repositories.project_id`, `organisation_contexts.project_id`) continue to be
  filtered by `org_id` first; `project_id` is an additional filter, not a tenant
  key.

## Consequences

**Positive**
- No new RLS policy class. Existing org-scoped policies extend by joining through
  `projects.org_id`.
- Project CRUD authorisation is a function of (org role, GitHub admin scope) —
  computable at request time without a new table.
- Cross-project admin views are trivially expressible (filter by `org_id`, group
  by `project_id`).

**Negative**
- A user with org-admin access has implicit access to every project in the org.
  No way to scope an admin to a single project without adding the boundary later.
  Acceptable for V11 — see "What we are NOT building".
- Repo Admin's project-write permission cannot be limited to a project subset; any
  Repo Admin can create/edit any project in the org. Tracked as a known
  limitation; revisit if the product gains multi-team-per-org usage patterns.

**Reversibility.** Adding a project boundary later is a schema migration plus new
RLS policies — non-trivial but doable. The decision is reversible in principle;
the cost grows with the volume of project-scoped data.
