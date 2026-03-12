import type { QuestionGenerationResponse } from '@/lib/engine/llm/schemas';

export const questionGenerationFixture = {
  valid: {
    questions: [
      {
        id: 'q1',
        text: 'Why was this change introduced?',
        weight: 3,
        naur_layer: 'world_mapping',
        reference_answer:
          'To fix a race condition in the payment processor that caused duplicate charges under high load.',
      },
      {
        id: 'q2',
        text: 'What does this change do at a high level?',
        weight: 2,
        naur_layer: 'design',
        reference_answer:
          'It adds a distributed lock around the charge creation step using Redis.',
      },
      {
        id: 'q3',
        text: 'How does the locking mechanism work?',
        weight: 1,
        naur_layer: 'modification',
        reference_answer:
          'A Redis SET NX with TTL is used to acquire a lock keyed on the payment intent ID before calling Stripe.',
      },
    ],
  } satisfies QuestionGenerationResponse,

  malformedJson: 'Here are the questions: { invalid json',

  missingFields: {
    questions: [
      {
        id: 'q1',
        text: 'Why was this change introduced?',
      },
    ],
  },

  partialResponse: '{"questions": [{"id": "q1", "text": "Why',
};
