# LLD: V6 — LLM Output Tolerance

## Part A — Human-reviewable

### Purpose

Relax two overly strict validations in the rubric generation pipeline that reject usable LLM output:

1. **Question count overshoot** — the pipeline rejects responses where the LLM returns more questions than requested. The DB and UI already handle variable counts.
2. **Hint length overflow** — the Zod schema rejects hints longer than 200 characters. The DB column is `text` with no constraint.

Both are small, surgical changes to the engine layer. No API, DB, or UI changes required.

### Requirements reference

[docs/requirements/v6-requirements.md](../requirements/v6-requirements.md)

### Behavioural flows

No multi-component interactions — all changes are within a single function call path (`generateQuestions → schema validation`). No sequence diagram needed.

### Invariants

| # | Invariant | Verification |
|---|-----------|--------------|
| I1 | Minimum 3 questions enforced | Zod `.min(3)` on `questions` array; unit test |
| I2 | Questions with < 3 items still produce `validation_failed` | Zod rejects at schema level (returns `malformed_response` from LLM client) |
| I3 | Hints of any length accepted | Removal of `.max(200)` from `QuestionSchema`; unit test |
| I4 | Prompt guides brevity without hard character limit | Prompt text inspection test |

### Acceptance criteria

- [ ] LLM responses with > `question_count` questions are accepted and stored
- [ ] LLM responses with >= 3 questions always pass validation (regardless of `question_count`)
- [ ] LLM responses with < 3 questions are rejected by Zod (`.min(3)`)
- [ ] Hints of any length pass schema validation
- [ ] Prompt no longer contains a hard character limit for hints
- [ ] Prompt still contains brevity guidance for hints
- [ ] All existing tests pass (adjusted for new behaviour)

---

## Part B — Agent-implementable

### Change sites

#### 1. `src/lib/engine/llm/schemas.ts`

**Line 25** — Remove `.max(200)` from hint field:

```typescript
// Before
hint: z.string().max(200).nullable().optional(),

// After
hint: z.string().nullable().optional(),
```

**Line 37** — Remove `.max(5)` from questions array:

```typescript
// Before
questions: z.array(QuestionSchema).min(3).max(5),

// After
questions: z.array(QuestionSchema).min(3),
```

#### 2. `src/lib/engine/generation/generate-questions.ts`

**Lines 56–65** — Remove the strict question count equality check:

```typescript
// Remove this entire block:
if (response.questions.length !== artefacts.question_count) {
  return {
    success: false,
    error: {
      code: 'validation_failed',
      message: `Expected ${artefacts.question_count} questions but received ${response.questions.length}`,
      retryable: true,
    },
  };
}
```

#### 3. `src/lib/engine/prompts/prompt-builder.ts`

**Line 54** — Replace hard character limit with brevity guidance:

```typescript
// Before
- hint: A short guidance hint (max 200 characters) shown to participants ...

// After
- hint: A brief guidance hint shown to participants alongside the question. Keep it concise — one or two sentences. The hint names a recognisable code landmark — a function, type, file, or observable behaviour — that the participant can reason from, WITHOUT revealing any reasoning, rationale, or trade-offs from the reference answer.
```

### BDD specs

```typescript
describe('QuestionSchema', () => {
  describe('Given a question with a hint longer than 200 characters', () => {
    it('then it accepts the question (no character limit enforced)', () => {
      // hint of 300 chars should pass
    });
  });
});

describe('QuestionGenerationResponseSchema', () => {
  describe('Given a response with more than 5 questions', () => {
    it('then it accepts the response (no upper bound on question count)', () => {
      // 7 questions, all valid — should pass
    });
  });

  describe('Given a response with fewer than 3 questions', () => {
    it('then it rejects the response', () => {
      // 2 questions — should fail
    });
  });
});

describe('generateQuestions', () => {
  describe('Given the LLM returns more questions than requested', () => {
    it('then it accepts all questions without error', () => {
      // artefacts.question_count = 3, LLM returns 5 → success
    });
  });

  // Existing test "Given the LLM returns fewer questions than requested"
  // must be updated: with the strict check removed, < 3 questions are
  // now rejected by the Zod schema (malformed_response), not by the
  // equality check (validation_failed). The test should assert
  // error.code === 'malformed_response' or just assert !result.success.
  // Note: the mock client validates against the schema, so a 2-question
  // fixture will be rejected at the schema level.
});

describe('buildQuestionGenerationPrompt', () => {
  describe('Given the system prompt', () => {
    it('then it does not contain a hard character limit for hints', () => {
      // systemPrompt should NOT contain "max 200 characters"
    });

    it('then it contains brevity guidance for hints', () => {
      // systemPrompt should contain "concise" or "brief"
    });
  });
});
```

### Test updates required

| Test file | Change |
|-----------|--------|
| `tests/lib/engine/llm/schemas.test.ts` | Line 172–182: flip expectation — 201-char hint should now pass. Add test for > 5 questions accepted. Add test for < 3 questions rejected. |
| `tests/lib/engine/generation/generate-questions.test.ts` | Line 145–183: update "fewer questions than requested" test — with strict check removed, 2-question response is rejected by Zod at the LLM client level (the mock client calls `safeParse`). Add new test: LLM returns 5 questions when 3 requested → success. |
| `tests/lib/engine/prompts/prompt-builder.test.ts` | Add/update assertion that system prompt does not contain "max 200 characters" and does contain brevity guidance. |

### Files touched

| File | Action |
|------|--------|
| `src/lib/engine/llm/schemas.ts` | Edit (2 lines) |
| `src/lib/engine/generation/generate-questions.ts` | Edit (remove 10 lines) |
| `src/lib/engine/prompts/prompt-builder.ts` | Edit (1 line) |
| `tests/lib/engine/llm/schemas.test.ts` | Edit (flip + add tests) |
| `tests/lib/engine/generation/generate-questions.test.ts` | Edit (update + add tests) |
| `tests/lib/engine/prompts/prompt-builder.test.ts` | Edit (add assertion) |

### Estimated diff size

~60 lines production, ~40 lines tests = ~100 lines total. Well within single-PR budget.
