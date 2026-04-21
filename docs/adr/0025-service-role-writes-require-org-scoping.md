# 0025. Service-role Supabase writes require explicit org scoping

**Date:** 2026-04-20
**Status:** Accepted
**Deciders:** LS / Claude

## Context

Per [ADR-0008](0008-data-model-multi-tenancy.md), the system is a shared-schema multi-tenant
database with `org_id` on every tenant-owned table and Row-Level Security (RLS) policies that
filter every user-initiated query by the authenticated user's organisations. RLS is the
primary defence against cross-tenant data leaks.

Some operations cannot run under RLS:

- **Background jobs** — `triggerRubricGeneration` is dispatched `void`, so the HTTP response
  returns before rubric generation completes. The user's session is gone by the time the job
  writes back to the database.
- **Platform-level operations** — cross-tenant analytics, cron jobs, webhook ingestion.
- **Installation-context writes** — actions scoped by GitHub App installation rather than by
  a user session.

For these paths we use the Supabase **service-role client** (`adminSupabase: ServiceClient`),
which bypasses RLS entirely. Any mistake in the query — wrong `assessmentId`, truncated
filter, missing predicate — would cross tenant boundaries silently.

During review of PR #275 (E18.1 pipeline error capture), `markRubricFailed` updated the
`assessments` table with `.eq('id', assessmentId)` only. The `assessmentId` originated from
an authenticated session earlier in the request, so in practice no tenant boundary was
breached, but the UPDATE carried no independent org predicate. A future refactor that
constructed `assessmentId` from a less-trusted source would not have been caught by any
safeguard.

We need an explicit, testable rule for every service-role write.

## Decision

**Every write performed with the service-role client against a tenant-owned table MUST
include `org_id` as an explicit filter predicate**, in addition to the primary key.

Concretely, for Supabase query-builder calls:

```typescript
// Required shape for service-role UPDATE / DELETE on tenant-owned tables
await adminSupabase
  .from('<tenant_table>')
  .update(patch)
  .eq('id', recordId)
  .eq('org_id', orgId);   // ← mandatory defence-in-depth predicate
```

For `INSERT`, the row itself must carry `org_id` — callers must not rely on defaults.

For `rpc()` calls, the underlying function must accept and enforce `org_id` internally, or
the caller must verify ownership in a preceding query.

### Scope

Applies to every table listed as tenant-owned in `supabase/schemas/tables.sql` (every row
carrying an `org_id` column).

Exempt:

- `organisations` (root of the tenant hierarchy; scoped by primary key only).
- Global / cross-tenant tables (e.g. `platform_admins`, rate-limit counters) — if any exist,
  they must be documented here.
- Read-only `SELECT` queries — the risk surface is smaller because a mis-scoped read returns
  extra rows rather than mutating another tenant's data. Service-role reads still SHOULD be
  scoped, but the MUST applies only to writes.

### Enforcement

1. **PR review** — the `pr-review-v2` skill must flag any service-role `update()`, `delete()`,
   or `insert()` against a tenant-owned table that lacks an `org_id` predicate or field.
2. **Tests** — service-role mutation paths must have a test that asserts the `.eq('org_id', ...)`
   call is present. See `tests/app/api/fcs-pipeline-error-capture.test.ts::A8` for the pattern.
3. **Code review comment** — every service-role write should carry an inline reference to this
   ADR so the next reader understands why the redundant-looking predicate is there.

## Consequences

**Positive:**

- Defence-in-depth: a bug that produces the wrong `assessmentId` cannot cross tenants.
- Explicit contract: reviewers don't have to trace provenance of every ID to decide whether
  a query is safe.
- Testable: `.eq('org_id', ...)` is a trivially-assertable call in mocked clients.
- Aligns service-role writes with the RLS model users are already under — no quiet "escape
  hatch" semantics.

**Negative:**

- Every service-role write gets one extra predicate and one extra function parameter
  (`orgId`). Minor boilerplate.
- Tests must exercise the filter, not just the payload — requires mock clients to capture
  chain arguments, not only the final `update()` shape.
- Existing service-role writes added before this ADR need auditing. ~~Identified follow-up:
  `retriggerRubricForAssessment` in `src/app/api/fcs/service.ts` currently performs a
  service-role UPDATE without `org_id` scoping.~~ Resolved in E18.2 (PR #277) — now scopes
  by `.eq('id', assessmentId).eq('org_id', orgId)`. Full audit tracked in #278.

**Neutral:**

- The rule does not replace RLS — RLS remains the primary control for user-initiated queries.
  This ADR covers the gap where RLS cannot run.

## Related

- [ADR-0008](0008-data-model-multi-tenancy.md) — shared-schema multi-tenancy and RLS baseline.
- [ADR-0020](0020-org-membership-via-installation-token.md) — installation-token shim for
  org membership; similar "narrow point of privilege" principle.
- PR #275 — first enforcement. `markRubricFailed` updated to carry `org_id`.
