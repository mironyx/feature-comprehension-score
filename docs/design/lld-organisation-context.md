# Low-Level Design: Organisation Context

## Document Control

| Field   | Value                                                             |
| ------- | ----------------------------------------------------------------- |
| Version | 0.1                                                               |
| Status  | Draft                                                             |
| Author  | LS / Claude                                                       |
| Created | 2026-04-01                                                        |
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

This document covers §1–§2 (issue #140). §3 and §4 will be added when #157 and #158 are
architected.

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
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  context     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);

CREATE INDEX idx_org_contexts_org ON organisation_contexts (org_id);
```

**Notes:**

- `context` stores the serialised `OrganisationContext` object (validated by Zod at the
  application layer before write; read back and re-validated before injection).
- `UNIQUE (org_id, project_id)` — PostgreSQL treats two NULLs as distinct in unique
  constraints, so multiple rows with `project_id IS NULL` for the same org are **not**
  possible (the constraint still enforces one row per org when `project_id` is NULL,
  because the pair `(org_id, NULL)` is treated as equal by this constraint using
  `NULLS NOT DISTINCT` — add that clause explicitly).

Revised DDL with explicit null handling:

```sql
  UNIQUE NULLS NOT DISTINCT (org_id, project_id)
```

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

```typescript
function formatOrganisationContext(
  artefacts: AssembledArtefactSet,
): string | undefined {
  const ctx = artefacts.organisation_context;
  if (!ctx) return undefined;

  const sections: string[] = [];

  if (ctx.domain_vocabulary?.length) {
    const terms = ctx.domain_vocabulary
      .map(v => `- **${v.term}**: ${v.definition}`)
      .join('\n');
    sections.push(
      `### Domain Vocabulary\n\nThe following terms have specific meaning in this codebase:\n\n${terms}`,
    );
  }

  if (ctx.focus_areas?.length) {
    const areas = ctx.focus_areas.map(a => `- ${a}`).join('\n');
    sections.push(
      `### Focus Areas\n\nThe organisation has asked that questions emphasise these areas where possible:\n\n${areas}`,
    );
  }

  if (ctx.exclusions?.length) {
    const excl = ctx.exclusions.map(e => `- ${e}`).join('\n');
    sections.push(
      `### Exclusions\n\nDo not generate questions about the following areas:\n\n${excl}`,
    );
  }

  if (ctx.domain_notes?.trim()) {
    sections.push(`### Additional Context\n\n${ctx.domain_notes}`);
  }

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

/**
 * Loads the org-level prompt context for rubric generation.
 * Returns undefined if no context row exists (empty context → no prompt section).
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
  if (!parsed.success) return undefined;  // malformed row → skip silently

  return parsed.data;
}
```

**Error handling:** A missing row is valid (new orgs have no context). A malformed row is
skipped silently — a corrupt context row must never break rubric generation.

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

After this change:

```typescript
const organisation_context = await loadOrgPromptContext(
  params.adminSupabase,
  params.repoInfo.orgId,
);
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

## 5. BDD Specifications (#140)

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

describe('triggerRubricGeneration with organisation context')
  it('passes organisation_context into AssembledArtefactSet when a row exists')
  it('passes undefined organisation_context when no row exists')
```

---

## 6. Tasks

| # | Task | Files | Size estimate |
| - | ---- | ----- | ------------- |
| 6.1 | DB schema + migration | `supabase/schemas/tables.sql`, `supabase/schemas/policies.sql`, migration | ~40 lines |
| 6.2 | Engine types + export | `src/lib/engine/prompts/artefact-types.ts`, `src/lib/engine/prompts/index.ts` | ~25 lines |
| 6.3 | Prompt builder | `src/lib/engine/prompts/prompt-builder.ts` | ~45 lines |
| 6.4 | Supabase query helper + assembler injection | `src/lib/supabase/org-prompt-context.ts`, `src/app/api/fcs/service.ts` | ~30 lines |

All four tasks can be implemented in a single `/feature` cycle (total ~140 lines). Issue
Issue #140 maps to one PR covering all four tasks.
