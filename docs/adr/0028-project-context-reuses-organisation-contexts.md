# 0028. Project Context Reuses `organisation_contexts` Keyed by `project_id`

**Date:** 2026-04-30
**Status:** Accepted
**Deciders:** LS / Claude

## Context

V11 moves rubric context (glob patterns, domain notes, FCS question count) from
org level to project level (Epic 3, Story 3.1). Each project gets its own
context; there is no org-level fallback for FCS rubric generation (V11
requirements §Design Principle 4).

[ADR-0017](0017-organisation-contexts-separate-table.md) anticipated this. It
created the `organisation_contexts` table with a nullable `project_id` column
and `UNIQUE (org_id, project_id)` constraint specifically as a "forward-
compatibility hook" for V2 project scoping. The schema comment in
`supabase/schemas/tables.sql:324–331` reads: *"project_id is NULL in Phase 2.
V2 adds project-level rows without a data migration."*

We need to decide whether to use the existing hook or introduce a new
`project_contexts` table.

## Options Considered

### Option 1: New `project_contexts` table

A dedicated table FK'd to `projects`, separate from `organisation_contexts`.

- **Pros:** Schema reads naturally — projects own their context. No NULL in
  unique constraint.
- **Cons:** Duplicates the table shape (same columns, same RLS pattern).
  Forces the rubric resolver to read two tables conditionally. Discards the
  ADR-0017 hook entirely. Requires a one-time copy of any existing org-level
  rows the team wishes to retain (none in practice — pre-prod).

### Option 2: Reuse `organisation_contexts`, key project rows by `project_id` (chosen)

V11 writes context rows with `project_id` populated. The existing nullable
`project_id` column and `UNIQUE (org_id, project_id)` constraint absorb the
new rows without schema change beyond an FK addition.

- **Pros:** Zero schema churn — column already exists. ADR-0017's hook is
  used for its declared purpose. One read path: `WHERE project_id = $1`.
  RLS policies extend trivially through the existing `org_id` join.
- **Cons:** Org-level rows (`project_id IS NULL`) become inert for FCS in
  V11 — they are not deleted and not consulted. The table name retains the
  "organisation" prefix despite holding project-keyed rows. Mild naming
  smell, accepted to avoid a rename migration.

## Decision

**Option 2 — reuse `organisation_contexts` keyed by `project_id`.** This is
the use ADR-0017 explicitly anticipated.

V11 changes:

1. Add `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
   to `organisation_contexts.project_id` (the column already exists; the FK
   could not be added in Phase 2 because `projects` did not yet exist).
2. The FCS rubric path reads `organisation_contexts WHERE project_id = $1`
   only. Org-level rows (`project_id IS NULL`) are not consulted —
   amends [ADR-0013](0013-context-file-resolution-strategy.md) for FCS.
3. Org-level rows are retained in the schema. They become inert for FCS in
   V11 and may be repurposed for PRCC context in a future version. No table
   drops.

## Consequences

**Positive**
- No new table, no row copy, no name conflict between two context stores.
- Resolver logic is one query with one filter. Empty result → empty
  `ContextConfig` (no fallback chain, no error).
- ADR-0017's `UNIQUE (org_id, project_id)` constraint already forbids
  duplicate per-project context rows.

**Negative**
- The table name `organisation_contexts` is misleading for V11 — most rows
  will be project-keyed. A rename is deferred; cost of renaming a populated
  table is non-trivial and the name is not user-visible.
- Org-level rows linger as dead data for FCS until PRCC reuse arrives or a
  future cleanup pass. Documented; not load-bearing.

**Reversibility.** Splitting into a separate `project_contexts` table later
would require copying project-keyed rows out and dropping the FK. Doable but
unnecessary unless org-level rows acquire a *new, conflicting* schema for
PRCC.
