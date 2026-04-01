# 0017. Organisation Contexts: Separate Table

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** LS / Claude

## Context

Issue #140 introduces `OrganisationContext` — structured domain customisation (vocabulary, focus
areas, exclusions, domain notes) that is injected into the LLM user prompt at rubric-generation
time. The data must be persisted so clients do not re-enter it on every assessment.

Three storage options were considered. The chosen option must:

1. Not require a data migration when V2 adds project-level scoping.
2. Maintain separation of concerns with the existing `org_config` table.
3. Follow the existing Supabase schema conventions in this codebase.

## Options Considered

### Option 1: JSONB column on `organisations`

Add `prompt_context jsonb` directly to the `organisations` table.

- **Pros:** Simple, no join required.
- **Cons:** Mixes tenant-identity data (`github_org_id`, `installation_id`) with prompt-content
  data. Adding project scoping in V2 would require a migration to a separate table anyway —
  the column cannot have a `project_id` FK by design.

### Option 2: JSONB column on `org_config`

Add `prompt_context jsonb` to `org_config`.

- **Pros:** `org_config` already holds org-level settings; avoids a new table.
- **Cons:** `org_config` holds *behavioural* settings (thresholds, enforcement mode, question
  count). Prompt context is *content*, not configuration. Mixing them couples unrelated concerns
  and complicates future migrations. Same V2 migration problem as Option 1.

### Option 3: Separate `organisation_contexts` table (chosen)

A dedicated table with a nullable `project_id` FK column:

```sql
CREATE TABLE organisation_contexts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = org-level
  context     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);
```

- **Pros:** Clean separation of concerns. Adding project-level scoping in V2 requires only
  populating `project_id` on new rows — no ALTER TABLE, no data migration. Follows the
  precedent set by `org_config` (separate table per concern). RLS policies are
  self-contained and do not complicate `organisations` or `org_config`.
- **Cons:** One additional table and join. Negligible cost given Supabase's query model.

## Decision

**Option 3 — separate `organisation_contexts` table.**

The `UNIQUE (org_id, project_id)` constraint enforces one context per org (Phase 2) or per
project (V2) without ambiguity. Phase 2 rows always have `project_id IS NULL`; the unique
constraint treats NULL as distinct by default in PostgreSQL, which is the correct behaviour
here (one org-level row per org).

The nullable `project_id` is an intentional forward-compatibility hook, not speculative
abstraction — the V2 project scoping requirement is already identified and the column cost
is zero in Phase 2.

## Consequences

- New table `organisation_contexts` in `supabase/schemas/tables.sql`.
- New RLS policies in `supabase/schemas/policies.sql` (members read, admins write).
- V2 project scoping: add `projects` table, then populate `project_id` on new context rows.
  Existing org-level rows (`project_id IS NULL`) continue to serve as fallback.
- A Supabase query helper (`src/lib/supabase/org-prompt-context.ts`) loads the org-level
  row at rubric-generation time and injects it into `AssembledArtefactSet`.
- See [lld-organisation-context.md](lld-organisation-context.md) for implementation detail.
