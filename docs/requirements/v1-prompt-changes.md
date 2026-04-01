# FCS V1 Prompt Changes — Two Edits

## Change 1: Question Depth Constraint

**File:** `src/lib/engine/prompts/prompt-builder.ts`

**Location:** Add as a new bullet at the end of the `## Constraints` section in `QUESTION_GENERATION_SYSTEM_PROMPT`

**Insert after** the bullet ending "...Omit the field entirely if the provided artefacts are sufficient."

**Add:**

```
- Focus questions on architectural reasoning, design intent, domain understanding, and the ability to make safe judgements about change — not on low-level implementation details. A useful test: if a developer could answer the question by reading the code for 30 seconds (variable names, default values, specific syntax, line-level logic), the question is too shallow. Good questions test understanding that persists after the developer has moved on to other work — the kind of knowledge that matters when deciding whether a proposed change is safe, not when recalling how a function is currently implemented. This applies across all three Naur layers: even "modification capacity" questions should test reasoning about dependencies and risks, not recall of specific code paths.
```

---

## Change 2: Organisation Context (Client Prompt Customisation)

This change introduces structured, additive customisation slots that clients can fill — without exposing or competing with the core system prompt.

### Persistence model

Organisation context is stored in a dedicated `organisation_contexts` table (not a column on `organisations`). This keeps the schema extensible: when V2 adds projects, a `project_id` FK can be added to this table without migrating data.

```sql
CREATE TABLE organisation_contexts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL in Phase 2
  context     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, project_id)
);
```

**Phase 2 lookup:** `WHERE org_id = $1 AND project_id IS NULL`
**V2 lookup:** `WHERE org_id = $1 AND project_id = $2`

Context is loaded by the artefact assembler (Supabase adapter layer) at rubric-generation time and injected into `AssembledArtefactSet.organisation_context`. The engine remains pure — it receives the assembled context and formats it; it does not query the DB.

**Separate issue:** A `PATCH /api/organisations/[id]/context` endpoint is tracked separately and allows admin users to create or update the org-level context row.

### 2a. New type: `OrganisationContext`

**File:** `src/lib/engine/prompts/artefact-types.ts`

**Add after** the `AssembledArtefactSetSchema` definition:

```typescript
export const OrganisationContextSchema = z.object({
  /** Domain-specific terms the LLM should understand in this codebase's context */
  domain_vocabulary: z.array(z.object({
    term: z.string().min(1),
    definition: z.string().min(1),
  })).optional(),

  /** Areas the client wants questions to emphasise */
  focus_areas: z.array(z.string().min(1)).max(5).optional(),

  /** Areas or modules the client wants excluded from assessment */
  exclusions: z.array(z.string().min(1)).max(5).optional(),

  /** Free-text domain context (capped length — context, not instructions) */
  domain_notes: z.string().max(500).optional(),
});
export type OrganisationContext = z.infer<typeof OrganisationContextSchema>;
```

**Design rationale:**
- `domain_vocabulary`: Lets clients define terms like "saga" or "projection" that have specific meaning in their codebase. Appended as context, not instructions.
- `focus_areas`: Structured strings like "event-driven message flow", "data consistency across bounded contexts", "API contract stability". Guides question emphasis.
- `exclusions`: "legacy payment module", "deprecated v1 endpoints". Prevents wasted questions on code being decommissioned.
- `domain_notes`: A short free-text field for anything that doesn't fit the slots. Capped at 500 chars to prevent prompt hijacking. Framed as context ("This team...") not instructions ("You must...").

### 2b. Extend `AssembledArtefactSet` to carry the context

**File:** `src/lib/engine/prompts/artefact-types.ts`

**Change** the `AssembledArtefactSetSchema` to add an optional field:

