# Low-Level Design: Organisation Context

## Document Control

| Field   | Value                                                             |
| ------- | ----------------------------------------------------------------- |
| Version | 0.3                                                               |
| Status  | Revised                                                           |
| Author  | LS / Claude                                                       |
| Created | 2026-04-01                                                        |
| Revised | 2026-04-01 — Issue #140 implementation sync                       |
| Revised | 2026-04-01 — Issue #157 API write path added                      |
| Parent  | [v1-design.md](v1-design.md) §4.3                                 |
| Issues  | #140 (backend), #157 (API), #158 (UI)                             |
| ADR     | [ADR-0017](../adr/0017-organisation-contexts-separate-table.md)   |

---

## 1. Overview

Organisation context is structured domain customisation that clients provide to improve
LLM-generated assessment question quality. It is stored persistently and injected into the
LLM user prompt at rubric-generation time.

**Three layers, three issues:**

| Layer            | Issue | Scope                                              |
| ---------------- | ----- | -------------------------------------------------- |
| DB + engine      | #140  | Schema, types, prompt formatting, assembler wiring |
| API write path   | #157  | `PATCH /api/organisations/[id]/context`            |
| Settings UI      | #158  | Admin panel to view and edit context               |

§1–§4 cover issue #140 (DB + engine). §5 covers issue #157 (API write path).
§6 (settings UI, issue #158) will be added when architected.

---

## 2. DB Schema (#140)

### 2.1 Table: `organisation_contexts`

**File:** `supabase/schemas/tables.sql` (append after `org_config`)

```sql
-- organisation_contexts: per-org (Phase 2) or per-project (V2) prompt customisation.
-- project_id is NULL in Phase 2. V2 adds project-level rows without a data migration.
-- Design reference: docs/design/lld-organisation-context.md §2
-- ADR: docs/adr/0017-organisation-contexts-separate-table.md
-- Issue: #140
CREATE TABLE organisation_contexts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id  uuid,  -- NULL in Phase 2; FK to projects(id) added in V2
  context     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (org_id, project_id)
);

CREATE INDEX idx_org_contexts_org ON organisation_contexts (org_id);
```

> **Implementation note (issue #140):** The `project_id` FK to `projects(id)` was removed
> because the `projects` table does not exist yet. The column is kept as a bare `uuid` with
> a comment noting the FK will be added in V2. The `UNIQUE NULLS NOT DISTINCT` clause is
> used directly (the earlier prose about adding it separately was consolidated).

### 2.2 RLS Policies

**File:** `supabase/schemas/policies.sql` (append after `org_config` policies)

```sql
-- organisation_contexts: members can read their org's context; only admins can write.
ALTER TABLE organisation_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_contexts_select_member ON organisation_contexts
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_contexts_insert_admin ON organisation_contexts
  FOR INSERT WITH CHECK (is_org_admin(org_id));

CREATE POLICY org_contexts_update_admin ON organisation_contexts
  FOR UPDATE USING (is_org_admin(org_id));

CREATE POLICY org_contexts_delete_admin ON organisation_contexts
  FOR DELETE USING (is_org_admin(org_id));
```

**Rationale:** Follows the same pattern as `org_config`. The service role (used by the
rubric-generation background flow) bypasses RLS, so no service-role policy is needed.

### 2.3 Migration workflow

Follow the declarative schema workflow from CLAUDE.md:

1. Edit `supabase/schemas/tables.sql` and `supabase/schemas/policies.sql`.
2. `npx supabase db diff -f add-organisation-contexts` to generate the migration.
3. Add header comment referencing `#140` and this LLD.
4. `npx supabase db reset` to verify clean apply.
5. `npx supabase db diff` — must output "No schema changes found".

---

## 3. Engine Layer (#140)

### 3.1 Type: `OrganisationContextSchema`

**File:** `src/lib/engine/prompts/artefact-types.ts` (append before `AssembledArtefactSetSchema`)

```typescript
export const OrganisationContextSchema = z.object({
  /** Domain-specific terms and definitions for this codebase. */
  domain_vocabulary: z.array(z.object({
    term:       z.string().min(1),
    definition: z.string().min(1),
  })).optional(),

  /** Areas to emphasise in questions (max 5). */
  focus_areas: z.array(z.string().min(1)).max(5).optional(),

  /** Modules or areas to exclude from questions (max 5). */
  exclusions: z.array(z.string().min(1)).max(5).optional(),

  /** Free-text domain context. Capped to prevent prompt injection. */
  domain_notes: z.string().max(500).optional(),
});
export type OrganisationContext = z.infer<typeof OrganisationContextSchema>;
```

**`AssembledArtefactSet` extension** — add one field to the existing `extend` call:

```typescript
export const AssembledArtefactSetSchema = RawArtefactSetSchema.extend({
  question_count:       z.number().int().min(3).max(5),
  artefact_quality:     ArtefactQualitySchema,
  token_budget_applied: z.boolean(),
  truncation_notes:     z.array(z.string()).optional(),
  organisation_context: OrganisationContextSchema.optional(),  // ← new
});
```

### 3.2 Prompt builder: `formatOrganisationContext`

**File:** `src/lib/engine/prompts/prompt-builder.ts`

Add after `formatAssessmentContext`:

> **Implementation note (issue #140):** The monolithic `formatOrganisationContext` was
> decomposed into 5 private helpers (`formatBulletList`, `formatVocabulary`,
> `formatFocusAreas`, `formatExclusions`, `formatDomainNotes`) to keep cyclomatic
> complexity under the CodeScene threshold (cc ≤ 9).

```typescript
function formatBulletList(items: string[]): string {
  return items.map(i => `- ${i}`).join('\n');
}

function formatVocabulary(ctx: NonNullable<AssembledArtefactSet['organisation_context']>): string | undefined { ... }
function formatFocusAreas(ctx: ...): string | undefined { ... }
function formatExclusions(ctx: ...): string | undefined { ... }
function formatDomainNotes(ctx: ...): string | undefined { ... }

function formatOrganisationContext(
  artefacts: AssembledArtefactSet,
): string | undefined {
  const ctx = artefacts.organisation_context;
  if (!ctx) return undefined;

  const sections = [
    formatVocabulary(ctx),
    formatFocusAreas(ctx),
    formatExclusions(ctx),
    formatDomainNotes(ctx),
  ].filter(Boolean);

  if (!sections.length) return undefined;
  return `## Organisation Context\n\n${sections.join('\n\n')}`;
}
```

**Update `formatUserPrompt`** — insert after `formatAssessmentContext`:

```typescript
function formatUserPrompt(artefacts: AssembledArtefactSet): string {
  const sections: (string | undefined)[] = [
    formatAssessmentContext(artefacts),
    formatOrganisationContext(artefacts),   // ← new, before artefacts
    formatPrDescription(artefacts),
    formatLinkedIssues(artefacts),
    formatFileListingTable(artefacts),
    formatContextDocuments(artefacts),
    `## Code Diff\n\n${artefacts.pr_diff}`,
    formatFileContents(artefacts),
    formatTestFiles(artefacts),
    formatTruncationNotice(artefacts),
  ];

  return sections.filter(Boolean).join('\n\n');
}
```

**Token budget:** Organisation context is non-truncatable (short, high-signal). The
`truncateArtefacts` function in `src/lib/engine/prompts/truncate.ts` targets file contents
and diffs — no change needed.

### 3.3 Export

**File:** `src/lib/engine/prompts/index.ts` — add:

```typescript
export {
  OrganisationContextSchema,
  type OrganisationContext,
} from './artefact-types';
```

---

## 4. Supabase Adapter Layer (#140)

### 4.1 Query helper

**File:** `src/lib/supabase/org-prompt-context.ts` (new file)

> Note: `src/lib/supabase/org-context.ts` already exists — it is the org-selection
> cookie helper and is unrelated. This new file handles DB reads for prompt context.

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import type { OrganisationContext } from '@/lib/engine/prompts';
import { logger } from '@/lib/logger';

/**
 * Loads the org-level prompt context for rubric generation.
 * Returns undefined if no context row exists (empty context = no prompt section).
 */
export async function loadOrgPromptContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrganisationContext | undefined> {
  const { data, error } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('org_id', orgId)
    .is('project_id', null)
    .maybeSingle();

  if (error) throw new Error(`loadOrgPromptContext: ${error.message}`);
  if (!data) return undefined;

  const parsed = OrganisationContextSchema.safeParse(data.context);
  if (!parsed.success) {
    logger.warn({ orgId, issues: parsed.error.issues },
      'loadOrgPromptContext: invalid context shape, skipping');
    return undefined;
  }

  return parsed.data;
}
```

> **Implementation note (issue #140):** The original spec had `return undefined` silently on
> malformed rows. PR review flagged this as a silent-swallow violation. A `logger.warn` was
> added with `orgId` and Zod `issues` for observability.

**Error handling:** A missing row is valid (new orgs have no context). A malformed row is
logged as a warning and skipped — a corrupt context row must never break rubric generation.

### 4.2 Injection point

**File:** `src/app/api/fcs/service.ts` — `triggerRubricGeneration` (line ~276)

Current assembly (line 276):

```typescript
const artefacts: AssembledArtefactSet = {
  ...raw,
  question_count:       params.repoInfo.questionCount,
  artefact_quality:     'code_only',
  token_budget_applied: false,
};
```

After this change (uses `Promise.all` for parallel fetch):

> **Implementation note (issue #140):** The two async calls (`extractFromPRs` and
> `loadOrgPromptContext`) are independent and run in parallel via `Promise.all`,
> rather than sequentially as the original spec implied.

```typescript
const [raw, organisation_context] = await Promise.all([
  source.extractFromPRs({ owner: params.repoInfo.orgName,
    repo: params.repoInfo.repoName, prNumbers: params.prNumbers }),
  loadOrgPromptContext(params.adminSupabase, params.repoInfo.orgId),
]);
const artefacts: AssembledArtefactSet = {
  ...raw,
  question_count:       params.repoInfo.questionCount,
  artefact_quality:     'code_only',
  token_budget_applied: false,
  organisation_context,
};
```

`loadOrgPromptContext` is called with `adminSupabase` (service-role client) because
`triggerRubricGeneration` runs in a background webhook flow with no user session. The
service role bypasses RLS, so no policy change is needed for this read path. The admin
API write path (#157) uses the user client (RLS enforced by `is_org_admin`).

---

## 5. API Write Path (#157)

### 5.1 Route handler

**File:** `src/app/api/organisations/[id]/context/route.ts`

Follows the standard controller/service pattern (ADR-0014, `createApiContext` composition root):

```typescript
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: orgId } = await params;
    const ctx = await createApiContext(request);
    const body = await validateBody(request, OrganisationContextSchema);
    const row: OrgContextRow = await upsertContext(ctx, orgId, body);
    return json(row);
  } catch (error) {
    return handleApiError(error);
  }
}
```

Route handler body: 7 lines (limit: 25).

### 5.2 Service

**File:** `src/app/api/organisations/[id]/context/service.ts`

> **Implementation note (issue #157):** The issue specified the upsert helper should
> live in `src/lib/supabase/`. During review, this was corrected to follow the
> established `createApiContext` + co-located `service.ts` pattern. The service
> receives `ApiContext` (DI) and never creates its own clients.

#### Internal decomposition

```
Controller (route.ts, 7 lines):
- const ctx = await createApiContext(request)
- return json(await upsertContext(ctx, orgId, body))

Service (service.ts):
- Exported: `upsertContext(ctx: ApiContext, orgId: string, context: OrganisationContext): Promise<OrgContextRow>`
- Receives ApiContext (DI) — never calls createClient() or any infrastructure factory

  Private helpers:
  - `assertOrgAdmin(supabase, userId, orgId): Promise<void>` — checks user_organisations via ctx.supabase (RLS-enforced); throws ApiError(403)

> **Constraint:** The service uses ctx.supabase (user client) for auth checks and
> ctx.adminSupabase (service-role) for the upsert. The admin client is needed because
> the organisation_contexts table is not in the generated Database types — an untyped
> SupabaseClient cast is required.
```

### 5.3 Shared type

**File:** `src/lib/supabase/org-prompt-context.ts`

`OrgContextRow` interface was added here (co-located with `loadOrgPromptContext`) so
both the read path (#140) and write path (#157) share the same row type.

```typescript
export interface OrgContextRow {
  id: string;
  org_id: string;
  project_id: string | null;
  context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

---

## 6. BDD Specifications (#140, #157)

### API write path (#157)

```
describe('OrganisationContextSchema')
  it('accepts a valid context with all four fields')
  it('accepts an empty object — all fields are optional')
  it('rejects focus_areas with more than 5 items')
  it('rejects exclusions with more than 5 items')
  it('rejects domain_notes longer than 500 characters')
  it('rejects a domain_vocabulary entry missing term or definition')

describe('formatOrganisationContext')
  it('returns undefined when organisation_context is not present')
  it('returns undefined when organisation_context is an empty object')
  it('formats domain_vocabulary as a term-definition list')
  it('formats focus_areas as a bulleted list under the correct heading')
  it('formats exclusions as a bulleted list under the correct heading')
  it('formats domain_notes as plain text under Additional Context')
  it('combines multiple sections with correct headings and spacing')
  it('omits a section whose array is empty')

describe('formatUserPrompt with organisation context')
  it('includes the Organisation Context section before the PR description')
  it('omits the Organisation Context section when organisation_context is undefined')

describe('loadOrgPromptContext')
  it('returns undefined when no row exists for the org')
  it('returns the parsed OrganisationContext when a valid row exists')
  it('returns undefined when the stored JSONB fails schema validation')
  it('throws when Supabase returns an error')

describe('triggerRubricGeneration with organisation context')
  it('passes organisation_context into AssembledArtefactSet when a row exists')
  it('passes undefined organisation_context when no row exists')

describe('PATCH /api/organisations/[id]/context')
  it('returns 403 when caller is not an admin')
  it('returns 401 when caller is unauthenticated')
  it('returns 422 when focus_areas exceeds max 5')
  it('returns 422 when domain_notes exceeds 500 chars')
  it('upserts and returns 200 with the context row')
  it('passes the full context to upsertContext')
```

---

## 7. Tasks

| # | Task | Files | Size estimate |
| - | ---- | ----- | ------------- |
| 6.1 | DB schema + migration | `supabase/schemas/tables.sql`, `supabase/schemas/policies.sql`, migration | ~40 lines |
| 6.2 | Engine types + export | `src/lib/engine/prompts/artefact-types.ts`, `src/lib/engine/prompts/index.ts` | ~25 lines |
| 6.3 | Prompt builder | `src/lib/engine/prompts/prompt-builder.ts` | ~45 lines |
| 6.4 | Supabase query helper + assembler injection | `src/lib/supabase/org-prompt-context.ts`, `src/app/api/fcs/service.ts` | ~30 lines |

Tasks 7.1–7.4 were implemented in issue #140. Task 7.5 was implemented in issue #157.

### 7.5 API write path

| Files | Size |
| ----- | ---- |
| `src/app/api/organisations/[id]/context/route.ts`, `src/app/api/organisations/[id]/context/service.ts`, `tests/app/api/organisations/[id].context.test.ts` | ~200 lines |
