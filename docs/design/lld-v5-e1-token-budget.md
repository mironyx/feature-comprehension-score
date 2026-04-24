# LLD — V5 Epic 1: Model-Aware Token Budget Enforcement

## Change Log

| Date | Author | Changes |
|------|--------|---------|
| 2026-04-25 | Claude | Initial LLD — all three stories |

## Design Reference

- Requirements: `docs/requirements/v5-requirements.md` — Epic 1
- HLD: `docs/design/v1-design.md` — artefact pipeline
- ADR-0015: OpenRouter as LLM gateway
- ADR-0023: Tool-use loop for rubric generation

---

## Part A — Human-Reviewable

### Purpose

Wire the existing `truncateArtefacts()` function into the assessment pipeline with a model-aware token budget. The token budget is derived from the model's context limit (fetched from the OpenRouter API), not a fixed constant. Truncation metadata is persisted in the database and surfaced on the results page so users can make informed decisions about enabling agentic retrieval.

### Behavioural Flows

#### Story 1.1 + 1.2: Token budget enforcement during rubric generation

```mermaid
sequenceDiagram
    participant TRG as triggerRubricGeneration
    participant EA as extractArtefacts
    participant ORL as OpenRouter /models API
    participant TF as truncateArtefacts()
    participant FR as finaliseRubric

    TRG->>EA: extract artefacts
    EA->>EA: fetch PRs, issues, org context
    EA->>EA: mergeIssueContent(raw, issues)
    EA->>ORL: getModelContextLimit(modelId)
    ORL-->>EA: context_length (or fallback 130K)
    EA->>TF: truncateArtefacts(merged, {tokenBudget, questionCount})
    TF-->>EA: AssembledArtefactSet (with truncation_notes)
    EA-->>TRG: assembled artefacts
    TRG->>FR: finaliseRubric(artefacts)
    FR->>FR: persistRubricFinalisation (includes truncation fields)
```

#### Story 1.3: Truncation details on results page

```mermaid
sequenceDiagram
    participant User as Org Admin
    participant RP as Results Page
    participant DB as assessments table

    User->>RP: GET /assessments/[id]/results
    RP->>DB: fetch assessment row
    DB-->>RP: row (includes token_budget_applied, truncation_notes)
    alt token_budget_applied = true
        RP->>User: render TruncationDetailsCard
        alt agentic retrieval not enabled
            RP->>User: show recommendation message
        end
    else token_budget_applied = false/null
        RP->>User: no truncation section
    end
```

### Structural Overview

```mermaid
graph TD
    subgraph "Adapter Layer"
        ORM["src/lib/openrouter/\nmodel-limits.ts"]
    end
    subgraph "Pipeline (service.ts)"
        EA["extractArtefacts()"]
        FR["finaliseRubric()"]
        PF["persistRubricFinalisation()"]
    end
    subgraph "Engine (pure domain)"
        TA["truncateArtefacts()"]
    end
    subgraph "DB"
        AT["assessments table\n+token_budget_applied\n+truncation_notes"]
        FN["finalise_rubric RPC\n+truncation params"]
    end
    subgraph "UI"
        TDC["TruncationDetailsCard"]
        RP["Results Page"]
    end

    ORM -->|context_length| EA
    EA -->|RawArtefactSet| TA
    TA -->|AssembledArtefactSet| EA
    EA --> FR
    FR --> PF
    PF --> FN
    FN --> AT
    AT --> RP
    RP --> TDC
```

### Invariants

| # | Invariant | Verification |
|---|-----------|-------------|
| I1 | Token budget = `Math.floor(contextLimit * 0.8)` | Unit test: budget derivation |
| I2 | File listing is never truncated | Existing test in `truncate.test.ts` |
| I3 | Context limit is cached per model per process lifetime | Unit test: mock fetch, assert single call for repeated lookups |
| I4 | OpenRouter API failure does not block rubric generation | Unit test: network error → fallback 130K + warning log |
| I5 | `token_budget_applied` reflects actual truncation state, never hardcoded | Unit test: wiring produces correct value |
| I6 | Truncation details section only renders when `token_budget_applied = true` | Component test |
| I7 | `truncation_notes` is persisted as `jsonb` in DB | Schema test: `db diff` empty after migration |

