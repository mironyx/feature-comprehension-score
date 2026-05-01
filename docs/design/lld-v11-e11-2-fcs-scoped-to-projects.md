# LLD — V11 Epic E11.2: FCS Scoped to Projects

**Date:** 2026-05-01
**Version:** 0.1
**Epic:** E11.2 (#409)
**Plan:** [docs/plans/2026-04-30-v11-implementation-plan.md](../plans/2026-04-30-v11-implementation-plan.md)
**HLD:** [v11-design.md §C3, §3.V11.1](v11-design.md#c3-feature-comprehension-score-fcs--extended)
**Requirements:** [v11-requirements.md §Epic 2](../requirements/v11-requirements.md#epic-2-fcs-scoped-to-projects-priority-high)
**Related ADRs:** [0027](../adr/0027-project-as-sub-tenant-within-org.md), [0029](../adr/0029-repo-admin-permission-runtime-derived.md)

---

## Part A — Human-reviewable

### Purpose

Wire `project_id` into the FCS creation flow as a hard requirement, scope the assessment list shown on the project dashboard, provide participants a cross-project pending queue (filterable by project), and migrate every assessment URL to the project-first shape `/projects/[pid]/assessments/[aid]/...`. The legacy `/assessments/[aid]` shape is removed (returns 404) — pre-prod, no live URLs depend on it (requirements §OQ 5).

Out of scope: settings page (E11.3), context resolver wiring (E11.3), NavBar / breadcrumbs / root redirect (E11.4).

### Behavioural flows

#### A.1 Create FCS assessment (Story 2.1)

```mermaid
sequenceDiagram
  participant U as Admin (browser)
  participant P as /projects/[pid]/assessments/new
  participant API as POST /api/projects/[pid]/assessments
  participant G as Repo-Admin gate
  participant DB as Supabase
  participant E as Rubric pipeline
  U->>P: submit form {repository_id, feature_*, prs?, issues?, participants[]}
  P->>API: POST {repository_id, ...} (pid in path)
  API->>DB: select project where id=pid -> {org_id}
  alt project not found / different org
    DB-->>API: empty
    API-->>P: 404
  end
  API->>G: assertOrgAdminOrRepoAdmin(ctx, project.org_id)
  G->>DB: select github_role, admin_repo_github_ids from user_organisations
  DB-->>G: snapshot
  G-->>API: ok / 403
  alt caller is Repo Admin (not Org Admin)
    API->>DB: select github_repo_id from repositories where id=repository_id
    DB-->>API: github_repo_id
    API->>API: assert github_repo_id ∈ snapshot.adminRepoGithubIds (else 403 repo_admin_required)
  end
  API->>DB: rpc create_fcs_assessment(... p_project_id=pid ...)
  DB-->>API: assessment_id
  API->>E: triggerRubricGeneration (existing pipeline, unchanged)
  API-->>P: 201 {assessment_id, status: 'rubric_generation', participant_count}
  P->>P: poll status; on awaiting_responses redirect to /projects/[pid]/assessments/[aid]
```

#### A.2 Project-scoped list on dashboard (Story 2.2)

```mermaid
sequenceDiagram
  participant U as Admin
  participant P as /projects/[pid] page
  participant DB as Supabase (RLS)
  U->>P: GET /projects/[pid]
  P->>DB: select assessments where project_id=$1 and type='fcs' order by created_at desc
  DB-->>P: rows (RLS scopes by org)
  P-->>U: render project header + AssessmentList
```

#### A.3 My Pending Assessments + filter (Stories 2.3, 2.3a)

```mermaid
sequenceDiagram
  participant U as Participant
  participant P as /assessments page
  participant DB as Supabase
  U->>P: GET /assessments
  P->>DB: select assessments JOIN participants JOIN projects<br/>where participants.user_id=$me AND participants.status='pending' AND assessments.type='fcs'
  DB-->>P: rows {assessment, project_name, project_id}
  P->>P: derive distinct projects for filter
  alt distinct.count > 1
    P-->>U: render list + project filter (default 'All projects')
  else
    P-->>U: render list, filter hidden
  end
  U->>P: select project X
  P->>P: re-render filtered to project_id = X (client-side; same dataset)
```

#### A.4 Project-scoped assessment URL resolution (Stories 2.4, 4.5)

```mermaid
sequenceDiagram
  participant B as Browser
  participant R as /projects/[pid]/assessments/[aid]/page.tsx
  participant DB as Supabase
  B->>R: GET path (auth handled by layout)
  R->>DB: select assessments where id=aid -> {project_id}
  alt row missing OR project_id !== pid
    R-->>B: notFound() → 404
  end
  R-->>B: render existing detail view
  Note right of B: legacy /assessments/[aid] dir deleted → Next.js returns 404
```

### Structural overview

```mermaid
classDiagram
  class FcsCreateApi {
    POST /api/projects/[pid]/assessments
  }
  class FcsCreateService {
    createFcsForProject(ctx, pid, body)
    enforcePerRepoAdmin(ctx, snapshot, repoId)
  }
  class RubricPipeline {
    triggerRubricGeneration(...)
    retriggerRubricForAssessment(...)
  }
  class ProjectAssessmentPages {
    /projects/[pid]/assessments/new
    /projects/[pid]/assessments/[aid]
    /projects/[pid]/assessments/[aid]/results
    /projects/[pid]/assessments/[aid]/submitted
  }
  class PendingQueuePage {
    /assessments (FCS-only, cross-project)
    ProjectFilter (client)
  }
  class ProjectDashboardList {
    /projects/[id] AssessmentList section
  }
  class RepoAdminGate {
    assertOrgAdminOrRepoAdmin(ctx, orgId)
    readSnapshot(ctx, orgId)
  }
  FcsCreateApi --> FcsCreateService
  FcsCreateService --> RepoAdminGate
  FcsCreateService --> RubricPipeline
  ProjectAssessmentPages --> Database
  PendingQueuePage --> Database
  ProjectDashboardList --> Database
```

### Invariants

| # | Invariant | Verified by |
|---|-----------|-------------|
| I1 | Every FCS assessment row has a non-null `project_id` | DB CHECK `(type <> 'fcs' OR project_id IS NOT NULL)` (T2.1) |
| I2 | PRCC rows may have `project_id` NULL (foundation FK only) | Same CHECK gates only `type = 'fcs'` |
| I3 | A Repo Admin cannot create an FCS assessment for a repo outside their admin-repo snapshot | Service-level check in T2.2 (`enforcePerRepoAdmin`) |
| I4 | A request to `/projects/[pid]/assessments/[aid]` where `aid.project_id !== pid` returns 404 | Page-level guard (T2.3) — single SELECT, `notFound()` on mismatch |
| I5 | The legacy URL shape `/assessments/[aid]` returns 404 | Directory removal (T2.3) — Next.js routing gives 404 |
| I6 | The pending queue at `/assessments` shows only FCS rows | Query predicate `assessments.type = 'fcs'` (T2.6) |
| I7 | The project filter on `/assessments` lists only projects represented in the user's pending queue | Filter populated from query result, not from `GET /api/projects` (T2.6) |
| I8 | Project-scoped list filters strictly by `project_id` (no cross-project leak) | `.eq('project_id', pid)` predicate + integration test (T2.5) |
| I9 | Legacy `POST /api/fcs` route is removed | `src/app/api/fcs/` directory deleted (T2.2); shared rubric helpers relocated |

### Acceptance criteria

Maps to v11-requirements §Epic 2 ACs:

- **Story 2.1** — POST creates a row with `project_id = pid`; per-repo admin check enforced; missing `project_id` (path) ⇒ 404; Org Member ⇒ 403; tampered repo for Repo Admin ⇒ 403.
- **Story 2.2** — Dashboard list filters by `project_id` and `type = 'fcs'`; reuses existing list shape; empty state CTA.
- **Story 2.3** — `/assessments` shows pending FCS items across projects, each labelled with project name; submitted items disappear on reload; PRCC excluded.
- **Story 2.3a** — Filter offers "All projects" + distinct projects from queue; hidden when only one.
- **Story 2.4** — Project-first URLs resolve; mismatch ⇒ 404; results & submitted pages also migrated.
- **Story 4.5** — Legacy `/assessments/[aid]` ⇒ 404 (directory deleted); auth round-trip preserves the original URL.

### BDD specs (epic-level summary)

Per-task BDD blocks live on each task issue. Aggregated here for review:

```
describe('POST /api/projects/[pid]/assessments')
  it('Org Admin creates an FCS assessment in their org’s project; row has project_id=pid')
  it('Repo Admin creates an assessment for a repo in their admin-repo snapshot')
  it('Repo Admin submitting a repo NOT in their snapshot returns 403 repo_admin_required')
  it('Org Member returns 403; no assessment created')
  it('Unknown project pid returns 404')
  it('Project belongs to a different org than caller’s selected org returns 404')
  it('Missing repository_id returns 400')
  it('Missing both merged_pr_numbers and issue_numbers returns 422')

describe('Schema — assessments.project_id')
  it('FCS row with project_id=NULL is rejected by CHECK')
  it('PRCC row with project_id=NULL is accepted')
  it('ON DELETE SET NULL nullifies project_id when project deleted')

describe('Project-scoped assessment URLs')
  it('GET /projects/<pid>/assessments/<aid> renders detail when assessment belongs to project')
  it('Returns 404 when assessment.project_id !== pid')
  it('GET /assessments/<aid> (legacy) returns 404')

describe('Project dashboard — assessment list')
  it('Lists exactly the FCS assessments whose project_id = pid')
  it('Excludes assessments from sibling projects and PRCC rows')

describe('/assessments — My Pending Assessments')
  it('Lists pending FCS assessments where participant.user_id = current user')
  it('Each item labelled with project name; links to /projects/[pid]/assessments/[aid]')
  it('Filter offers All projects + distinct projects from queue, hidden when ≤ 1')
  it('Excludes PRCC and already-submitted rows')

describe('/projects/[pid]/assessments/new')
  it('Org Admin sees all org repos; Repo Admin sees only admin-snapshot repos')
  it('Submitting posts to /api/projects/[pid]/assessments and routes to detail on success')
```

---

## Part B — Agent-implementable

<a id="lld-v11-e11-2-layer-map"></a>

### B.0 Layer map

| Layer | Files |
|-------|-------|
| **DB** | `supabase/schemas/tables.sql`, generated migration; `src/lib/supabase/types.ts` (manual patch — see #394) |
| **BE — engine** | `src/lib/engine/fcs-pipeline.ts` (new — extracted from `/api/fcs/service.ts`: `triggerRubricGeneration`, `retriggerRubricForAssessment`, `extractArtefacts`, `finaliseRubric`, `markRubricFailed`, `updateProgress`, `RubricGenerationError`, `MAX_RUBRIC_RETRIES`) |
| **BE — API** | `src/app/api/projects/[pid]/assessments/route.ts`, `service.ts`, `validation.ts` (new); `src/app/api/fcs/` (deleted); `src/app/api/assessments/[id]/retry-rubric/...` (import update only) |
| **FE — pages** | `src/app/(authenticated)/projects/[pid]/assessments/new/{page,create-assessment-form}.tsx` (move + adapt); `src/app/(authenticated)/projects/[pid]/assessments/[aid]/{page,results/page,submitted/page}.tsx` (move from legacy); `src/app/(authenticated)/projects/[id]/page.tsx` (lift placeholder slot to real list); `src/app/(authenticated)/projects/[id]/assessment-list.tsx` (new); `src/app/(authenticated)/assessments/page.tsx` (rewrite); `src/app/(authenticated)/assessments/project-filter.tsx` (new) |
| **FE — deletions** | `src/app/(authenticated)/assessments/[id]/...` directory; `src/app/(authenticated)/assessments/new/` directory |
| **Types** | inline contracts on the new API route file (ADR-0014); shared response shape `CreateFcsResponse` re-exported from the new service |
| **Tests** | `tests/app/api/projects/[pid]/assessments/{create,gate}.test.ts`; `tests/app/(authenticated)/projects/[pid]/assessments/...` page tests; `tests/app/(authenticated)/assessments/page.test.tsx` (rewrite); schema integration test |

<a id="lld-v11-e11-2-schema"></a>

### B.1 — Task T2.1: Schema

**Files:**
- `supabase/schemas/tables.sql` — add column + CHECK + index on `assessments`.
- `supabase/migrations/<timestamp>_v11_e11_2_assessments_project.sql` — generated.
- `src/lib/supabase/types.ts` — manual patch (per #394 note in E11.1 LLD).
- `tests/integration/v11-e11-2-assessments-project.integration.test.ts`.

**Schema additions:**

```sql
ALTER TABLE assessments
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

ALTER TABLE assessments
  ADD CONSTRAINT assessments_fcs_requires_project
  CHECK (type <> 'fcs' OR project_id IS NOT NULL);

CREATE INDEX idx_assessments_project ON assessments (project_id);
```

> **Why `ON DELETE SET NULL` instead of `CASCADE`?** Story 1.5 (E11.1) already prevents deleting a project that has assessments — the empty-only DELETE returns 409. So in normal operation, the FK never sees a project deletion while child rows exist. `SET NULL` is the safer fallback if a future admin-tool path bypasses the empty check: assessment data is preserved for audit, just orphaned from a project that no longer exists.

**Tasks:**
1. Edit `tables.sql`.
2. `npx supabase db diff -f v11_e11_2_assessments_project` → review.
3. `npx supabase db reset` → verify diff empty.
4. Manually patch `src/lib/supabase/types.ts` (`assessments` Row/Insert/Update: `project_id: string | null`).
5. Integration tests covering I1, I2, plus the SET NULL behaviour.

**Acceptance:** see issue #410.

<a id="lld-v11-e11-2-fcs-create-api"></a>

### B.2 — Task T2.2: FCS create API + per-repo gate

**Files:**
- `src/app/api/projects/[pid]/assessments/route.ts` (controller — handler ≤ 25 lines)
- `src/app/api/projects/[pid]/assessments/service.ts` (service)
- `src/app/api/projects/[pid]/assessments/validation.ts` (Zod)
- `src/lib/engine/fcs-pipeline.ts` (new — extracted from old `/api/fcs/service.ts`)
- Delete: `src/app/api/fcs/route.ts`, `src/app/api/fcs/service.ts`
- Update import sites (retry-rubric route is the main one; grep for `from '@/app/api/fcs/`).

**Controller:**

```ts
import type { NextRequest } from 'next/server';
import { createApiContext } from '@/lib/api/context';
import { handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { validateBody } from '@/lib/api/validation';
import { CreateFcsBodySchema, createFcsForProject } from './service';
export type { CreateFcsResponse } from '@/lib/engine/fcs-pipeline';

interface RouteContext { params: Promise<{ pid: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const ctx = await createApiContext(request);
    const { pid } = await params;
    const body = await validateBody(request, CreateFcsBodySchema);
    return json(await createFcsForProject(ctx, pid, body), 201);
  } catch (e) { return handleApiError(e); }
}
```

**Service contract:**

```ts
import type { ApiContext } from '@/lib/api/context';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin, readSnapshot } from '@/lib/api/repo-admin-gate';
import { triggerRubricGeneration, type CreateFcsResponse } from '@/lib/engine/fcs-pipeline';

// Body no longer carries org_id or project_id — pid comes from the path,
// org_id is resolved server-side from the project row.
export const CreateFcsBodySchema = z.object({
  repository_id: z.uuid(),
  feature_name: z.string().min(1),
  feature_description: z.string().optional(),
  merged_pr_numbers: z.array(z.number().int().positive()).optional(),
  issue_numbers: z.array(z.number().int().positive()).optional(),
  participants: z.array(z.object({ github_username: z.string().min(1) })).min(1),
  comprehension_depth: z.enum(['conceptual', 'detailed']).default('conceptual'),
}).refine(
  (b) => (b.merged_pr_numbers?.length ?? 0) > 0 || (b.issue_numbers?.length ?? 0) > 0,
  { message: 'At least one of merged_pr_numbers or issue_numbers is required' },
);
export type CreateFcsBody = z.infer<typeof CreateFcsBodySchema>;

export async function createFcsForProject(
  ctx: ApiContext,
  projectId: string,
  body: CreateFcsBody,
): Promise<CreateFcsResponse>;
// 1. resolveProjectOrg(ctx, projectId) → { orgId } | 404
// 2. assertOrgAdminOrRepoAdmin(ctx, orgId)  // 401/403
// 3. enforcePerRepoAdmin(ctx, orgId, body.repository_id)  // see helper below
// 4. fetchRepoInfo(ctx.adminSupabase, body.repository_id, orgId)
// 5. resolveParticipants + validateMergedPRs + validateIssues (existing helpers, moved)
// 6. createAssessmentWithParticipants — pass p_project_id = projectId to RPC*
// 7. triggerRubricGeneration (fire-and-forget, existing pipeline)
// 8. return { assessment_id, status: 'rubric_generation', participant_count }

// Private helper (≤ 20 lines).
async function resolveProjectOrg(ctx: ApiContext, projectId: string): Promise<{ orgId: string }>;
// select org_id from projects where id=$1; 404 on missing.
// Defence in depth: if ctx.orgId is set and differs from project.org_id, also 404 — pid lookups
// outside the caller's selected org should not leak existence.

// Private helper (≤ 20 lines).
async function enforcePerRepoAdmin(
  ctx: ApiContext,
  orgId: string,
  repositoryId: string,
): Promise<void>;
// 1. snapshot = readSnapshot(ctx, orgId)
// 2. if snapshot.githubRole === 'admin' return  // org admin bypass
// 3. select github_repo_id from repositories where id=$1 and org_id=$2 → null ⇒ 422 'repo_not_in_org'
// 4. if !snapshot.adminRepoGithubIds.includes(repoGithubId) ⇒ ApiError(403, 'repo_admin_required')
```

> **RPC change.** The existing `create_fcs_assessment` Postgres function takes `p_org_id`, `p_repository_id`, etc. Add a new positional argument `p_project_id uuid` and INSERT it into the row. Update `supabase/schemas/functions.sql`. Migration regenerates. The branded type `AssessmentId` and helpers stay; only the call site adds `p_project_id`.

**Pipeline relocation.** Move from `src/app/api/fcs/service.ts` into `src/lib/engine/fcs-pipeline.ts` (no behavioural change, just relocation):

- `triggerRubricGeneration`, `retriggerRubricForAssessment`
- `extractArtefacts`, `finaliseRubric`, `runGeneration`, `failGeneration`, `markRubricFailed`
- `updateProgress`
- `RubricGenerationError`, `MAX_RUBRIC_RETRIES`, `RubricFailureDetails`, related interfaces and helpers
- `validateMergedPRs`, `validateIssues`, `resolveParticipants`, `fetchRepoInfo`, `toRepoInfo`, `validateRepo`, `validateCfg`, `createAssessmentWithParticipants`
- Re-export `CreateFcsResponse` type

The new `service.ts` imports from `@/lib/engine/fcs-pipeline`. The existing `assertOrgAdmin` helper in the old service is replaced by `assertOrgAdminOrRepoAdmin` from the gate (broader role allowance per requirements).

**Tasks:**
1. Add `p_project_id` to the RPC; update migration.
2. Relocate the pipeline module.
3. Implement the new controller, service, and Zod schema.
4. Delete the legacy `/api/fcs/` directory; fix all import sites.
5. Tests: 9 BDD specs (see issue #411).

**Acceptance:** see issue #411.

<a id="lld-v11-e11-2-route-migration"></a>

### B.3 — Task T2.3: Route migration + 404 on mismatch

**Files (move):**
- `src/app/(authenticated)/assessments/[id]/page.tsx` → `…/projects/[pid]/assessments/[aid]/page.tsx`
- `src/app/(authenticated)/assessments/[id]/results/page.tsx` → `…/[aid]/results/page.tsx`
- `src/app/(authenticated)/assessments/[id]/submitted/page.tsx` → `…/[aid]/submitted/page.tsx`
- Co-located client components used only by these pages move with them.

**Files (delete):**
- `src/app/(authenticated)/assessments/[id]/` (entire subtree)
- `src/app/(authenticated)/assessments/new/` (entire subtree — replaced by T2.4)

**Page-level guard pattern (applies to all three migrated pages):**

```ts
// src/app/(authenticated)/projects/[pid]/assessments/[aid]/page.tsx
export default async function Page({ params }: { params: Promise<{ pid: string; aid: string }> }) {
  const { pid, aid } = await params;
  const supabase = await createServerSupabaseClient();
  // RLS scopes by org; we additionally scope by project to fail closed on mismatch.
  const { data: row } = await supabase
    .from('assessments')
    .select('id, project_id')
    .eq('id', aid)
    .maybeSingle();
  if (!row || row.project_id !== pid) notFound();
  return <ExistingAssessmentDetail assessmentId={aid} />;
}
```

> The body of the existing detail/results/submitted pages is unchanged structurally — they re-fetch via the API or via direct service calls as before. The only addition is the guard above. Internal `Link href` / `router.push` callers (e.g. links from results back to detail) are updated to the new shape.

**API consideration.** `GET /api/assessments/[id]` is **not** changed in this task. The pid/aid mismatch check happens at the page layer (server-rendered) before the API is called. Rationale: minimises API surface change; the API already enforces RLS on org. If a future caller hits the API directly, it still returns the row — but they would need to know `aid` already, and there is no information leak (the org RLS still gates access).

**Grep gate.** PR description must include the output of `grep -rE "/(?:assessments/\[id\]|assessments/[a-z0-9-]{36})" src/` and confirm no remaining matches outside the new project-first paths.

**Tasks:**
1. Copy files to new locations; add the guard.
2. Update internal `Link`/`router.push` callers to new shape.
3. Delete the legacy subtree.
4. Update tests to new paths; add the mismatch test.

**Acceptance:** see issue #412.

<a id="lld-v11-e11-2-new-assessment-page"></a>

### B.4 — Task T2.4: New-assessment page + repo-admin filter

**Files:**
- `src/app/(authenticated)/projects/[pid]/assessments/new/page.tsx` (server)
- `src/app/(authenticated)/projects/[pid]/assessments/new/create-assessment-form.tsx` (client)

**Page (server) sketch:**

```ts
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readSnapshot } from '@/lib/api/repo-admin-gate'; // reused via a server-friendly wrapper

export default async function NewAssessmentPage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from('projects').select('id, org_id, name').eq('id', pid).maybeSingle();
  if (!project) notFound();

  const { user } = (await supabase.auth.getUser()).data;
  if (!user) redirect('/auth/sign-in');

  const { data: snapshot } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('user_id', user.id).eq('org_id', project.org_id).maybeSingle();
  if (!snapshot) redirect('/assessments');
  const isOrgAdmin = snapshot.github_role === 'admin';
  const adminRepoIds = (snapshot.admin_repo_github_ids ?? []) as number[];
  if (!isOrgAdmin && adminRepoIds.length === 0) redirect('/assessments');

  // Fetch repos; filter to admin set for Repo Admins.
  let q = supabase.from('repositories')
    .select('id, github_repo_name, github_repo_id')
    .eq('org_id', project.org_id).order('github_repo_name');
  if (!isOrgAdmin) q = q.in('github_repo_id', adminRepoIds);
  const { data: repos } = await q;

  return <CreateAssessmentForm projectId={pid} repositories={(repos ?? [])} />;
}
```

**Form (client) changes vs. existing form:**
- New prop: `projectId: string`. `org_id` is no longer needed — server already resolved it via project.
- POST URL becomes `/api/projects/${projectId}/assessments`; body drops `org_id`.
- Success redirect target becomes `/projects/${projectId}/assessments/${assessment_id}` (instead of `/assessments/${assessment_id}`).

**Tasks:**
1. Move and adapt the form.
2. Implement the page guard (Org Member redirect; unknown pid 404).
3. Server-side filter for Repo Admin's repo list.
4. Tests: 6 specs from issue #413.

**Acceptance:** see issue #413.

<a id="lld-v11-e11-2-project-scoped-list"></a>

### B.5 — Task T2.5: Project-scoped list on dashboard

**Files:**
- `src/app/(authenticated)/projects/[id]/page.tsx` — replace placeholder slot.
- `src/app/(authenticated)/projects/[id]/assessment-list.tsx` (new — server component or RSC-friendly).

**List query:**

```ts
const { data: rows } = await supabase
  .from('assessments')
  .select('id, type, status, feature_name, feature_description, aggregate_score, created_at, rubric_error_code, rubric_retry_count')
  .eq('project_id', projectId)
  .eq('type', 'fcs')
  .order('created_at', { ascending: false });
```

**Item linkage:**
- Pending or in-progress rows link to `/projects/[id]/assessments/[aid]`.
- Completed rows link to `/projects/[id]/assessments/[aid]/results`.

**Empty state:** "Create the first assessment" CTA pointing at `/projects/[id]/assessments/new`.

**Tasks:**
1. Lift the placeholder slot in dashboard page; render `AssessmentList` with rows.
2. Reuse the existing list visual shape from `(authenticated)/assessments/page.tsx` (extract a shared `AssessmentRow` if it does not already exist; otherwise inline matching markup — minimise duplication).
3. Tests: 5 specs from issue #414.

**Acceptance:** see issue #414.

<a id="lld-v11-e11-2-pending-queue"></a>

### B.6 — Task T2.6: Pending queue rewrite + project filter

**Files:**
- `src/app/(authenticated)/assessments/page.tsx` — rewrite.
- `src/app/(authenticated)/assessments/project-filter.tsx` (new — client).

**Query (replaces the existing one):**

```ts
const { data } = await supabase
  .from('assessment_participants')
  .select(`
    status,
    assessments!inner(
      id, type, status, feature_name, feature_description, created_at,
      rubric_error_code, rubric_retry_count, rubric_error_retryable,
      project_id,
      projects!inner(id, name)
    )
  `)
  .eq('user_id', user.id)
  .eq('status', 'pending')
  .eq('assessments.type', 'fcs')
  .order('created_at', { foreignTable: 'assessments', ascending: false });
```

**Distinct projects for filter:** derive client-side from the same query result — `Array.from(new Map(rows.map(r => [r.assessments.project_id, r.assessments.projects.name])).entries())`. If `distinct.length <= 1`, do not render the filter.

**Filter component (`project-filter.tsx`):** single-select with "All projects" as the default; `onChange` filters the current list (client-side) by `project_id`. No server round-trip — the dataset is already loaded.

**Item link:** `/projects/${row.assessments.project_id}/assessments/${row.assessments.id}` — uses the new URL shape from T2.3.

**Removed in this rewrite:**
- The "Completed" tab — V11 navigation model says My Pending Assessments only. Completed FCS assessments are reachable from the project dashboard (T2.5).
- The org-wide query that previously listed all `assessments` for the org.

**Tasks:**
1. Rewrite `page.tsx` with the new query.
2. Add `ProjectFilter` client component; wire client-side filtering.
3. Update tests; remove now-irrelevant Completed-tab tests.

**Acceptance:** see issue #415.

<a id="lld-v11-e11-2-cross-cutting"></a>

### B.7 Cross-cutting

- **Internal decomposition rule (CLAUDE.md):** every new route handler ≤ 25 lines; every service function ≤ 20 lines (decompose with private helpers — see T2.2 for the pattern).
- **Controller never calls `createClient()` directly** — `ApiContext` is the only infrastructure entrypoint per E11.1 convention.
- **British English** throughout.
- **MSW for HTTP mocks** — both the GitHub touchpoints inherited from the rubric pipeline and any new fetch calls.
- **No silent catch.**
- **PRCC unaffected.** The PRCC creation path (webhook-driven) does not pass through `/api/projects/[pid]/assessments`. Its `project_id` remains nullable. The CHECK constraint scopes only `type = 'fcs'`.

<a id="lld-v11-e11-2-out-of-scope"></a>

### B.8 Out-of-scope reminders

- Settings page `/projects/[id]/settings` — **E11.3**.
- Project context resolver wiring into rubric generation — **E11.3** (this epic uses the existing org-context path; E11.3 swaps it for project context).
- NavBar role-conditional item, breadcrumbs, root redirect, last-visited — **E11.4** (Story 4.3 breadcrumbs depend on T2.3 routes existing first — see plan §Coupling notes).
- Repo→project UI mapping — **out of V11**.
