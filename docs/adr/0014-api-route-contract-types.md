---
id: ADR-0014
title: Inline contract types in API route files
status: Accepted
date: 2026-03-24
---

## Context

Next.js App Router uses file-based routing: the URL of an API endpoint is determined by
its file path, and the HTTP method by the exported function name. There is no C#-style
`[HttpGet("/api/assessments")]` attribute that makes the contract explicit at a glance.

Without additional discipline, a reader must either know the Next.js routing convention
and trace through the implementation code, or open the design doc, to understand what
URL the file handles, what parameters it accepts, and what it returns.

## Decision

Every API route file must declare its full contract inline as TypeScript types, immediately
after the import block. The block must include:

1. A JSDoc comment on the handler naming the HTTP method and path, listing all parameters
   (query or path) with types, defaults, and required/optional status, and the possible
   response codes.
2. An interface for each distinct response body shape.
3. The response type annotated on the variable passed to `json()` so TypeScript enforces
   shape conformance at compile time.

---

### Template A — GET list with query parameters

File: `src/app/api/assessments/route.ts` → `GET /api/assessments`

```typescript
/**
 * GET /api/assessments
 *
 * Query parameters:
 *   org_id    (string, required) — scope to this organisation
 *   type      ('prcc'|'fcs', optional) — filter by assessment type
 *   page      (integer ≥ 1, default 1)
 *   per_page  (integer 1–100, default 20)
 *
 * Returns 200 AssessmentsResponse | 400 invalid params | 401 unauthenticated
 */
interface AssessmentListItem {
  id: string;
  type: 'prcc' | 'fcs';
  // ...
}

interface AssessmentsResponse {
  assessments: AssessmentListItem[];
  total: number;
  page: number;
  per_page: number;
}

// Inside handler:
const body: AssessmentsResponse = { assessments, total, page, per_page };
return json(body);
```

---

### Template B — GET detail with path parameter

File: `src/app/api/assessments/[id]/route.ts` → `GET /api/assessments/{id}`

```typescript
/**
 * GET /api/assessments/{id}
 *
 * Path parameters:
 *   id  (string, required) — assessment UUID
 *
 * Returns 200 AssessmentDetailResponse | 401 unauthenticated | 403 forbidden | 404 not found
 */
interface AssessmentDetailResponse {
  id: string;
  type: 'prcc' | 'fcs';
  status: AssessmentStatus;
  questions: QuestionItem[];
  // ...
}

// Inside handler:
const body: AssessmentDetailResponse = { ... };
return json(body);
```

---

### Template C — POST with request body and path parameter

File: `src/app/api/assessments/[id]/answers/route.ts` → `POST /api/assessments/{id}/answers`

```typescript
/**
 * POST /api/assessments/{id}/answers
 *
 * Path parameters:
 *   id  (string, required) — assessment UUID
 *
 * Request body (JSON):
 *   answers  (AnswerInput[], required) — one entry per question
 *
 * Returns 200 AnswersResponse | 400 invalid body | 401 unauthenticated | 422 validation failed
 */
interface AnswerInput {
  question_id: string;
  answer_text: string;
}

interface AnswerRequestBody {
  answers: AnswerInput[];
}

interface AnswersResponse {
  status: 'accepted' | 'relevance_failed';
  explanations?: RelevanceExplanation[];
}

// Inside handler:
const parsed: AnswerRequestBody = await validateBody(request, answerSchema);
// ...
const body: AnswersResponse = { status: 'accepted' };
return json(body);
```

---

### Template D — PUT (update) with path parameter and request body

File: `src/app/api/assessments/[id]/route.ts` → `PUT /api/assessments/{id}`

```typescript
/**
 * PUT /api/assessments/{id}
 *
 * Path parameters:
 *   id  (string, required) — assessment UUID
 *
 * Request body (JSON):
 *   action  ('skip'|'close', required)
 *   reason  (string, optional) — required when action is 'skip'
 *
 * Returns 200 AssessmentUpdateResponse | 400 invalid body | 401 unauthenticated | 403 forbidden | 404 not found
 */
interface AssessmentUpdateBody {
  action: 'skip' | 'close';
  reason?: string;
}

interface AssessmentUpdateResponse {
  id: string;
  status: AssessmentStatus;
}

// Inside handler:
const parsed: AssessmentUpdateBody = await validateBody(request, updateSchema);
// ...
const body: AssessmentUpdateResponse = { id, status };
return json(body);
```

---

## Consequences

- **Positive:** A reader understands the full contract from the route file alone — no
  design doc required for day-to-day development.
- **Positive:** TypeScript enforces that the handler return value matches the declared
  shape; contract drift becomes a compile error.
- **Positive:** The interface types are a machine-readable source of truth that can feed
  OpenAPI generation tooling later.
- **Negative:** Slight duplication with L4 design contracts in `docs/design/`. The route
  file is the source of truth for the *current implemented contract*; the design doc
  remains the record of intent and rationale.