### Acceptance Criteria

See each story section in Part B.

---

## Part B — Agent-Implementable

### Story 1.1: Model Context Limit Lookup from OpenRouter

**Files:**

| File | Action | Layer |
|------|--------|-------|
| `src/lib/openrouter/model-limits.ts` | Create | Adapter |
| `tests/lib/openrouter/model-limits.test.ts` | Create | Test |

#### Internal Decomposition

**`getModelContextLimit(modelId: string): Promise<number>`**

Pure adapter function. No framework imports, no Supabase.

```typescript
// src/lib/openrouter/model-limits.ts

const DEFAULT_CONTEXT_LIMIT = 130_000;
const cache = new Map<string, number>();

export async function getModelContextLimit(modelId: string): Promise<number> {
  const cached = cache.get(modelId);
  if (cached !== undefined) return cached;

  const limit = await fetchContextLimitFromApi(modelId);
  cache.set(modelId, limit);
  return limit;
}
```

**`fetchContextLimitFromApi(modelId: string): Promise<number>`**

- Calls `GET https://openrouter.ai/api/v1/models` with `Authorization: Bearer ${OPENROUTER_API_KEY}`.
- Parses response as `{ data: Array<{ id: string; context_length: number | null }> }`.
- Finds the entry where `id === modelId`.
- If found and `context_length` is a positive number, returns it.
- If not found or `context_length` is null, logs warning and returns `DEFAULT_CONTEXT_LIMIT`.
- If fetch fails (network error, non-2xx), logs warning and returns `DEFAULT_CONTEXT_LIMIT`.

**Exported constant:**

```typescript
export const DEFAULT_CONTEXT_LIMIT = 130_000;
```

**Model ID resolution:**

The model ID comes from `process.env['OPENROUTER_MODEL']` or the `DEFAULT_MODEL` constant (`'anthropic/claude-sonnet-4-6'`) in `src/lib/engine/llm/client.ts`. A new helper `getConfiguredModelId()` is needed:

```typescript
// src/lib/openrouter/model-limits.ts
import { DEFAULT_MODEL } from '@/lib/engine/llm/client';

export function getConfiguredModelId(): string {
  return process.env['OPENROUTER_MODEL'] ?? DEFAULT_MODEL;
}
```

#### BDD Specs

```typescript
describe('getModelContextLimit', () => {
  describe('Given the OpenRouter API returns a valid context_length', () => {
    it('should return the context_length for the matching model', async () => {
      // Mock fetch: { data: [{ id: 'anthropic/claude-sonnet-4-6', context_length: 200000 }] }
      // expect(result).toBe(200000)
    });
  });

  describe('Given the model is not found in the API response', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT and log a warning', async () => {
      // Mock fetch: { data: [{ id: 'other-model', context_length: 100000 }] }
      // expect(result).toBe(130000)
    });
  });

  describe('Given the API returns context_length: null for the model', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT and log a warning', async () => {
      // Mock fetch: { data: [{ id: 'anthropic/claude-sonnet-4-6', context_length: null }] }
      // expect(result).toBe(130000)
    });
  });

  describe('Given the OpenRouter API call fails', () => {
    it('should fall back to DEFAULT_CONTEXT_LIMIT and log a warning', async () => {
      // Mock fetch: throw network error
      // expect(result).toBe(130000)
    });
  });

  describe('Given the same model is requested twice', () => {
    it('should return the cached value without a second API call', async () => {
      // Call twice, assert fetch called once
    });
  });
});

describe('getConfiguredModelId', () => {
  it('should return OPENROUTER_MODEL env var when set', () => {});
  it('should return DEFAULT_MODEL when env var is unset', () => {});
});
```

---

### Story 1.2: Wire Truncation into the Artefact Pipeline

**Files:**

