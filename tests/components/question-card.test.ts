// Tests for QuestionCard — hint display in participant answer form.
// Design reference: docs/design/lld-v3-e1-hints.md § Story 1.3
// Issue: #221

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: unknown; className?: string }) => ({
    type: 'div',
    props: { className, children },
  }),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: unknown }) => ({
    type: 'span',
    props: { children },
  }),
}));

vi.mock('@/components/relevance-warning', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import QuestionCard from '@/components/question-card';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type RelevanceResult =
  | undefined
  | { question_id: string; is_relevant: boolean | null; explanation: string | null; attempts_remaining: number };

type QuestionCardPropsBase = {
  questionId: string;
  questionNumber: number;
  naurLayer: 'world_to_program' | 'design_justification' | 'modification_capacity';
  questionText: string;
  hint: string | null;
  answer: string;
  locked: boolean;
  relevanceResult: RelevanceResult;
  onChange: (id: string, val: string) => void;
};

function makeProps(overrides: Partial<QuestionCardPropsBase> = {}): QuestionCardPropsBase {
  return {
    questionId: 'q-001',
    questionNumber: 1,
    naurLayer: 'world_to_program',
    questionText: 'What does the scoring engine do?',
    hint: null,
    answer: '',
    locked: false,
    relevanceResult: undefined,
    onChange: vi.fn(),
    ...overrides,
  };
}

/** Render QuestionCard to a JSON string for structural assertions. */
function render(props: QuestionCardPropsBase): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.stringify(QuestionCard(props as any));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuestionCard — hint display', () => {
  describe('Given hint is a non-null string', () => {
    it('then renders the hint text verbatim', () => {
      // Property 1 & 5 [lld §Story 1.3]: hint text is rendered, content matches prop
      const json = render(makeProps({ hint: 'Describe 2–3 specific scenarios and explain the design rationale.' }));
      expect(json).toContain('Describe 2\u20133 specific scenarios and explain the design rationale.');
    });

    it('then renders the hint in italic style', () => {
      // Property 4 [lld §Story 1.3, AC #6]: hint element has italic class
      const json = render(makeProps({ hint: 'Some guidance hint.' }));
      expect(json).toContain('italic');
    });

    it('then renders the hint with muted text colour class co-located with the hint text', () => {
      // Property 4 [lld §Story 1.3, AC #6]: the hint paragraph element carries text-text-secondary.
      // Verify by locating the hint text in the serialised tree and checking the nearest
      // preceding className string contains text-text-secondary (the class used elsewhere on
      // other spans is in a different node, so we scan the className that lives on the same
      // element as the hint children).
      const json = render(makeProps({ hint: 'Some guidance hint.' }));
      const hintElementMatch = /"className":"([^"]*)","children":"Some guidance hint\."/.exec(json);
      expect(hintElementMatch).not.toBeNull();
      expect(hintElementMatch?.[1]).toContain('text-text-secondary');
    });

    it('then renders the hint before the answer textarea', () => {
      // Property 3 [lld §Story 1.3]: ordering — hint appears before textarea in serialised tree
      const json = render(makeProps({ hint: 'Ordering hint text.' }));
      const hintPos = json.indexOf('Ordering hint text.');
      const textareaPos = json.indexOf('textarea');
      expect(hintPos).toBeGreaterThanOrEqual(0);
      expect(textareaPos).toBeGreaterThanOrEqual(0);
      expect(hintPos).toBeLessThan(textareaPos);
    });
  });

  describe('Given hint is null', () => {
    it('then renders no hint element (no italic class in output)', () => {
      // Property 2 [lld §Story 1.3, invariant #3]: null hint → no hint UI element, no empty space.
      // The question text itself is present, so the card still renders.
      const json = render(makeProps({ hint: null, questionText: 'Does it render correctly?' }));
      expect(json).toContain('Does it render correctly?');
      // A hint paragraph would carry the "italic" class — absent when hint is null
      expect(json).not.toContain('italic');
    });

    it('then the textarea is still present', () => {
      // Regression guard: null hint must not suppress the textarea
      const json = render(makeProps({ hint: null }));
      expect(json).toContain('textarea');
    });
  });
});

// Issue #335 — distinguish LLM evaluation failure (null) from genuine irrelevance (false).
// React.createElement preserves props on the element object; JSON.stringify exposes them
// as `"props":{"variant":...}` so we can assert on the variant prop without rendering.
describe('QuestionCard — relevance result variants', () => {
  function makeRelevance(is_relevant: boolean | null): RelevanceResult {
    return { question_id: 'q-001', is_relevant, explanation: 'because', attempts_remaining: 2 };
  }

  it('Given is_relevant is false, then it passes variant="irrelevant" to RelevanceWarning', () => {
    const json = render(makeProps({ relevanceResult: makeRelevance(false) }));
    expect(json).toContain('"variant":"irrelevant"');
  });

  it('Given is_relevant is null (LLM failed), then it passes variant="evaluation_failed", not "irrelevant"', () => {
    const json = render(makeProps({ relevanceResult: makeRelevance(null) }));
    expect(json).toContain('"variant":"evaluation_failed"');
    expect(json).not.toContain('"variant":"irrelevant"');
  });

  it('Given is_relevant is true, then no RelevanceWarning is rendered', () => {
    const json = render(makeProps({ relevanceResult: makeRelevance(true) }));
    expect(json).not.toContain('"variant":');
  });

  it('Given relevanceResult is undefined, then no RelevanceWarning is rendered', () => {
    const json = render(makeProps({ relevanceResult: undefined }));
    expect(json).not.toContain('"variant":');
  });
});
