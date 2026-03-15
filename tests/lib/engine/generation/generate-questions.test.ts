import { describe, it, expect, vi } from 'vitest';
import { generateQuestions } from '@/lib/engine/generation/generate-questions';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import { questionGenerationFixture } from '../../../fixtures/llm/question-generation';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { QuestionGenerationResponse } from '@/lib/engine/llm/schemas';
import { QuestionGenerationResponseSchema } from '@/lib/engine/llm/schemas';

const codeOnlyArtefacts: AssembledArtefactSet = {
  artefact_type: 'pull_request',
  pr_diff: '--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new',
  file_listing: [
    { path: 'src/pay.ts', additions: 5, deletions: 2, status: 'modified' },
  ],
  file_contents: [
    { path: 'src/pay.ts', content: 'export function pay() {}' },
  ],
  question_count: 3,
  artefact_quality: 'code_only',
  token_budget_applied: false,
};

const fullArtefacts: AssembledArtefactSet = {
  ...codeOnlyArtefacts,
  pr_description: 'Fix race condition in payment processor',
  test_files: [
    { path: 'tests/pay.test.ts', content: 'it("pays", () => {})' },
  ],
  linked_issues: [
    { title: 'Race condition bug', body: 'Duplicate charges under load' },
  ],
  context_files: [
    { path: 'docs/design/payments.md', content: '# Payment Design' },
  ],
  question_count: 5,
  artefact_quality: 'code_requirements_and_design',
};

function fiveQuestionResponse(): QuestionGenerationResponse {
  return {
    questions: [
      {
        question_number: 1,
        question_text: 'Why was this change introduced?',
        weight: 3,
        naur_layer: 'world_to_program',
        reference_answer: 'To fix a race condition.',
      },
      {
        question_number: 2,
        question_text: 'What domain behaviour does this handle?',
        weight: 2,
        naur_layer: 'world_to_program',
        reference_answer: 'Payment processing under high load.',
      },
      {
        question_number: 3,
        question_text: 'Why was Redis chosen for locking?',
        weight: 2,
        naur_layer: 'design_justification',
        reference_answer: 'Distributed locking with TTL support.',
      },
      {
        question_number: 4,
        question_text: 'What trade-offs exist in this approach?',
        weight: 2,
        naur_layer: 'design_justification',
        reference_answer: 'Redis dependency vs simpler DB locks.',
      },
      {
        question_number: 5,
        question_text: 'How would you add a new payment provider?',
        weight: 1,
        naur_layer: 'modification_capacity',
        reference_answer: 'Implement the PaymentProvider interface.',
      },
    ],
    artefact_quality: 'code_requirements_and_design',
    artefact_quality_note: 'Full artefact set available.',
  };
}

describe('generateQuestions', () => {
  describe('Given valid artefacts and question count of 3', () => {
    it('then it returns 3 questions with weights and reference answers', async () => {
      const llmClient = createMockLLMClient();
      const result = await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.questions).toHaveLength(3);
      for (const q of result.data.questions) {
        expect(q.weight).toBeGreaterThanOrEqual(1);
        expect(q.weight).toBeLessThanOrEqual(3);
        expect(q.reference_answer).toBeTruthy();
        expect(q.question_text).toBeTruthy();
      }
    });
  });

  describe('Given valid artefacts and question count of 5', () => {
    it('then it returns 5 questions across all three Naur layers', async () => {
      const responses = new Map([
        [QuestionGenerationResponseSchema, fiveQuestionResponse()],
      ]);
      const llmClient = createMockLLMClient({ responses });
      const result = await generateQuestions({
        artefacts: fullArtefacts,
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.questions).toHaveLength(5);
      const layers = new Set(result.data.questions.map(q => q.naur_layer));
      expect(layers).toContain('world_to_program');
      expect(layers).toContain('design_justification');
      expect(layers).toContain('modification_capacity');
    });
  });

  describe('Given the LLM returns malformed output', () => {
    it('then it returns an error result', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'malformed_response', message: 'Invalid JSON' },
      });
      const result = await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('malformed_response');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('Given the LLM returns fewer questions than requested', () => {
    it('then it returns a validation_failed error', async () => {
      const twoQuestions: QuestionGenerationResponse = {
        questions: [
          {
            question_number: 1,
            question_text: 'Why was this change introduced?',
            weight: 3,
            naur_layer: 'world_to_program',
            reference_answer: 'To fix a race condition.',
          },
          {
            question_number: 2,
            question_text: 'What does this change do?',
            weight: 2,
            naur_layer: 'design_justification',
            reference_answer: 'Adds a distributed lock.',
          },
        ],
        artefact_quality: 'code_only',
        artefact_quality_note: 'Only source code.',
      };
      const responses = new Map([
        [QuestionGenerationResponseSchema, twoQuestions],
      ]);
      const llmClient = createMockLLMClient({ responses });
      const result = await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('validation_failed');
      expect(result.error.message).toContain('3');
      expect(result.error.message).toContain('2');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('Given code-only artefacts', () => {
    it('then it returns questions with artefact_quality flag set to code_only', async () => {
      const llmClient = createMockLLMClient();
      const result = await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.artefact_quality).toBe('code_only');
    });
  });

  describe('Given optional model and maxTokens overrides', () => {
    it('then it passes them through to the LLM client', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: questionGenerationFixture.valid,
      });
      const llmClient = { generateStructured };

      await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
        model: 'claude-opus-4-20250514',
        maxTokens: 8192,
      });

      expect(generateStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-20250514',
          maxTokens: 8192,
        }),
      );
    });
  });

  describe('Given the LLM client is called', () => {
    it('then it passes the correct prompt and schema', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: questionGenerationFixture.valid,
      });
      const llmClient = { generateStructured };

      await generateQuestions({
        artefacts: codeOnlyArtefacts,
        llmClient,
      });

      expect(generateStructured).toHaveBeenCalledOnce();
      const call = generateStructured.mock.calls[0][0];
      expect(call.systemPrompt).toContain('software comprehension assessor');
      expect(call.prompt).toContain('Question count: 3');
      expect(call.schema).toBe(QuestionGenerationResponseSchema);
    });
  });
});
