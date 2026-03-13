import type { QuestionGenerationResponse } from '@/lib/engine/llm/schemas';

export const questionGenerationFixture = {
  valid: {
    questions: [
      {
        question_number: 1,
        question_text: 'Why was this change introduced?',
        weight: 3,
        naur_layer: 'world_to_program',
        reference_answer:
          'To fix a race condition in the payment processor that caused duplicate charges under high load.',
      },
      {
        question_number: 2,
        question_text: 'What does this change do at a high level?',
        weight: 2,
        naur_layer: 'design_justification',
        reference_answer:
          'It adds a distributed lock around the charge creation step using Redis.',
      },
      {
        question_number: 3,
        question_text: 'How does the locking mechanism work?',
        weight: 1,
        naur_layer: 'modification_capacity',
        reference_answer:
          'A Redis SET NX with TTL is used to acquire a lock keyed on the payment intent ID before calling Stripe.',
      },
    ],
    artefact_quality: 'code_only',
    artefact_quality_note: 'Only source code changes were available for analysis.',
  } satisfies QuestionGenerationResponse,

  malformedJson: 'Here are the questions: { invalid json',

  missingFields: {
    questions: [
      {
        question_number: 1,
        question_text: 'Why was this change introduced?',
      },
    ],
  },

  partialResponse: '{"questions": [{"question_number": 1, "question_text": "Why',
};
