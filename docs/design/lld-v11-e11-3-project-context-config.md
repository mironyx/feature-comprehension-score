# LLD — V11 Epic E11.3: Project Context & Config

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.3 |
| Status | Revised |
| Author | LS / Claude |
| Created | 2026-05-01 |
| Revised | 2026-05-01 — issue #422 (T3.2 implemented) |
| Revised | 2026-05-01 — issue #421 (T3.1 implementation feedback) |
| Epic | E11.3 |
| Parent HLD | [v11-design.md §C4, §3.V11.2](v11-design.md#c4-assessment-engine--context-resolution-narrowed) |
| Implementation plan | [docs/plans/2026-04-30-v11-implementation-plan.md](../plans/2026-04-30-v11-implementation-plan.md) |
| Requirements | [v11-requirements.md §Epic 3](../requirements/v11-requirements.md#epic-3-project-context--config-priority-high) |
| Related ADRs | [0013](../adr/0013-context-file-resolution-strategy.md) (amended — no FCS fallback), [0027](../adr/0027-project-as-sub-tenant-within-org.md) (project as sub-tenant), [0028](../adr/0028-project-context-reuses-organisation-contexts.md) (reuse `organisation_contexts`) |

## Open questions

These are flagged here rather than silently decided in the body — confirm direction before `/feature` runs.

1. ~~**Glob validator library.**~~ **Resolved 2026-05-01.** `picomatch.makeRe` resolves at the top level (verified via `require('picomatch').makeRe`). Use `picomatch` directly; install as a direct dependency.
2. **Question count default when no project context row exists.** Story 3.1 says "system default question count". Draft: read from `org_config.fcs_question_count` (existing repo/org config column) at resolver time and fall back to `4` if absent — keeps the project-context resolver self-contained while honouring the existing org-config baseline. Alternative: hard-code `4` in the resolver. Decision affects whether the resolver depends on `org_config`.

---

## Part A — Human-reviewable

### Purpose

Move FCS rubric context from the org level to the project level, in two slices:

1. **Settings UI + validation (Story 3.1).** A single settings page at `/projects/[id]/settings` lets admins edit glob patterns, domain notes, and question count. Submits to the existing `PATCH /api/projects/[id]` endpoint (extended in E11.1 to accept these fields). Adds glob-parseability validation to that endpoint.
2. **Engine wiring (Story 3.2).** A new project-context resolver replaces `loadOrgPromptContext` on the FCS rubric path. Project context is the sole source for FCS — no org fallback. Question count comes from project context. If no project context row exists, the prompt is built without an injected context block.

Out of scope: project metadata edit on the dashboard (E11.1, already shipped); PRCC context — not changing in V11; cross-project context reuse.

### Behavioural flows

#### A.1 Edit project context & settings (Story 3.1)

```mermaid
sequenceDiagram
  participant U as Admin (browser)
  participant P as /projects/[id]/settings (page)
  participant API as PATCH /api/projects/[id]
  participant V as Zod (UpdateProjectSchema)
  participant DB as Supabase
  U->>P: GET /projects/[id]/settings
  P->>DB: load project + organisation_contexts row keyed by (org_id, project_id)
  DB-->>P: {project, context?}
  alt Org Member
    P-->>U: 302 /assessments
  end
  P-->>U: render form prefilled with stored values (or defaults)
  U->>P: submit {glob_patterns, domain_notes, question_count}
  P->>API: PATCH /api/projects/[id] {context fields only}
  API->>V: parse body
  alt question_count outside 3..8
    V-->>API: 400 (range error)
  else glob pattern unparseable
    V-->>API: 400 {field: 'glob_patterns', index, message}
  else valid
    API->>DB: rpc patch_project (context_fields populated, project_fields null)
    DB-->>API: project row
    API-->>P: 200
    P-->>U: render success state
  end
```

#### A.2 FCS rubric uses project context (Story 3.2)

```mermaid
sequenceDiagram
  participant API as POST /api/projects/[id]/assessments
  participant E as fcs-pipeline.extractArtefacts
  participant R as project-prompt-context.loadProjectPromptContext
  participant DB as Supabase
  participant L as LLM
  API->>E: extractArtefacts({projectId, repoInfo, ...})
  E->>R: loadProjectPromptContext(adminSupabase, projectId)
  R->>DB: select context from organisation_contexts where project_id = $1
  alt row exists
    DB-->>R: {context jsonb}
    R-->>E: ProjectPromptContext {globs, domain_notes, question_count, ...}
  else no row
    DB-->>R: null
    R-->>E: undefined
  end
  E->>E: questionCount = projectCtx?.question_count ?? orgConfig.fcs_question_count
  E->>E: assemble prompt (organisation_context block omitted if undefined)
  E->>L: prompt
  Note right of E: loadOrgPromptContext is NOT called for FCS.<br/>Org context tables remain inert for FCS in V11.
```

#### A.3 Resolver — empty result vs. existing row

```mermaid
sequenceDiagram
  participant E as Engine
  participant R as Resolver
  participant DB as Supabase
  E->>R: loadProjectPromptContext(supabase, projectId)
  R->>DB: select context from organisation_contexts<br/>where project_id = $1
  alt row exists, schema valid
    DB-->>R: { context: {...} }
    R-->>E: ProjectPromptContext (parsed)
  else row exists, schema invalid
    DB-->>R: { context: {...} }
    R->>R: log.warn (do not throw — preserves rubric generation)
    R-->>E: undefined
  else no row
    DB-->>R: null
    R-->>E: undefined
  end
  Note over R,DB: Org-level rows (project_id IS NULL) are NOT consulted.
```

### Structural overview

```mermaid
flowchart LR
  SettingsPage["SettingsPage<br/>(server)<br/>/projects/[id]/settings"]
  SettingsForm["SettingsForm<br/>(client component)"]
  PatchApi["PATCH /api/projects/[id]<br/>(existing — extended)"]
  Schema["UpdateProjectSchema<br/>(Zod + glob superRefine)"]
  Resolver["loadProjectPromptContext<br/>(supabase, projectId)"]
  Context["OrganisationContext<br/>(extended: glob_patterns, question_count)"]
  Pipeline["fcs-pipeline.extractArtefacts<br/>(modified)"]
  Formatter["formatOrganisationContext<br/>(unchanged)"]

  SettingsPage --> SettingsForm
  SettingsForm --> PatchApi
  PatchApi --> Schema
  Pipeline --> Resolver
  Resolver --> Context
  Pipeline --> Formatter
```

### Invariants

| # | Invariant | Verified by |
|---|-----------|-------------|
| I1 | `PATCH /api/projects/[id]` rejects payloads where any glob pattern fails to compile | Zod `.refine()` in `UpdateProjectSchema` (T3.1) + unit test |
| I2 | `PATCH /api/projects/[id]` rejects `question_count` outside 3..8 | `z.number().int().min(3).max(8)` (raised from 3..5 in V11 — see B.0 DB note) — covered by T3.1 BDD spec |
| I3 | Settings page redirects non-admins (Org Members) to `/assessments` (My Assessments) when reached via direct URL. Settings is admin-only, and Org Members have no UI affordance to reach it from the project page; landing them back on `/projects/[id]` would be a no-op redirect loop, so they are sent to the page they have access to. | Server-side `getOrgRole` check (T3.1) |
| I4 | Settings page returns 404 for unknown / cross-org `projectId` | Server-side `select * from projects where id=$1` returns null ⇒ `notFound()` (T3.1) |
| I5 | FCS rubric generation reads project context only — `loadOrgPromptContext` is never called from the FCS path | Grep `loadOrgPromptContext` in `src/lib/api/fcs-pipeline.ts` returns no matches (T3.2) + unit test asserting the call is `loadProjectPromptContext` |
| I6 | A project with no project-scoped row in `organisation_contexts` (i.e. no row with `project_id = $1` — the table is shared with the org-level UI per ADR-0028, hence the legacy name) produces a rubric prompt with no `organisation_context` block | Resolver returns `undefined`; `extractArtefacts` passes `organisation_context: undefined` to the assembled set; `formatOrganisationContext` already omits the block when undefined (T3.2) |
| I7 | The question count used by rubric generation equals the project's configured value when set | Integration test asserting `assessment.config_question_count === projectCtx.question_count` after creation (T3.2) |
| I8 | The project resolver does not consult the org-level row (`project_id IS NULL`) | SQL predicate is `.eq('project_id', $1)` — not `.or()`; covered by unit test that creates an org-level row + a project row and asserts the resolver returns only the project row |
| I9 | The project dashboard (`/projects/[id]/page.tsx`) renders a 'Settings' link to `/projects/[id]/settings` visible to Org Admin and Repo Admin. This entry-point was omitted by the initial E11.3 implementation; added by fix issue #440. Without it, `/projects/[id]/settings` is only reachable by direct URL — effectively inaccessible. | Dashboard page test (added in fix #440) |

### Acceptance criteria

Maps to v11-requirements §Epic 3 ACs:

- **Story 3.1** — Save persists glob_patterns / domain_notes / question_count to `organisation_contexts` keyed by `project_id`; empty form when no row exists; out-of-range question_count returns 400; unparseable glob returns 400 identifying the pattern; Repo Admin can save; Org Member reaching `/projects/[id]/settings` via direct URL is redirected to `/assessments`.
- **Story 3.2** — FCS prompt for an assessment in project P contains content matched by P's globs and P's domain_notes verbatim; assessment has exactly `project.question_count` questions; project with no project-scoped row in `organisation_contexts` yields a prompt with no context block and the org-level row (`project_id IS NULL`) is not queried; the resolved context shape used at generation time matches the project's config at creation time.

### BDD specs (epic-level summary)

```
describe('PATCH /api/projects/[id] — context-fields validation (T3.1)')
  it('accepts a payload with valid glob patterns, domain_notes and question_count')
  it('rejects question_count = 2 with 400 and a range error')
  it('accepts question_count = 8 (new V11 upper bound)')
  it('rejects question_count = 9 with 400 and a range error')
  it('rejects an unparseable glob pattern with 400 identifying the offending index')
  it('accepts a payload that omits all context fields (existing project-fields-only path unchanged)')

describe('/projects/[id]/settings (T3.1)')
  it('Org Admin sees the form prefilled from the existing organisation_contexts row')
  it('Project with no context row renders empty inputs and the system-default question count')
  it('Repo Admin successfully saves changes')
  it('Org Member is redirected to /assessments')
  it('Unknown projectId returns 404')

describe('/projects/[id] dashboard — Settings affordance (fix #440)')
  it('Admin dashboard renders a Settings link pointing to /projects/[id]/settings')
  it('Repo Admin dashboard also renders the Settings link')

describe('loadProjectPromptContext (T3.2)')
  it('returns parsed ProjectPromptContext when a row exists for the project')
  it('returns undefined when no row exists for the project')
  it('returns undefined when the row exists but the context fails schema parse (logs warn)')
  it('does NOT return the org-level row (project_id IS NULL) when both org and project rows exist')

describe('FCS rubric — project-context wiring (T3.2)')
  it('extractArtefacts calls loadProjectPromptContext, not loadOrgPromptContext, for the FCS path')
  it('the assembled prompt contains the project domain_notes verbatim')
  it('the assembled prompt contains files matched by the project glob_patterns')
  it('a project with no context row produces an assembled set with organisation_context = undefined')
  it('the question count submitted to the LLM equals the project context question_count when set')
```

---

## Part B — Agent-implementable

<a id="LLD-v11-e11-3-layer-map"></a>

### B.0 Layer map

| Layer | Files |
|-------|-------|
| **DB** | one declarative-schema change: relax `CHECK (… BETWEEN 3 AND 5)` to `BETWEEN 3 AND 8` on `org_config.fcs_question_count`, `org_config.prcc_question_count`, `repository_config.fcs_question_count`, `repository_config.prcc_question_count` ([tables.sql:31–34, 80–81](../../supabase/schemas/tables.sql)). `assessments.config_question_count` has no CHECK constraint (line 148) — no change needed. `organisation_contexts.project_id` and `patch_project` RPC already exist ([tables.sql:353](../../supabase/schemas/tables.sql), [functions.sql:408](../../supabase/schemas/functions.sql)). |
| **BE — engine/API** | `src/lib/engine/prompts/artefact-types.ts` (extend `OrganisationContextSchema`), `src/lib/supabase/project-prompt-context.ts` (new), `src/lib/api/fcs-pipeline.ts` (modify `extractArtefacts` and the public trigger/retry types; the file lives in `src/lib/api/`, not `src/lib/engine/`, because it depends on Supabase + GitHub adapters — see file header comment) |
| **BE — API** | `src/app/api/projects/validation.ts` (extend `UpdateProjectSchema` with glob `.refine()`) |
| **FE — pages** | `src/app/(authenticated)/projects/[id]/settings/page.tsx` (server, new), `src/app/(authenticated)/projects/[id]/settings/settings-form.tsx` (client, new) |
| **Tests** | `tests/app/api/projects/validation.test.ts` (new — schema unit), `tests/app/api/projects/update.test.ts` (existing — q_count bounds bumped 5 → 8), `tests/app/(authenticated)/projects/[id]/settings/page.test.ts` (new), `tests/evaluation/v11-e11-3-t3-1.eval.test.ts` (new — API ↔ form error-body shape regression pin), `tests/lib/supabase/project-prompt-context.test.ts` (new), `tests/lib/engine/fcs-pipeline-project-context.test.ts` (new — integration-style with stubbed Supabase) |

#### Reused helpers — DO NOT re-implement

These helpers already exist (E11.1 / E11.2). Inlining their logic is forbidden — `/feature` agents must import from the listed paths.

| Helper | Import path | Use it instead of |
|--------|-------------|-------------------|
| `createApiContext(request)` | `@/lib/api/context` | Calling `createClient()` in route handlers. |
| `ctx.supabase` / `ctx.adminSupabase` / `ctx.orgId` | `@/lib/api/context` | Re-deriving the selected org id or constructing clients in services. |
| `validateBody(request, schema)` | `@/lib/api/validation` | Hand-rolled `await request.json()` + Zod parse. |
| `handleApiError(e)` | `@/lib/api/errors` | Hand-rolled `try/catch` returning `Response.json`. |
| `json(payload, status?)` | `@/lib/api/response` | `new Response(JSON.stringify(...))`. |
| `assertOrgAdminOrRepoAdmin(ctx, orgId)` | `@/lib/api/repo-admin-gate` | Inlining `user_organisations` queries in API code. |
| `getOrgRole(supabase, userId, orgId)` | `@/lib/supabase/membership` | Inlining `user_organisations` queries in **server pages**. Returns `'admin' | 'repo_admin' | null`. |
| `getSelectedOrgId(cookies)` | `@/lib/supabase/org-context` | Reading the `fcs-org-id` cookie directly in server pages. |
| `loadOrgPromptContext(supabase, orgId)` | `@/lib/supabase/org-prompt-context` | Reuse the **shape** (one-row select + safeParse + warn) for the new project resolver — but do NOT call this for FCS in V11 (Invariant I5). |
| `OrganisationContextSchema` / `OrganisationContext` | `@/lib/engine/prompts` | Defining a parallel schema by hand. Either extend this schema with the V11 fields, or define `ProjectPromptContextSchema` as a strict superset and re-export. |
| `formatOrganisationContext` (in `prompt-builder.ts`) | `@/lib/engine/prompts` (internal) | Writing custom prompt-block formatting. The function already omits the block when `organisation_context` is undefined — leverage that, do not modify it. |
| `patch_project` RPC | `supabase/schemas/functions.sql` | Hand-rolled UPDATE+UPSERT pair. Already merges context jsonb via `||`. |
| `UpdateProjectSchema` | `@/app/api/projects/validation` | Defining a settings-only Zod schema. Extend the existing one with a `.refine()` — same partial-payload semantics. |

> **Constraint for `/feature`:** before adding any new query against `organisation_contexts` or any new Zod schema for project fields, grep `src/lib/supabase/`, `src/app/api/projects/`, and `src/lib/engine/prompts/` for an existing helper or schema. If one exists, reuse or extend.

<a id="LLD-v11-e11-3-settings-page"></a>

### B.1 — Task T3.1: Settings page + glob parseability

**Files:**
- `src/app/(authenticated)/projects/[id]/settings/page.tsx` (new — server component)
- `src/app/(authenticated)/projects/[id]/settings/settings-form.tsx` (new — client component)
- `src/app/(authenticated)/projects/[id]/page.tsx` — **add Settings link** in the page header or alongside the Delete button (admin/repo-admin only, Invariant I9). This was out of scope in E11.1 (B.8) and missed by E11.3; fix issue #440 owns it.
- `src/app/api/projects/validation.ts` (extend `UpdateProjectSchema` with glob `.refine()`)
- `tests/app/api/projects/validation.test.ts` (new — focused schema unit tests)
- `tests/app/(authenticated)/projects/[id]/settings/page.test.ts` (new)
- `tests/app/api/projects/update.test.ts` (existing — bumped question_count boundary tests 5 → 8)
- `tests/evaluation/v11-e11-3-t3-1.eval.test.ts` (new — regression pin for the API ↔ form error-body shape contract)

> **Implementation note (issue #421):** The original list named `tests/app/api/projects/[id]/validation.test.ts (extend)` but no such file existed. A focused unit test was created beside the schema at `tests/app/api/projects/validation.test.ts`; route-level integration coverage already lives in `update.test.ts`. The two existing question_count boundary tests in `update.test.ts` (`> 5` and `at boundary 5`) were updated to use 9 and 8 respectively to reflect the new V11 cap.

**Validation extension:**

```ts
// src/app/api/projects/validation.ts
import picomatch from 'picomatch';

// picomatch v4 is permissive by default — `makeRe('[')` returns a literal regex
// rather than throwing. `strictBrackets: true` makes it throw on unclosed
// brackets, which is the malformed-syntax class users most commonly hit.
function isParseableGlob(p: string): boolean {
  try { picomatch.makeRe(p, { strictBrackets: true }); return true; } catch { return false; }
}

const GlobPatternsSchema = z
  .array(z.string().min(1))
  .max(50)
  .superRefine((arr, ctx) => {
    if (!arr) return;
    arr.forEach((p, index) => {
      if (!isParseableGlob(p)) {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: `glob_unparseable:${p}`,
        });
      }
    });
  });

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    glob_patterns: GlobPatternsSchema.optional(),
    domain_notes: z.string().max(2000).optional(),
    question_count: z.number().int().min(3).max(8).optional(),  // V11: max raised from 5 → 8
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'at_least_one_field' });
```

> **Why `superRefine` not `.refine`?** Need to report which pattern failed (`path: [index]`) so the form can highlight the offending field. A flat `.refine` produces a single error message without index.

> **Implementation note (issue #421):** The original sketch used bare `picomatch.makeRe(p)` plus a try/catch on the assumption that picomatch throws on bad input. picomatch v4 is permissive by default (e.g. `makeRe('[')` returns `/^(?:\[\/?)$/` rather than throwing). `{ strictBrackets: true }` is required for `'['` to fail. Open question 1 was resolved by verifying `makeRe` exists at the top level — not that it raises on malformed input. The shared `GlobPatternsSchema` is reused by `CreateProjectSchema` for consistency.

**Settings page (server) sketch:**

```ts
// src/app/(authenticated)/projects/[id]/settings/page.tsx
import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrgRole } from '@/lib/supabase/membership';
import { SettingsForm, type SettingsInitial } from './settings-form';

const DEFAULT_QUESTION_COUNT = 4;

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project } = await supabase
    .from('projects').select('id, org_id, name').eq('id', projectId).maybeSingle();
  if (!project) notFound();

  const { user } = (await supabase.auth.getUser()).data;
  if (!user) redirect('/auth/sign-in');

  const role = await getOrgRole(supabase, user.id, project.org_id);
  // Settings is admin-only and Org Members have no UI affordance to reach it from the
  // project page; redirect them to /assessments (a page they have access to) rather than
  // back to /projects/[id], which would be a no-op redirect loop from their perspective.
  if (role === null) redirect('/assessments');

  const { data: ctxRow } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('org_id', project.org_id)
    .eq('project_id', projectId)
    .maybeSingle();

  const context = (ctxRow?.context ?? {}) as Record<string, unknown>;
  const initial: SettingsInitial = {
    glob_patterns: Array.isArray(context.glob_patterns) ? context.glob_patterns as string[] : [],
    domain_notes: typeof context.domain_notes === 'string' ? context.domain_notes : '',
    question_count: typeof context.question_count === 'number' ? context.question_count : DEFAULT_QUESTION_COUNT,
  };

  return <SettingsForm projectId={projectId} projectName={project.name} initial={initial} />;
}
```

**Settings form (client) shape:**

```ts
// src/app/(authenticated)/projects/[id]/settings/settings-form.tsx
'use client';

export interface SettingsInitial {
  glob_patterns: string[];
  domain_notes: string;
  question_count: number;
}

interface SettingsFormProps {
  projectId: string;
  projectName: string;
  initial: SettingsInitial;
}

// Internal decomposition (each ≤ 20 lines):
//   GlobPatternList — TagInput-style add/remove, per-row error display
//   DomainNotesField — inlined into the form (no separate component)
//   QuestionCountField — inlined into the form (no separate component)
//   buildChangedSubset(current, initial) — pure: returns only the fields the user changed
//   mapIssuesToGlobErrors(issues) — pure: turns ZodIssue[] into { [globIndex]: message }
//   patchProject(projectId, payload) — fetch PATCH /api/projects/${projectId}; reads
//     body.details?.issues on non-2xx
//   handleSubmit() — orchestrates the above
```

> **Implementation note (issue #421):** `DomainNotesField` and `QuestionCountField` were inlined into the form rather than extracted as separate components — both are 5–10 lines, single-use, and extracting them would have hidden the validation cap (3–8 / max 2000) at the call site without reducing duplication. `GlobPatternList` was kept as a separate component because it manages its own draft-input state and per-row error rendering. Two pure helpers (`buildChangedSubset`, `mapIssuesToGlobErrors`) were added to keep `handleSubmit` short. After a 422, the form clears `globErrors` on row add/remove so stale errors do not attach to the wrong row indices.

**Field-level error mapping.** When the API returns 422 with Zod issues, the form maps `body.details.issues[].path = ['glob_patterns', N]` to highlighting the Nth glob entry. Issues are nested under `details` because `validateBody` (in `@/lib/api/validation`) wraps Zod errors in `ApiError(422, 'Validation failed', { issues: [...] })`, and `handleApiError` serialises `ApiError.details` as `body.details`. Status is 422 (not 400) — `validateBody`'s convention.

> **Implementation note (issue #421):** The earlier wording "API returns 400 with Zod issues" was inaccurate on two counts: the codebase returns 422 (not 400), and the issues live at `body.details.issues` (not `body.issues`). The first form implementation read `body.issues` and silently dropped per-glob error display until adversarial testing surfaced it. The fix path is: form reads `body.details?.issues` and accepts both 400 and 422 defensively. Pinned by the regression test in `tests/evaluation/v11-e11-3-t3-1.eval.test.ts`.

**Tasks:**
1. **DB:** edit `supabase/schemas/tables.sql` to relax the four `BETWEEN 3 AND 5` CHECK constraints to `BETWEEN 3 AND 8` (lines 31–34, 80–81). Generate a migration via `npx supabase db diff -f relax_question_count_to_8`. Verify `db diff` is empty after `db reset`.
2. Extend `UpdateProjectSchema` with the glob `superRefine` **and raise `question_count` max from 5 to 8** (also raise the matching bound on `CreateProjectSchema` for consistency); unit-test the new branches.
3. Add `picomatch` as a direct dependency (`npm install picomatch @types/picomatch`).
4. Implement the server page with the two-query load (project + context), Org-Member redirect, and 404 on unknown project.
5. Implement the client form with field-level error mapping.
6. Tests: 5 page specs + 5 validation specs (see issue body).

**Acceptance:** see issue.

<a id="LLD-v11-e11-3-resolver-and-pipeline"></a>

### B.2 — Task T3.2: Project context resolver + FCS rubric wiring

**Files:**
- `src/lib/engine/prompts/artefact-types.ts` (extend `OrganisationContextSchema` with `glob_patterns` + `question_count` fields, OR add a new `ProjectPromptContextSchema` that is a strict superset)
- `src/lib/supabase/project-prompt-context.ts` (new — mirror of `org-prompt-context.ts` shape)
- `src/lib/api/fcs-pipeline.ts` (modify `extractArtefacts`, `RubricTriggerParams`, `AssessmentRetryRow` + retry SELECT — replace `loadOrgPromptContext` call with `loadProjectPromptContext`; route `question_count` from project context; thread `projectId` through both call sites)
- `tests/lib/supabase/project-prompt-context.test.ts` (new)
- `tests/lib/engine/fcs-pipeline-project-context.test.ts` (new)

**Schema decision (pick one and apply consistently):**

Option A — extend `OrganisationContextSchema` in place. All existing fields stay optional; add `glob_patterns: z.array(z.string()).optional()` and `question_count: z.number().int().min(3).max(8).optional()`. Pro: one schema, one type, fewer downstream changes. Con: org-level rows now visibly carry fields they don't use (UI-side noise — but org context UI is FCS-inert in V11).

Option B — new `ProjectPromptContextSchema` as a strict superset. `formatOrganisationContext` widens its argument to accept the union; the assembled set's `organisation_context` field accepts the union. Pro: org-level shape unchanged. Con: two schemas to keep in sync.

**Recommended: Option A.** The org-level table is inert for FCS in V11; carrying extra optional fields costs nothing and avoids a parallel schema. PRCC (deferred) will revisit.

```ts
// src/lib/engine/prompts/artefact-types.ts (delta)
export const OrganisationContextSchema = z.object({
  domain_vocabulary: z.array(z.object({ term: z.string().min(1), definition: z.string().min(1) })).optional(),
  focus_areas:       z.array(z.string().min(1)).max(5).optional(),
  exclusions:        z.array(z.string().min(1)).max(5).optional(),
  domain_notes:      z.string().max(2000).optional(), // V11: cap raised from 500 → 2000 to match UpdateProjectSchema
  glob_patterns:     z.array(z.string().min(1)).max(50).optional(),  // V11 NEW
  question_count:    z.number().int().min(3).max(8).optional(),       // V11 NEW (range 3..8 — see B.0 DB note)
});
```

> **Cap reconciliation.** Pre-V11 `domain_notes` was capped at 500 chars; `UpdateProjectSchema` (E11.1) already accepts up to 2000. Bump the schema cap to 2000 to match. Existing org-level rows are not affected (lengths are well under 2000).

**Resolver:**

```ts
// src/lib/supabase/project-prompt-context.ts (new — mirrors org-prompt-context.ts)
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import type { OrganisationContext } from '@/lib/engine/prompts';
import type { Database } from '@/lib/supabase/types';
import { logger } from '@/lib/logger';

/**
 * Loads the per-project prompt context for FCS rubric generation.
 * Returns undefined if no row exists OR the stored context fails schema parse
 * (logged at warn — never throws, so rubric generation is preserved).
 *
 * V11 ADR-0028: rows are keyed by (org_id, project_id). Org-level rows
 * (project_id IS NULL) are NOT consulted for FCS — see HLD §C4.
 */
export async function loadProjectPromptContext(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<OrganisationContext | undefined> {
  const { data, error } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw new Error(`loadProjectPromptContext: ${error.message}`);
  if (!data) return undefined;

  const parsed = OrganisationContextSchema.safeParse(data.context);
  if (!parsed.success) {
    logger.warn({ projectId, issues: parsed.error.issues }, 'loadProjectPromptContext: invalid context shape, skipping');
    return undefined;
  }
  return parsed.data;
}
```

**Pipeline modification.** In `src/lib/api/fcs-pipeline.ts` (the file lives in `src/lib/api/`, not `src/lib/engine/`, because it depends on Supabase + GitHub adapters — see header comment in the file), change the relevant `Promise.all` block in `extractArtefacts`:

```ts
// BEFORE (current shape, in api/fcs/service.ts pre-T2.2 OR fcs-pipeline.ts post-T2.2)
const [raw, issueContent, organisation_context, settings] = await Promise.all([
  ...,
  loadOrgPromptContext(adminSupabase, repoInfo.orgId),   // ← V11 FCS removes this
  loadOrgRetrievalSettings(adminSupabase, repoInfo.orgId),
]);

// AFTER (V11)
const [raw, issueContent, organisation_context, settings] = await Promise.all([
  ...,
  loadProjectPromptContext(adminSupabase, projectId),    // ← project-scoped
  loadOrgRetrievalSettings(adminSupabase, repoInfo.orgId),
]);
```

**Question-count routing.** `extractArtefacts` currently uses `repoInfo.questionCount` (from `org_config` / `repository_config`) for `buildTruncationOptions` and downstream prompt sizing. V11 must prefer the project's value:

```ts
const projectQuestionCount = organisation_context?.question_count;
const effectiveQuestionCount = projectQuestionCount ?? repoInfo.questionCount;
const opts = buildTruncationOptions(contextLimit, effectiveQuestionCount, settings.tool_use_enabled);
// ...assembled.question_count is set by truncateArtefacts using opts; verify it propagates.
```

> `AssembledArtefactSet.question_count` ([artefact-types.ts:53](../../src/lib/engine/prompts/artefact-types.ts#L53)) currently uses `min(3).max(5)`. **Raise to `min(3).max(8)` as part of T3.2** so the assembled set accepts the new upper bound. The propagation point is whatever currently passes `repoInfo.questionCount` to the assembled set — replace with `effectiveQuestionCount`.

**Caller-plumbing changes (explicit edit list).** `projectId` must reach `extractArtefacts`. The minimal threading is:

1. `ExtractArtefactsParams` (private interface in `fcs-pipeline.ts`) — add `projectId: string`.
2. `RubricTriggerParams` (public interface in `fcs-pipeline.ts`, ~lines 85–92) — add `projectId: string`. Forward it inside `triggerRubricGeneration` when calling `extractArtefacts`.
3. `AssessmentRetryRow` (private interface in `fcs-pipeline.ts`, ~lines 569–578) — add `project_id: string`. Update the retry-rubric route's SELECT (the call site that constructs `AssessmentRetryRow` from the `assessments` row) to include `project_id`. Inside `retriggerRubricForAssessment`, pass `projectId: assessment.project_id` to `triggerRubricGeneration` (line ~619).
4. Create caller — `src/app/api/projects/[id]/assessments/service.ts:66` already has `projectId` in scope; just add `projectId` to the `triggerRubricGeneration` call object.

`assessments.project_id` is non-null for FCS rows by the DB CHECK (`type <> 'fcs' OR project_id IS NOT NULL`, Invariant I1 from E11.2 T2.1), so no _logic_ branch is needed.

> **Implementation note (issue #422):** the generated Supabase `Database` types still type
> `assessments.project_id` as `string | null` (the CHECK constraint is not lifted into the
> typegen). The retry-rubric service therefore needs a one-line TS-narrowing guard at the
> SELECT site:
>
> ```ts
> // FCS rows have project_id NOT NULL by DB CHECK (V11 E11.2 T2.1); narrow for TS.
> if (assessment.project_id === null) throw new ApiError(500, 'Assessment missing project_id');
> ```
>
> The branch is unreachable in practice (DB CHECK enforces non-null on FCS rows; the retry path
> only runs after a successful `create_fcs_assessment` RPC); it exists purely to satisfy
> TypeScript when calling `retriggerRubricForAssessment`. A non-null assertion (`!`) was
> rejected as silently lossy.

**No persistence change.** The `assessments.config_question_count` column already records the question count used at creation time — already captured by E11.2's `create_fcs_assessment` RPC. Story 3.2 AC 5 ("resolved context used at generation time matches the project's configuration at the time of creation") is satisfied because the project context jsonb is read once, at extraction time, and the question_count is persisted to `assessments.config_question_count`. No new column needed for the snapshot of globs / domain_notes — the prompt itself is the audit trail (already logged via the existing rubric observability fields).

**Tasks:**
1. Extend `OrganisationContextSchema` (Option A) and re-export; raise `domain_notes` cap to 2000; add `glob_patterns` and `question_count` (`min(3).max(8)`); raise `AssembledArtefactSetSchema.question_count` upper bound from 5 → 8.
2. Implement `loadProjectPromptContext`; mirror `loadOrgPromptContext` shape.
3. Modify `extractArtefacts` in `fcs-pipeline.ts`: swap the resolver call; route `question_count` through.
4. Delete the FCS-side import of `loadOrgPromptContext` (the helper itself stays — `org-context-form.tsx` still uses it for the org-level UI; do not delete `loadOrgPromptContext`).
5. Tests: 4 resolver unit specs + 6 pipeline integration specs (see issue body).

**Acceptance:** see issue.

<a id="LLD-v11-e11-3-cross-cutting"></a>

### B.3 Cross-cutting

- **Internal decomposition (CLAUDE.md):** every new function ≤ 20 lines; route handlers ≤ 25 lines; nesting ≤ 3 levels.
- **No new ADR.** Decisions are covered by ADR-0027 (sub-tenant), ADR-0028 (reuse `organisation_contexts`), and the V11 HLD §C4 amendment to ADR-0013 (no FCS fallback). The Option A schema-extension decision is local to T3.2 and pinned in §B.2 above.
- **No new infrastructure.** No new tables, columns, RPCs, or env vars.
- **British English** throughout.
- **No silent catch.** The resolver logs warn + returns undefined on parse failure (preserves rubric generation per existing `loadOrgPromptContext` precedent).
- **PRCC unaffected.** PRCC rubric generation does not pass through the FCS path; `loadOrgPromptContext` remains for any future PRCC reuse and for the existing org-context UI (`/organisation` page).
- **Org-level context is dormant in V11.** The `loadOrgPromptContext` helper, the `/organisation` org-context form, and the org-level row in `organisation_contexts` (the row where `project_id IS NULL`) are kept on disk but **must not influence FCS rubric generation**. Concretely, in V11:
  - FCS code paths must not import `loadOrgPromptContext`.
  - The org-context form must **not** be extended with the new V11 fields (`glob_patterns`, `question_count`) — those are project-only. The form keeps its pre-V11 field set (`domain_vocabulary`, `focus_areas`, `exclusions`, `domain_notes`).
  - Even though Option A widens `OrganisationContextSchema` with two new optional fields, the org-context form has no UI for them; any value previously written there from another path (none currently) is ignored by FCS because FCS reads the project row, not the org row.
  - Navigation/visibility of the `/organisation` org-context entry point is not changed in this epic (out of scope), but a future ticket may hide it once PRCC migrates off the org row.

<a id="LLD-v11-e11-3-out-of-scope"></a>

### B.4 Out-of-scope reminders

- Project metadata edit (name / description) — already shipped in E11.1.
- Settings page navigation entry — out (the settings link from the dashboard is an E11.4 concern; reachable via direct URL in the meantime).
- Org-context UI removal — out (`/organisation` org-context form still works; org-level rows are inert for FCS but still readable / editable for future PRCC).
- Copy context from another project — explicitly out per requirements §"What We Are NOT Building".

---

## Cross-References

### Internal (within this LLD)

- §B.2 (resolver + pipeline) is independent of §B.1 (settings page) at the file level — they touch disjoint paths.
- Both depend on §B.0 helper inventory.

### External

- **Depends on:** [lld-v11-e11-1-project-management.md](lld-v11-e11-1-project-management.md) — `projects` table, `organisation_contexts.project_id` FK, `patch_project` RPC, `UpdateProjectSchema` (extended here, not replaced), `getOrgRole` page-side helper.
- **Depends on (T3.2 only):** [lld-v11-e11-2-fcs-scoped-to-projects.md §B.2](lld-v11-e11-2-fcs-scoped-to-projects.md#LLD-v11-e11-2-fcs-create-api) — the rubric pipeline relocation to `src/lib/engine/fcs-pipeline.ts` (#411). T3.2 must merge after #411.
- **Depended on by:** none in V11. PRCC project scoping (deferred) will likely reuse `loadProjectPromptContext`.

### Shared types

- `OrganisationContext` (extended in T3.2 with `glob_patterns` and `question_count`) — consumed by `formatOrganisationContext` in `prompt-builder.ts` (no consumer change needed; new fields are optional and currently unread by the formatter — formatter extension is out of scope for V11 and tracked separately if/when domain_notes / globs need richer prompt formatting).

---

## Tasks

> **Note.** Task entries below pair with issues minted by `/architect`. The issue body is the runtime source of truth for `/feature`; this block is the design-time snapshot. Mid-flight changes go to the issue and are folded back in by `/lld-sync` at feature completion.

### Task T3.1: Project settings page + glob parseability validation

**Issue:** *(minted by `/architect`)*
**Issue title:** E11.3 T3.1 — `/projects/[id]/settings` page + glob parseability validation
**Layer:** FE + BE (validation)
**Depends on:** E11.1 (#393, merged)
**Stories:** 3.1
**HLD reference:** [v11-design.md §C4](v11-design.md#c4-assessment-engine--context-resolution-narrowed)
**LLD section:** [§B.1](#LLD-v11-e11-3-settings-page)

**What:**
1. **DB:** in `supabase/schemas/tables.sql`, change the four `BETWEEN 3 AND 5` CHECK constraints (`org_config.{fcs,prcc}_question_count` lines 31–34, `repository_config.{fcs,prcc}_question_count` lines 80–81) to `BETWEEN 3 AND 8`. Generate migration: `npx supabase db diff -f relax_question_count_to_8`. Verify `db diff` is empty after `db reset`.
2. Extend `UpdateProjectSchema` (and `CreateProjectSchema`) in `src/app/api/projects/validation.ts`: raise `question_count` max from 5 to 8; add a `superRefine` on `glob_patterns` that calls `picomatch.makeRe(p)` and emits `code: 'custom', path: [index], message: 'glob_unparseable:<pattern>'` on failure.
3. Add `picomatch` + `@types/picomatch` as direct deps.
4. New server page `src/app/(authenticated)/projects/[id]/settings/page.tsx` — load project + existing context row in two queries, redirect Org Member to `/assessments` (settings is admin-only; non-admins have no UI link to it and `/projects/[id]` would be a no-op redirect loop), 404 on unknown project.
5. New client form `src/app/(authenticated)/projects/[id]/settings/settings-form.tsx` — fields: glob_patterns (TagInput-style), domain_notes (textarea, max 2000), question_count (number 3..8). Submits PATCH with the changed subset. Maps 400 issues with `path: ['glob_patterns', N]` to per-row error display.
6. Tests: 5 page specs + 5 validation specs.

**Acceptance:**
- [ ] `UpdateProjectSchema` rejects `{ glob_patterns: ['['] }` with a 400 carrying `issues[0].path = ['glob_patterns', 0]`.
- [ ] `UpdateProjectSchema` accepts `{ glob_patterns: ['docs/adr/*.md', '**/*.ts'] }`.
- [ ] `UpdateProjectSchema` accepts `{ question_count: 8 }` and rejects `{ question_count: 9 }`.
- [ ] DB CHECK constraints on `{org_config,repository_config}.{fcs,prcc}_question_count` allow values 3–8 inclusive.
- [ ] `GET /projects/[id]/settings` as Org Admin renders the form prefilled from the existing row.
- [ ] `GET /projects/[id]/settings` as Org Member redirects to `/assessments`.
- [ ] `GET /projects/[id]/settings` for unknown project returns 404.
- [ ] Saving from the form posts `PATCH /api/projects/[id]` with only the changed subset and shows a success state on 200.

**BDD specs:**
```
describe('PATCH /api/projects/[id] — context-fields validation')
  it('accepts a payload with valid glob patterns, domain_notes and question_count')
  it('rejects question_count = 2 with 400 and a range error')
  it('accepts question_count = 8 (V11 upper bound)')
  it('rejects question_count = 9 with 400 and a range error')
  it('rejects an unparseable glob pattern with 400 identifying the offending index')
  it('accepts a payload that omits all context fields')

describe('/projects/[id]/settings')
  it('Org Admin sees the form prefilled from the existing organisation_contexts row')
  it('Project with no context row renders empty inputs and the system-default question count')
  it('Repo Admin successfully saves changes')
  it('Org Member is redirected to /assessments')
  it('Unknown projectId returns 404')
```

**Files:**
- `supabase/schemas/tables.sql` (relax 4 CHECK constraints to `BETWEEN 3 AND 8`)
- `supabase/migrations/20260501202822_relax_question_count_to_8.sql` (generated)
- `src/app/api/projects/validation.ts` (extend)
- `src/app/(authenticated)/projects/[id]/settings/page.tsx` (new)
- `src/app/(authenticated)/projects/[id]/settings/settings-form.tsx` (new)
- `package.json` (+ `picomatch` runtime, `@types/picomatch` dev)
- `tests/app/api/projects/validation.test.ts` (new — schema unit tests)
- `tests/app/(authenticated)/projects/[id]/settings/page.test.ts` (new)
- `tests/app/api/projects/update.test.ts` (existing — q_count boundary tests bumped 5 → 8)
- `tests/evaluation/v11-e11-3-t3-1.eval.test.ts` (new — error-body shape regression pin)

---

### Task T3.2: Project context resolver + FCS rubric wiring

**Issue:** *(minted by `/architect`)*
**Issue title:** E11.3 T3.2 — `loadProjectPromptContext` + FCS pipeline reads project context
**Layer:** BE (engine)
**Depends on:** E11.1 (#393, merged), **E11.2 T2.2 (#411 — rubric pipeline relocation)**
**Stories:** 3.2
**HLD reference:** [v11-design.md §C4, §3.V11.2](v11-design.md#3v112-project-context-resolution-at-rubric-generation-story-32)
**LLD section:** [§B.2](#LLD-v11-e11-3-resolver-and-pipeline)

**What:**
1. Extend `OrganisationContextSchema` in `src/lib/engine/prompts/artefact-types.ts` with optional `glob_patterns` and `question_count` (`min(3).max(8)`); raise `domain_notes` cap from 500 to 2000. **Also raise the `question_count` bound on `AssembledArtefactSetSchema` (line 53) from `max(5)` to `max(8)`** so the assembled set schema accepts the new V11 upper bound.
2. New `src/lib/supabase/project-prompt-context.ts` exporting `loadProjectPromptContext(supabase, projectId): Promise<OrganisationContext | undefined>` — predicate `.eq('project_id', $1)`, `safeParse` → warn-and-undefined on failure (mirrors `loadOrgPromptContext`).
3. Modify `extractArtefacts` in `src/lib/api/fcs-pipeline.ts`:
   - add `projectId: string` to `ExtractArtefactsParams`
   - replace the `loadOrgPromptContext(adminSupabase, repoInfo.orgId)` call with `loadProjectPromptContext(adminSupabase, projectId)`
   - compute `effectiveQuestionCount = organisation_context?.question_count ?? repoInfo.questionCount` and pass that to `buildTruncationOptions` and the assembled set
4. Thread `projectId` through both call sites (see B.2 "Caller-plumbing changes"):
   - add `projectId: string` to `RubricTriggerParams` (public)
   - add `project_id: string` to `AssessmentRetryRow` and include `project_id` in the retry-route SELECT
   - update `retriggerRubricForAssessment` to forward `projectId: assessment.project_id`
   - update `src/app/api/projects/[id]/assessments/service.ts:66` to forward `projectId` (already in scope)
5. **Do not** delete `loadOrgPromptContext` — it is still consumed by `src/app/(authenticated)/organisation/page.tsx` for the org-level UI.
6. Tests: 4 resolver specs + 6 pipeline specs.

**Acceptance:**
- [ ] `loadProjectPromptContext` returns the parsed `OrganisationContext` when a row exists.
- [ ] `loadProjectPromptContext` returns `undefined` when no row exists.
- [ ] `loadProjectPromptContext` returns `undefined` and logs warn when the row exists but parse fails.
- [ ] `loadProjectPromptContext` does NOT return the org-level row (`project_id IS NULL`) when both org and project rows exist.
- [ ] Grep `loadOrgPromptContext` against `src/lib/api/fcs-pipeline.ts` returns zero matches.
- [ ] Grep `loadOrgPromptContext` against `src/app/(authenticated)/organisation/` still returns matches (helper retained for org UI).
- [ ] An FCS assessment created in a project with `question_count = 5` produces exactly 5 generated questions.
- [ ] An FCS assessment created in a project with `question_count = 8` produces exactly 8 generated questions (validates new V11 upper bound end-to-end).
- [ ] An FCS assessment created in a project with no context row produces a prompt where the `organisation_context` block is omitted.

**BDD specs:**
```
describe('loadProjectPromptContext')
  it('returns parsed ProjectPromptContext when a row exists for the project')
  it('returns undefined when no row exists for the project')
  it('returns undefined when the row exists but the context fails schema parse (logs warn)')
  it('does NOT return the org-level row (project_id IS NULL) when both org and project rows exist')

describe('FCS rubric — project-context wiring')
  it('extractArtefacts calls loadProjectPromptContext, not loadOrgPromptContext, for the FCS path')
  it('the assembled prompt contains the project domain_notes verbatim')
  it('the assembled prompt contains files matched by the project glob_patterns')
  it('a project with no context row produces an assembled set with organisation_context = undefined')
  it('the question count submitted to the LLM equals the project context question_count when set')
  it('repo-level exempt patterns still exclude files matched by project globs')
```

**Files:**
- `src/lib/engine/prompts/artefact-types.ts` (extend `OrganisationContextSchema`)
- `src/lib/engine/prompts/index.ts` (re-export delta if needed)
- `src/lib/supabase/project-prompt-context.ts` (new)
- `src/lib/api/fcs-pipeline.ts` (modify `extractArtefacts`, `RubricTriggerParams`, `AssessmentRetryRow` + retry-route SELECT)
- `src/app/api/projects/[id]/assessments/service.ts` (forward `projectId` to `triggerRubricGeneration`)
- `tests/lib/supabase/project-prompt-context.test.ts` (new)
- `tests/lib/engine/fcs-pipeline-project-context.test.ts` (new)

---

## Execution Order

### Dependency DAG

```mermaid
graph LR
  E1[E11.1 #393<br/>merged] --> T31[T3.1: Settings page + glob validation]
  E1 --> T32[T3.2: Resolver + rubric wiring]
  E22[E11.2 T2.2 #411<br/>pipeline relocation] --> T32
```

### Execution Waves

| Wave | Tasks | Blocked by | Notes |
|------|-------|------------|-------|
| 1 | T3.1 | E11.1 (merged) | Fully parallel-safe with all of E11.2 and E11.4. |
| 2 | T3.2 | E11.1 (merged) + E11.2 T2.2 (#411) | Modifies `extractArtefacts`, which #411 relocates. Must follow #411. |

### Refinement vs. plan parallelisation map

The plan ([2026-04-30-v11-implementation-plan.md §Parallelisation Map](../plans/2026-04-30-v11-implementation-plan.md#parallelisation-map)) marks **E11.2 ↔ E11.3 as parallel-safe** based on disjoint Owns. File-level analysis refines this:

- **T3.1 ↔ all of E11.2:** parallel-safe (disjoint files — settings page lives under `src/app/(authenticated)/projects/[id]/settings/`, untouched by E11.2; validation extension touches `validation.ts`, untouched by E11.2).
- **T3.2 ↔ E11.2 T2.2 (#411):** **conflicting** — both modify the rubric pipeline's `extractArtefacts`. T3.2 must wait for #411 to merge.
- **T3.2 ↔ all other E11.2 tasks (#410, #412–#415):** parallel-safe.

Recommended plan patch: change the E11.2 ↔ E11.3 edge in the parallelisation map from `parallel-safe` to `coordinate rubric pipeline ownership — T3.2 follows T2.2`.