| File | Action | Layer |
|------|--------|-------|
| `src/app/api/fcs/service.ts` | Edit (`extractArtefacts`) | Pipeline |
| `tests/api/fcs/service-truncation.test.ts` | Create | Test |

#### Internal Decomposition

**Change to `extractArtefacts()` (line 563–564):**

Before (current):
```typescript
const merged = mergeIssueContent(raw, issueContent);
return { ...merged, question_count: repoInfo.questionCount, artefact_quality: classifyArtefactQuality(merged), token_budget_applied: false, organisation_context, comprehension_depth: comprehensionDepth };
```

After:
```typescript
const merged = mergeIssueContent(raw, issueContent);
const contextLimit = await getModelContextLimit(getConfiguredModelId());
const tokenBudget = Math.floor(contextLimit * 0.8);
const assembled = truncateArtefacts(merged, {
  questionCount: repoInfo.questionCount,
  tokenBudget,
});
return { ...assembled, organisation_context, comprehension_depth: comprehensionDepth };
```

**New imports in `service.ts`:**
```typescript
import { truncateArtefacts } from '@/lib/engine/prompts/truncate';
import { getModelContextLimit, getConfiguredModelId } from '@/lib/openrouter/model-limits';
```

**Remove:**
- `import { classifyArtefactQuality }` — `truncateArtefacts()` already calls it internally.
- The hardcoded `token_budget_applied: false`.

**Logging enhancement in `logArtefactSummary()`:**

Add `truncation_notes` to the log payload (line 287–296). It's already logging `tokenBudgetApplied` — add `truncationNotes` when present:

```typescript
...(artefacts.truncation_notes && { truncationNotes: artefacts.truncation_notes }),
```

#### BDD Specs

```typescript
describe('extractArtefacts truncation wiring', () => {
  describe('Given an artefact set that fits within the model context budget', () => {
    it('should return token_budget_applied: false with no truncation_notes', async () => {});
  });

  describe('Given an artefact set that exceeds the model context budget', () => {
    it('should return token_budget_applied: true with truncation_notes', async () => {});
  });

  describe('Given the model context limit is fetched successfully', () => {
    it('should compute tokenBudget as Math.floor(contextLimit * 0.8)', async () => {});
  });

  describe('Given the OpenRouter API fails', () => {
    it('should use the fallback context limit for budget computation', async () => {});
  });
});
```

**Note:** These are integration-level tests that exercise `extractArtefacts` with mocked GitHub and OpenRouter dependencies. The truncation logic itself is already covered by 10 existing tests in `truncate.test.ts`.

---

### Story 1.3: Surface Truncation Details on Assessment Results

**Files:**

| File | Action | Layer |
|------|--------|-------|
| `supabase/schemas/tables.sql` | Edit (add columns) | DB |
| `supabase/schemas/functions.sql` | Edit (`finalise_rubric` overload) | DB |
| `src/app/api/fcs/service.ts` | Edit (`persistRubricFinalisation`) | BE |
| `src/components/assessment/TruncationDetailsCard.tsx` | Create | FE |
| `src/app/assessments/[id]/results/page.tsx` | Edit (add card) | FE |
| `tests/components/truncation-details-card.test.ts` | Create | Test |

#### Schema Changes

**`supabase/schemas/tables.sql`** — add after the rubric observability block (after line 166):

```sql
  -- Token budget enforcement (V5 Epic 1). Populated on rubric generation.
  -- See docs/design/lld-v5-e1-token-budget.md §1.3.
  token_budget_applied     boolean,
  truncation_notes         jsonb,
```

**`supabase/schemas/functions.sql`** — update the observability overload of `finalise_rubric` (line 313–350):

Add two new parameters:

```sql
CREATE OR REPLACE FUNCTION finalise_rubric(
  p_assessment_id          uuid,
  p_org_id                 uuid,
  p_questions              jsonb,
  p_rubric_input_tokens    integer,
  p_rubric_output_tokens   integer,
  p_rubric_tool_call_count integer,
  p_rubric_tool_calls      jsonb,
  p_rubric_duration_ms     integer,
  p_token_budget_applied   boolean DEFAULT NULL,
  p_truncation_notes       jsonb   DEFAULT NULL
)
```

