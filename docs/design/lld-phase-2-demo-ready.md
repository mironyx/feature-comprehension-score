# Low-Level Design: Phase 2 — Demo-Ready FCS Cycle

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 |
| Status | Revised |
| Author | LS / Claude |
| Created | 2026-03-30 |
| Revised | 2026-03-31 (Issue #130) |
| Revised | 2026-04-01 (Issue #138) |
| Parent | [v1-design.md](v1-design.md) |
| Implementation plan | [MVP Phase 2](../plans/2026-03-29-mvp-phase2-plan.md) |

---

## 2a.1 Show rubric\_generation status on assessments page (#130)

**Stories:** 3.1
**Layers:** FE

### HLD coverage assessment

- [v1-design.md §4.3](v1-design.md) — assessment status enum defined, but the page query is an implementation concern not covered by the HLD.

### Layer: Frontend

**Current state:** `src/app/(authenticated)/assessments/page.tsx:46` filters only `status = 'awaiting_responses'`. Assessments in `rubric_generation` are invisible.

#### Fix approach

Replace the single-status filter with an `in` filter covering visible statuses:

```typescript
// Before
.eq('status', 'awaiting_responses')

// After
.in('status', ['rubric_generation', 'awaiting_responses'])
```

Add a status badge that renders differently per status:

```
src/app/(authenticated)/assessments/
  page.tsx                — update query filter, render status badge
  assessment-status.tsx   — new: StatusBadge component (pure, ≤ 15 lines)
```

#### StatusBadge component

```typescript
export function StatusBadge({ status }: { status: string }): JSX.Element
```

| Status | Display | Style |
|--------|---------|-------|
| `rubric_generation` | "Generating..." | `opacity: 0.6` (muted) |
| `awaiting_responses` | "Ready" | default |
| `rubric_failed` | "Failed" | `opacity: 0.6` (muted) — #132 |
| _(unknown)_ | raw status value | default (fallback) |

> **Implementation note (issue #130):** The spec mentioned "muted / spinner" for `rubric_generation`.
> Only opacity muting (`opacity: 0.6`) was implemented — no animated spinner. A static muted label
> is sufficient for MVP and avoids adding a client component. Unknown statuses fall back to the raw
> status string rather than throwing.
>
> A module-level `STATUS_LABELS: Record<string, string>` lookup table was used instead of a
> `switch` statement, making it easy to extend without modifying conditional logic.
>
> **Constraint (resolved):** `rubric_failed` rendering added in #132. StatusBadge shows "Failed" with muted opacity. RetryButton client component shown for admin users.
>
> **Implementation note (issue #130):** Tests were organised into two new files rather than only
> updating the existing `assessments.test.ts`:
> - `tests/app/(authenticated)/assessments/assessment-status.test.ts` — StatusBadge unit tests
> - `tests/app/(authenticated)/assessments/page.test.ts` — page query and rendering tests
>
> The existing `assessments.test.ts` was also updated to reflect the new `.in()` mock chain.

---

## 2a.2 Show success feedback after assessment creation (#131)

**Stories:** 3.1
**Layers:** FE

### HLD coverage assessment

- Not covered by HLD — this is UI polish, not a contract concern.

### Layer: Frontend

**Current state:** `create-assessment-form.tsx:121` does `router.push('/assessments')` with no feedback.

#### Fix approach

1. After successful POST, redirect with a query param: `router.push('/assessments?created=<id>')`.
2. On the assessments page, read the `created` searchParam and show a dismissible success banner.

```
src/app/(authenticated)/assessments/
  new/create-assessment-form.tsx  — append ?created=<id> to redirect
  page.tsx                        — read searchParam, render banner
```

#### Internal decomposition

The assessments page is a server component. `searchParams` are available as a prop in Next.js App Router server components.

```typescript
// page.tsx — add searchParams to function signature
export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
})
```

Banner rendering: inline conditional in the JSX (≤ 5 lines). No separate component needed for a static dismissible banner.

> **Constraint:** Do not add client-side state or auto-dismiss timer. A static banner that disappears on next navigation is sufficient for MVP.

---

## 2d.1 Admin retry for failed rubric generation (#132)

**Stories:** 3.1, 4.5
**Layers:** DB, BE, FE

### HLD coverage assessment

- [v1-design.md §4.2](v1-design.md) — assessment status enum. Needs `rubric_failed` added.
- [v1-design.md §4.3](v1-design.md) — question generation error handling. Mentions retry policy for LLM calls but not admin-initiated retry.
- ADR-0014 — API route contract pattern. New route follows this template.

### Layer: Database

Add `rubric_failed` to the assessment status enum in `supabase/schemas/tables.sql`.

Generate migration: `npx supabase db diff -f add-rubric-failed-status`.

### Layer: Backend

**Two changes:**

1. **Set `rubric_failed` on error** — in `src/app/api/fcs/service.ts`, the `triggerRubricGeneration` catch block currently swallows the error with `console.error`. Update it to also set assessment status to `rubric_failed`:

```typescript
// In triggerRubricGeneration catch block:
await params.adminSupabase
  .from('assessments')
  .update({ status: 'rubric_failed' })
  .eq('id', params.assessmentId);
```

2. **Retry endpoint** — new route `POST /api/assessments/[id]/retry-rubric`:

```
src/app/api/assessments/[id]/retry-rubric/
  route.ts     — controller (≤ 25 lines per CLAUDE.md)
  service.ts   — thin service delegating to fcs/service.ts exports
```

#### Internal decomposition — POST /api/assessments/[id]/retry-rubric

```
Controller (route.ts):
- const ctx = await createApiContext(request)
- const result = await retryRubricGeneration(ctx, id)
- return json(body)

Service (service.ts):
- Exported: retryRubricGeneration(ctx: ApiContext, assessmentId: string): Promise<{ assessment_id, status }>
  - Fetches assessment via ctx.adminSupabase
  - Delegates org-admin check to assertOrgAdmin (re-exported from fcs/service.ts)
  - Validates status === 'rubric_failed', throws ApiError(400) otherwise
  - Delegates reset + re-trigger to retriggerRubricForAssessment (from fcs/service.ts)
  - Returns { assessment_id, status: 'rubric_generation' }

fcs/service.ts exports used:
- assertOrgAdmin(supabase, userId, orgId) — org admin role check via user_organisations
- retriggerRubricForAssessment(adminSupabase, userId, assessment) — resets status to
  rubric_generation, fetches repo info + PR numbers, fire-and-forgets triggerRubricGeneration

> **Constraint:** The service must not call createClient() or any infrastructure factory. ApiContext is injected by the controller.
> **Constraint:** Return 400 if assessment is not in `rubric_failed` status. Do not allow retry from other statuses.

> **Implementation note (#132):** The original design specified a standalone service with full
> retry logic. During implementation, the retry logic was consolidated into `fcs/service.ts`
> to reuse `fetchRepoInfo`, `triggerRubricGeneration`, and branded ID types. The route service
> became a thin adapter. `assertOrgAdmin` was also exported from `fcs/service.ts` rather than
> duplicated.
```

### Layer: Frontend

Update `src/app/(authenticated)/assessments/page.tsx` (or assessment detail page) to show a "Retry" button when status is `rubric_failed`. Button calls `POST /api/assessments/[id]/retry-rubric`.

> **Constraint:** Depends on #130 (status visibility) being done first. The retry button appears alongside the "Failed" status badge.

---

## 2d.2 Wrap multi-step DB writes in transactions (#118)

**Stories:** Non-functional (data integrity)
**Layers:** DB, BE

### HLD coverage assessment

- [v1-design.md §4.2](v1-design.md) — schema defined but no transaction guidance.
- Anti-pattern checklist (`.claude/skills/shared/anti-patterns.md`) — flags multi-step writes without transactions.

### Layer: Database + Backend

**Audit scope:** Identify all multi-step `.from()` write calls (insert/update/upsert/delete) in a single function without transaction wrapping.

**Known instances from issue body:**

1. `src/lib/github/installation-handlers.ts` — `handleInstallationCreated`: upserts `organisations`, then `org_config` + `repositories` separately.
2. `src/lib/github/installation-handlers.ts` — `handleRepositoriesAdded`: reads org, then writes repos.
3. `src/app/api/fcs/service.ts` — `createAssessmentRecord`: inserts `assessments`, then `fcs_merged_prs`.
4. `src/app/api/fcs/service.ts` — `createFcs`: calls `createAssessmentRecord`, then `enrollParticipants`.
5. Full audit needed across all service files.

**Fix pattern:** Move multi-step writes into PostgreSQL functions in `supabase/schemas/functions.sql`, called via `.rpc()`. This makes them atomic.

#### Per-instance approach

For each multi-step write:

1. Create a PostgreSQL function in `supabase/schemas/functions.sql` that performs all steps in a single transaction.
2. Generate migration via `npx supabase db diff`.
3. Replace the JS-side multi-step calls with a single `.rpc()` call.
4. Write integration tests that verify atomicity (e.g. inject a failure after step 1, verify no partial writes).

> **Constraint:** Each instance may be a separate PR if the total exceeds 200 lines. Start with `createAssessmentRecord` + `enrollParticipants` as these are on the critical path.
>
> **Constraint:** If two writes are genuinely independent (failure of one cannot corrupt the other), document this with an inline comment and leave them unwrapped. Do not wrap for wrapping's sake.

---

## 2e.1 Automated Playwright smoke test (#138)

**Stories:** Non-functional (test coverage)
**Layers:** FE (E2E)

### HLD coverage assessment

- Not covered by HLD — this is a test artefact, not a design contract.

### Layer: E2E Test

**File:** `tests/e2e/fcs-happy-path.e2e.ts`

#### Test structure

> **Implementation note (issue #138):** The spec proposed a single monolithic test. Implementation
> uses `test.describe.serial` with 4 independent BDD scenarios sharing seeded state via
> `beforeAll`. Serial execution is required because tests share mutable DB state (participant
> status changes between tests).

```typescript
test.describe.serial('FCS happy path', () => {
  // beforeAll: create user, seed org/repo/assessment/questions/participant
  // afterAll: cleanup org, delete user

  test('Given an authenticated admin, when they view assessments, ...');
  test('Given a participant with a pending assessment, when they navigate to it, ...');
  test('Given a participant with filled answers, when they submit, ...');
  test('Given a completed assessment with scores, when the user views results, ...');
});
```

#### Technical approach

- **Auth:** Supabase test user created via admin API (`createE2EUser`), session cookies injected directly into Playwright browser context (`setE2EAuthCookies`). Cookie name derived from `NEXT_PUBLIC_SUPABASE_URL` hostname to match `@supabase/ssr` convention.
- **LLM/GitHub mock:** No MSW handlers needed. All data is pre-seeded via direct DB inserts (admin client bypasses RLS). The answers POST is intercepted via `page.route()` (browser-level), returning a mock `accepted` response and updating participant status directly.
- **Database:** Standalone E2E seed helpers in `tests/helpers/e2e-seed.ts` (no `@/` imports — Playwright cannot resolve them). Supabase local instance required; test skips when `NEXT_PUBLIC_SUPABASE_URL` contains `placeholder`.

> **Implementation note (issue #138):** MSW was not used. `page.route()` intercepts
> browser-to-server requests directly, which is simpler and avoids needing MSW installed
> in the Playwright process. Server-side API calls (e.g., `link_participant` RPC) are
> avoided because the E2E user is created via email/password, not GitHub OAuth.

#### Files

```
tests/e2e/
  fcs-happy-path.e2e.ts     — main E2E test (4 serial BDD scenarios)
tests/helpers/
  e2e-auth.ts               — Supabase test user creation + session cookie injection
  e2e-seed.ts               — Standalone DB seeding (org, repo, assessment, questions, etc.)
playwright.config.ts         — loads .env.test.local, configures standalone webServer
.env.test.local              — local Supabase URLs and demo keys (gitignored)
```

> **Implementation note (issue #138):** `tests/fixtures/` and `tests/mocks/` were not needed.
> Direct DB seeding + `page.route()` interception replaced the MSW + fixture approach.

#### Build prerequisite

> **Implementation note (issue #138):** Next.js `output: 'standalone'` does not copy
> `.next/static/` into the standalone output. Without client JS, React never hydrates —
> forms render as inert HTML. A `postbuild` script in `package.json` copies static assets.
> Additionally, `NEXT_PUBLIC_*` vars are baked at build time (including in middleware), so
> the build must use local Supabase env vars for E2E tests to authenticate correctly.

> **Constraint:** All external APIs must be mocked. The test must pass in CI without real GitHub OAuth, real LLM, or real GitHub API access.
>
> **Constraint:** Depends on items 1-5 being complete. Do not implement until the happy path works manually.

---

## Cross-References

### Internal (within this phase)

- §2a.1 (#130) depends on: —
- §2a.2 (#131) depends on: —
- §2d.1 (#132) depends on: [§2a.1 (#130)](#2a1-show-rubric_generation-status-on-assessments-page-130)
- §2d.2 (#118) depends on: —
- §2e.1 (#138) depends on: all P0 + P1 items

### External

- Depends on: [lld-phase-2-web-auth-db.md](lld-phase-2-web-auth-db.md) (§2.4 POST /api/fcs, §2.5 link\_participant, §2.6 assessments page)
- ADR-0014: [API route contract types](../adr/0014-api-route-contract-types.md)
- ADR-0016: [Structured logging](../adr/0016-structured-logging-pino.md) (logging items #135, #136 not in this LLD — covered by ADR)

### Shared types

- `Database['public']['Tables']['assessments']['Row']['status']` — extended with `rubric_failed` (#132)

---

## Tasks

### Task 1: Show rubric\_generation status on assessments page

**Issue title:** feat: show assessments in rubric\_generation status on assessments page
**Layer:** FE
**Depends on:** —
**Stories:** 3.1
**HLD reference:** [v1-design.md §4.3](v1-design.md)

**What:** Update the assessments page query to include `rubric_generation` status and add a StatusBadge component.

**Acceptance criteria:**

- [ ] Assessments in `rubric_generation` status appear on the assessments page
- [ ] A visual indicator ("Generating...") distinguishes them from ready assessments
- [ ] Assessments in `awaiting_responses` status still display as before

**BDD specs:**

```
describe('assessments page — status visibility')
  it('shows assessments in rubric_generation status with Generating indicator')
  it('shows assessments in awaiting_responses status as before')
  it('shows both statuses when assessments exist in each')
```

**Files to create/modify:**

- `src/app/(authenticated)/assessments/page.tsx` — update query filter, render StatusBadge
- `src/app/(authenticated)/assessments/assessment-status.tsx` — new StatusBadge component

### Task 2: Show success feedback after assessment creation

**Issue title:** feat: show success feedback after assessment creation
**Layer:** FE
**Depends on:** —
**Stories:** 3.1
**HLD reference:** —

**What:** Add a success banner on the assessments page after redirecting from assessment creation, using a `?created=<id>` query param.

**Acceptance criteria:**

- [ ] Success feedback visible after assessment creation
- [ ] Feedback identifies the newly created assessment
- [ ] No feedback shown on normal page load

**BDD specs:**

```
describe('assessment creation feedback')
  it('shows success banner when redirected with created param')
  it('does not show banner on normal page load')
  it('banner identifies the created assessment')
```

**Files to create/modify:**

- `src/app/(authenticated)/assessments/new/create-assessment-form.tsx` — append `?created=<id>` to redirect
- `src/app/(authenticated)/assessments/page.tsx` — read searchParam, render banner

### Task 3: Admin retry for failed rubric generation

**Issue title:** feat: admin retry for failed rubric generation
**Layer:** DB, BE, FE
**Depends on:** Task 1
**Stories:** 3.1, 4.5
**HLD reference:** [v1-design.md §4.2, §4.3](v1-design.md)

**What:** Add `rubric_failed` status, set it on generation failure, create retry API endpoint, show retry button in UI.

**Acceptance criteria:**

- [ ] `rubric_failed` status exists in the database
- [ ] Failed rubric generation sets assessment status to `rubric_failed`
- [ ] Admin can retry via `POST /api/assessments/[id]/retry-rubric`
- [ ] Retry resets status to `rubric_generation` and re-triggers generation
- [ ] Failed state visible on assessments page with retry option

**BDD specs:**

```
describe('rubric generation failure handling')
  it('sets status to rubric_failed when generation throws')
  it('preserves existing PR records on failure')

describe('POST /api/assessments/[id]/retry-rubric')
  it('resets status to rubric_generation and re-triggers generation')
  it('returns 404 for non-existent assessment')
  it('returns 403 for non-admin user')
  it('returns 400 if assessment is not in rubric_failed status')
```

**Files to create/modify:**

- `supabase/schemas/tables.sql` — add `rubric_failed` to status enum
- `src/app/api/fcs/service.ts` — update catch block in `triggerRubricGeneration`
- `src/app/api/assessments/[id]/retry-rubric/route.ts` — new controller
- `src/app/api/assessments/[id]/retry-rubric/service.ts` — new service
- `src/app/(authenticated)/assessments/page.tsx` — retry button for failed status

### Task 4: Wrap multi-step DB writes in transactions

**Issue title:** fix: wrap multi-step DB writes in transactions
**Layer:** DB, BE
**Depends on:** —
**Stories:** Non-functional
**HLD reference:** [v1-design.md §4.2](v1-design.md)

**What:** Audit all multi-step DB writes, move them into PostgreSQL functions for atomicity.

**Acceptance criteria:**

- [ ] All multi-step DB writes identified across the codebase
- [ ] Critical-path writes (assessment creation + PR storage + participant enrolment) wrapped in atomic PostgreSQL function
- [ ] Integration tests verify no partial writes on failure
- [ ] Genuinely independent writes documented with inline comment

**BDD specs:**

```
describe('atomic assessment creation')
  it('creates assessment, PRs, and participants atomically')
  it('rolls back all writes if participant enrolment fails')
  it('rolls back all writes if PR storage fails')

describe('atomic installation handling')
  it('creates org, config, and repos atomically')
  it('rolls back if repo insertion fails')
```

**Files to create/modify:**

- `supabase/schemas/functions.sql` — new atomic functions
- `src/app/api/fcs/service.ts` — replace multi-step writes with `.rpc()` calls
- `src/lib/github/installation-handlers.ts` — replace multi-step writes with `.rpc()` calls

### Task 5: Automated Playwright smoke test

**Issue title:** test: automated Playwright smoke test
**Layer:** FE (E2E)
**Depends on:** Tasks 1-3, plus P0/P1 items (#133, #134)
**Stories:** Non-functional
**HLD reference:** —

**What:** Playwright E2E test covering the full FCS happy path: sign in, create assessment, answer questions, view scores. All external APIs mocked.

**Acceptance criteria:**

- [ ] Playwright test runs with `npx playwright test`
- [ ] Covers: sign in → create assessment → answer → view scores
- [ ] All external APIs mocked (GitHub, LLM)
- [ ] Test passes in CI (GitHub Actions)

**BDD specs:**

```
describe('FCS happy path')
  it('admin creates assessment, participant answers, scores display')
```

**Files to create/modify:**

- `tests/e2e/fcs-happy-path.e2e.ts` — main E2E test
- `tests/fixtures/` — LLM response fixtures (if not existing)
- `tests/helpers/auth.ts` — Supabase test session helper (extend if needed)
