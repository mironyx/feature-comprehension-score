# 0008. Data Model & Multi-Tenancy

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS tool is multi-tenant from the start — each GitHub organisation is an isolated tenant (Story 1.5). The database is Supabase (Postgres). This ADR decides the multi-tenancy isolation approach and the key schema principles that flow from other ADRs.

Constraints from prior decisions:

- **ADR-0004 (Roles):** `user_organisations` junction table with `is_admin` boolean. Contextual roles (Author, Reviewer) on `assessment_participants` table.
- **ADR-0005 (Aggregate score, revised to Option 4):** Per-answer `score` and `score_rationale` are stored on `participant_answers`, visible to the answering participant only (RLS). The aggregate score is stored on `assessments`. `is_reassessment` flag also stored on `participant_answers`.
- **ADR-0006 (Enforcement modes):** Repository config must include `mode` and `threshold`. Assessment records must store the score regardless of mode.
- **ADR-0007 (PR size threshold):** Repository config must include `min_pr_size` and `trivial_commit_threshold`.

## Options Considered

### Option 1: Shared database with Row-Level Security (RLS)

All tenants share one set of tables. Every table has an `org_id` column. Supabase RLS policies enforce that queries only return rows matching the authenticated user's organisations.

- **Pros:** Simple schema — one set of tables, standard migrations. RLS is enforced at the database level — application code cannot bypass it. Native Supabase feature with good tooling. No per-tenant infrastructure management.
- **Cons:** RLS policies must be correct on every table — a missing policy is a data leak. Cross-tenant queries (for platform-level analytics) require a service role that bypasses RLS. Performance at very high tenant counts may need index tuning on `org_id`.

### Option 2: Schema-per-tenant

Each organisation gets a separate Postgres schema. Application routes queries to the correct schema based on the authenticated user's org.

- **Pros:** Stronger isolation — a bug in one schema cannot leak data from another. Simpler per-tenant backup and data export.
- **Cons:** Schema proliferation — every migration must run against every tenant schema. Dynamic schema routing adds application complexity. Supabase does not natively support this pattern. Defeats the purpose of using a managed database.

## Decision

**Option 1: Shared database with RLS.**

Supabase RLS is the natural multi-tenancy mechanism for this stack. Every table carries an `org_id` column, and RLS policies reference the `user_organisations` table (ADR-0004) to scope access. The application never filters by org in application code — the database enforces it.

Schema-per-tenant is over-engineering for a V1 SaaS product. The isolation guarantees of RLS are sufficient, and Supabase's tooling is built around this model.

### Key schema principles

**Tables** (high-level, not the full schema — that's L4 Contracts):

Every table carries its own `org_id` column — even where `org_id` could be derived via joins (e.g., `assessment_questions` through `assessments`). The redundancy is deliberate: RLS policies can reference `org_id` directly on every table without joins, making policies simpler and harder to get wrong.

| Table | Purpose |
|-------|---------|
| `organisations` | Tenant registry. One row per GitHub org installation. `org_id` is the primary key. |
| `repositories` | Registered repos with config (or inherits org defaults). |
| `repository_config` | Per-repo settings: `prcc_enabled`, `fcs_enabled`, `mode`, `threshold`, `prcc_question_count`, `fcs_question_count`, `min_pr_size`, `trivial_commit_threshold`, `exempt_file_patterns`. |
| `org_config` | Organisation-level defaults. Same columns as `repository_config`. |
| `assessments` | One row per PRCC or FCS assessment. Stores type, state, aggregate score, config snapshot. |
| `assessment_questions` | Rubric: question text, weight, reference answer, per-question aggregate score. |
| `assessment_participants` | Participant list with contextual role (Author/Reviewer/Participant) and completion status. |
| `participant_answers` | Submitted answers. Stores `score numeric(3,2)`, `score_rationale text`, and `is_reassessment boolean` per answer (ADR-0005 Option 4). RLS restricts `score` and `score_rationale` reads to the answering participant; the aggregate on `assessments` remains the authoritative team-level result. |
| `user_organisations` | Junction table: user ↔ org membership with `is_admin` (ADR-0004). |

**Aggregate score storage:** The `assessments` table stores the final aggregate score. Per-question aggregates are stored on `assessment_questions`. Per-answer `score` and `score_rationale` are stored on `participant_answers` (ADR-0005 Option 4) and are readable only by the answering participant via RLS — not by authors, reviewers, or org admins.

**Config cascade:** When creating an assessment, read `repository_config` first; fall back to `org_config` for any null fields. Snapshot the effective config on the `assessments` row so historical assessments reflect the config at creation time.

## Consequences

- **Easier:** RLS enforcement is automatic — every Supabase client query is scoped without application code. One schema, one set of migrations. Config cascade is a simple null-coalesce at read time.
- **Harder:** RLS policies must be tested rigorously — a missing or incorrect policy is a tenant data leak. Every new table needs an RLS policy before it goes live.
- **Available (participant-only):** Per-answer scores are stored and accessible to the answering participant. They are not exposed to authors, reviewers, or org admins, preserving the self-directed nature of FCS self-assessment.
- **Follow-up:** L4 Contracts must define the full schema (column types, constraints, indexes) and the RLS policies for each table.

## References

- Requirements: Story 1.5 (Multi-Tenancy Isolation), Stories 1.3–1.4 (Configuration)
- ADR-0003: Auth — Supabase Auth (JWT claims used in RLS policies)
- ADR-0004: Roles — `user_organisations` table, contextual roles on `assessment_participants`
- ADR-0005: Score storage — per-answer scores on `participant_answers` (participant-only RLS), aggregate on `assessments`
- ADR-0006: Enforcement modes — `mode`, `threshold` in config; score stored on assessment
- ADR-0007: PR size threshold — `min_pr_size`, `trivial_commit_threshold` in config