And add to the UPDATE SET clause:

```sql
      token_budget_applied       = p_token_budget_applied,
      truncation_notes           = p_truncation_notes,
```

**Migration:** Generated via `npx supabase db diff -f v5-token-budget-columns`. Not hand-authored.

#### Backend Changes

**`persistRubricFinalisation`** — add truncation params to the RPC call:

```typescript
// In RubricPersistParams, add:
tokenBudgetApplied: boolean;
truncationNotes: string[] | undefined;

// In the .rpc('finalise_rubric', { ... }) call, add:
p_token_budget_applied: params.tokenBudgetApplied,
p_truncation_notes: params.truncationNotes ? (params.truncationNotes as unknown as Json) : null,
```

**`finaliseRubric`** — pass truncation data from artefacts to persist:

```typescript
await persistRubricFinalisation(params.adminSupabase, {
  assessmentId, orgId, questions: result.rubric.questions, observability: result.observability,
  tokenBudgetApplied: params.artefacts.token_budget_applied,
  truncationNotes: params.artefacts.truncation_notes,
});
```

#### Frontend — TruncationDetailsCard

```typescript
// src/components/assessment/TruncationDetailsCard.tsx

export interface TruncationDetailsCardProps {
  readonly token_budget_applied: boolean | null;
  readonly truncation_notes: readonly string[] | null;
  readonly rubric_tool_call_count: number | null; // to check if retrieval was enabled
}

export default function TruncationDetailsCard(
  props: TruncationDetailsCardProps,
): React.ReactElement | null {
  if (!props.token_budget_applied) return null;

  const notes = props.truncation_notes ?? [];
  const retrievalEnabled = (props.rubric_tool_call_count ?? 0) > 0;

  return (
    <section className="bg-surface border border-border rounded-md shadow-sm p-card-pad">
      <h3 className="text-heading-md font-display">Truncation details</h3>
      <ul className="list-disc pl-5 mt-2 space-y-1">
        {notes.map((note, i) => (
          <li key={i} className="text-body text-text-secondary">{note}</li>
        ))}
      </ul>
      {!retrievalEnabled && (
        <p className="text-body text-text-secondary mt-3">
          Some artefacts were truncated to fit the model&apos;s context window.
          Enable retrieval in organisation settings to let the LLM fetch
          additional content on demand.
        </p>
      )}
    </section>
  );
}
```

#### Results Page Integration

In `AdminAggregateView`, add `TruncationDetailsCard` above `RetrievalDetailsCard`:

```tsx
<TruncationDetailsCard
  token_budget_applied={assessment.token_budget_applied}
  truncation_notes={assessment.truncation_notes as readonly string[] | null}
  rubric_tool_call_count={assessment.rubric_tool_call_count}
/>
<RetrievalDetailsCard ... />
```

#### BDD Specs

```typescript
describe('TruncationDetailsCard', () => {
  describe('Given token_budget_applied is true', () => {
    it('should render the truncation details section', () => {});

    it('should render each truncation note as a list item', () => {});
  });

  describe('Given token_budget_applied is true and retrieval was not enabled', () => {
    it('should render the retrieval recommendation message', () => {});
  });

  describe('Given token_budget_applied is true and retrieval was enabled', () => {
    it('should not render the retrieval recommendation message', () => {});
  });

  describe('Given token_budget_applied is false', () => {
    it('should render nothing', () => {});
  });

  describe('Given token_budget_applied is null', () => {
    it('should render nothing', () => {});
  });
});
```

---

## Task Summary

| # | Task | Story | Estimated PR diff | Dependencies |
|---|------|-------|-------------------|-------------|
| T1 | Model context limit lookup from OpenRouter | 1.1 | ~150 lines | None |
| T2 | Wire truncation into artefact pipeline | 1.2 | ~100 lines | T1 |
| T3 | Surface truncation details on results | 1.3 | ~200 lines | T2 |
