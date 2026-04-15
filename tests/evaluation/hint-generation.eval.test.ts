// Adversarial evaluation tests for issue #219 — Story 1.1: hint generation in rubric pipeline.
//
// Probes gaps in the implementation's own test suite. Failures are findings —
// do NOT fix the implementation in this file.

import { describe, it, expect } from 'vitest';
import { QuestionSchema } from '@/lib/engine/llm/schemas';
import { QUESTION_GENERATION_SYSTEM_PROMPT } from '@/lib/engine/prompts/prompt-builder';

// ---------------------------------------------------------------------------
// Gap 1: The test-author tested that a 201-char hint is rejected but did not
// test that a 200-char hint (the exact boundary) is accepted. Zod's .max(200)
// is inclusive, so 200 must pass.
// ---------------------------------------------------------------------------

describe('QuestionSchema hint boundary', () => {
  const validQuestion = {
    question_number: 1,
    question_text: 'Why was this change introduced?',
    weight: 2,
    naur_layer: 'design_justification' as const,
    reference_answer: 'To fix a race condition.',
  };

  describe('Given a hint of exactly 200 characters', () => {
    it('then it accepts the question (boundary is inclusive)', () => {
      const hint200 = 'a'.repeat(200);
      const result = QuestionSchema.safeParse({ ...validQuestion, hint: hint200 });

      expect(result.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2: LLD Invariant #1 states "Hints never reveal reference answer content
// — LLM prompt constraint". The verification method is explicitly the prompt
// text. The test-author only checked that 'hint' appears somewhere in the
// system prompt; the constraint instruction itself was not verified.
// ---------------------------------------------------------------------------

describe('QUESTION_GENERATION_SYSTEM_PROMPT hint non-disclosure constraint', () => {
  describe('Given the system prompt', () => {
    it('explicitly instructs the LLM not to reveal reference answer content in hints', () => {
      // Case-insensitive search; the exact wording may evolve, but the
      // semantic constraint must be present.
      const lower = QUESTION_GENERATION_SYSTEM_PROMPT.toLowerCase();
      const referencesToReferenceAnswer =
        lower.includes('reference answer') || lower.includes('reference_answer');
      const expressesNonDisclosure =
        lower.includes('without revealing') ||
        lower.includes('do not reveal') ||
        lower.includes('not reveal') ||
        lower.includes('never reveal');

      expect(referencesToReferenceAnswer).toBe(true);
      expect(expressesNonDisclosure).toBe(true);
    });

    it('instructs the LLM to set hint to null when generation is not possible', () => {
      const lower = QUESTION_GENERATION_SYSTEM_PROMPT.toLowerCase();
      // The prompt must provide a null fallback path so hint failure
      // does not block rubric generation (LLD Invariant #2 / AC-4).
      expect(lower).toContain('null');
    });
  });
});