```typescript
export const AssembledArtefactSetSchema = RawArtefactSetSchema.extend({
  question_count: z.number().int().min(3).max(5),
  artefact_quality: ArtefactQualitySchema,
  token_budget_applied: z.boolean(),
  truncation_notes: z.array(z.string()).optional(),
  organisation_context: OrganisationContextSchema.optional(),  // ← NEW
});
```

### 2c. Format organisation context into the user prompt

**File:** `src/lib/engine/prompts/prompt-builder.ts`

**Add** a new formatting function:

```typescript
function formatOrganisationContext(artefacts: AssembledArtefactSet): string | undefined {
  const ctx = artefacts.organisation_context;
  if (!ctx) return undefined;

  const sections: string[] = [];

  if (ctx.domain_vocabulary?.length) {
    const terms = ctx.domain_vocabulary
      .map(v => `- **${v.term}**: ${v.definition}`)
      .join('\n');
    sections.push(`### Domain Vocabulary\n\nThe following terms have specific meaning in this codebase:\n\n${terms}`);
  }

  if (ctx.focus_areas?.length) {
    const areas = ctx.focus_areas.map(a => `- ${a}`).join('\n');
    sections.push(`### Focus Areas\n\nThe organisation has asked that questions emphasise these areas where possible:\n\n${areas}`);
  }

  if (ctx.exclusions?.length) {
    const excl = ctx.exclusions.map(e => `- ${e}`).join('\n');
    sections.push(`### Exclusions\n\nDo not generate questions about the following areas (they are being decommissioned or are out of scope):\n\n${excl}`);
  }

  if (ctx.domain_notes?.trim()) {
    sections.push(`### Additional Context\n\n${ctx.domain_notes}`);
  }

  if (!sections.length) return undefined;

  return `## Organisation Context\n\n${sections.join('\n\n')}`;
}
```

**Update** `formatUserPrompt` to include it — insert organisation context *before* the code diff so the LLM reads it early:

```typescript
function formatUserPrompt(artefacts: AssembledArtefactSet): string {
  const sections: (string | undefined)[] = [
    formatAssessmentContext(artefacts),
    formatOrganisationContext(artefacts),   // ← NEW — before artefacts
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

### 2d. Export the new type

**File:** `src/lib/engine/prompts/index.ts`

**Add** to exports:

```typescript
export {
  OrganisationContextSchema,
  type OrganisationContext,
} from './artefact-types';
```

---

## What This Does NOT Do (By Design)

1. **Does not expose the system prompt.** The organisation context is data injected into the user prompt. The system prompt — the Naur framework, the output schema, the constraints — remains locked.

2. **Does not allow free-form instructions.** The `domain_notes` field is capped at 500 characters and framed as context. The structured slots (`focus_areas`, `exclusions`, `domain_vocabulary`) constrain what clients can express to things that genuinely improve question quality.

3. **Does not merge prompts.** There's no "client system prompt" that competes with yours. The architecture is additive: your system prompt defines *how* to assess, the organisation context defines *what domain to assess in*.

4. **Does not create a prompt injection surface.** The structured fields are typed and length-constrained. The `domain_notes` field is the widest opening — 500 chars, positioned after the system prompt has already established the task framing. A determined attacker could try, but the system prompt's constraints section is authoritative.

---

## Token Budget Consideration

Organisation context adds tokens to the user prompt. In the `truncateArtefacts` function, organisation context should be treated as non-truncatable (it's short and high-signal). File contents and diffs are the truncation targets, as they already are.

---

## UI Surface (Future)

In the repository settings page (alongside PRCC and FCS config), an "Assessment Context" panel with:
- Domain vocabulary: key-value pairs (add/remove)
- Focus areas: tag input (max 5)
- Exclusions: tag input (max 5)
- Domain notes: textarea (max 500 chars, placeholder: "Describe any domain-specific context that would help generate better questions. Example: 'This team uses CQRS with event sourcing. Domain events are the primary integration mechanism between bounded contexts.'")

This is V1.x scope — the backend schema is ready, the UI can follow.
