import { describe, it, expect } from 'vitest';
import {
  AdditionalContextSuggestionSchema,
  QuestionGenerationResponseSchema,
  QuestionSchema,
} from '@/lib/engine/llm/schemas';

describe('AdditionalContextSuggestionSchema', () => {
  it('then it accepts a valid suggestion', () => {
    const result = AdditionalContextSuggestionSchema.safeParse({
      artefact_type: 'design_document',
      description: 'Architecture doc explaining module boundaries',
      expected_benefit: 'Would enable deeper design justification questions',
    });

    expect(result.success).toBe(true);
  });

  it('then it rejects a suggestion with missing fields', () => {
    const result = AdditionalContextSuggestionSchema.safeParse({
      artefact_type: 'design_document',
    });

    expect(result.success).toBe(false);
  });
});

describe('QuestionGenerationResponseSchema additional_context_suggestions', () => {
  const validBase = {
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
        question_text: 'Why was this approach chosen?',
        weight: 2,
        naur_layer: 'design_justification',
        reference_answer: 'Distributed lock via Redis.',
      },
      {
        question_number: 3,
        question_text: 'How would you extend this?',
        weight: 1,
        naur_layer: 'modification_capacity',
        reference_answer: 'Add a new lock key pattern.',
      },
    ],
    artefact_quality: 'code_only',
    artefact_quality_note: 'Only source code changes were available.',
  };

  describe('Given a response without additional_context_suggestions', () => {
    it('then it accepts the response (field is optional)', () => {
      const result = QuestionGenerationResponseSchema.safeParse(validBase);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.additional_context_suggestions).toBeUndefined();
      }
    });
  });

  describe('Given a response with valid additional_context_suggestions', () => {
    it('then it accepts and parses the suggestions', () => {
      const result = QuestionGenerationResponseSchema.safeParse({
        ...validBase,
        additional_context_suggestions: [
          {
            artefact_type: 'design_document',
            description: 'Architecture doc for the payment module',
            expected_benefit: 'Would enable questions about module boundary decisions',
          },
          {
            artefact_type: 'requirements_spec',
            description: 'Payment processing requirements',
            expected_benefit: 'Would enable domain intent questions beyond code inference',
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.additional_context_suggestions).toHaveLength(2);
        expect(result.data.additional_context_suggestions![0].artefact_type).toBe(
          'design_document',
        );
      }
    });
  });

  describe('Given a response with an empty additional_context_suggestions array', () => {
    it('then it accepts the response (no suggestions needed)', () => {
      const result = QuestionGenerationResponseSchema.safeParse({
        ...validBase,
        additional_context_suggestions: [],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.additional_context_suggestions).toEqual([]);
      }
    });
  });

  describe('Given a response with malformed additional_context_suggestions', () => {
    it('then it rejects suggestions with missing required fields', () => {
      const result = QuestionGenerationResponseSchema.safeParse({
        ...validBase,
        additional_context_suggestions: [
          {
            artefact_type: 'design_document',
            // missing description and expected_benefit
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });
});

const validQuestion = {
  question_number: 1,
  question_text: 'Why was this change introduced?',
  weight: 2,
  naur_layer: 'design_justification',
  reference_answer: 'To fix a race condition.',
};

describe('QuestionSchema', () => {
  describe('Given a question with a valid hint string', () => {
    it('then it accepts the question', () => {
      const result = QuestionSchema.safeParse({
        ...validQuestion,
        hint: 'Describe 2–3 specific scenarios and explain the design rationale.',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Given a question with hint set to null', () => {
    it('then it accepts the question (hint generation failure does not block rubric generation)', () => {
      const result = QuestionSchema.safeParse({
        ...validQuestion,
        hint: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hint).toBeNull();
      }
    });
  });

  describe('Given a question with hint omitted', () => {
    it('then it accepts the question (hint field is optional)', () => {
      const result = QuestionSchema.safeParse(validQuestion);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hint).toBeUndefined();
      }
    });
  });

  describe('Given a question with a hint longer than 200 characters', () => {
    it('then it rejects the question (max 200 characters enforced)', () => {
      const hint201 = 'a'.repeat(201);
      const result = QuestionSchema.safeParse({
        ...validQuestion,
        hint: hint201,
      });

      expect(result.success).toBe(false);
    });
  });
});
