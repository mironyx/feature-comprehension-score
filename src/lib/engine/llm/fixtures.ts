import type {
  QuestionGenerationResponse,
  RelevanceResponse,
  ScoringResponse,
} from './schemas';

export const questionGenerationFixtures = {
  valid: {
    questions: [
      {
        id: 'q1',
        text: 'Why was this change introduced?',
        weight: 3,
        naur_layer: 'world_mapping',
        reference_answer: 'To fix a race condition in the payment processor that caused duplicate charges under high load.',
      },
      {
        id: 'q2',
        text: 'What does this change do at a high level?',
        weight: 2,
        naur_layer: 'design',
        reference_answer: 'It adds a distributed lock around the charge creation step using Redis.',
      },
      {
        id: 'q3',
        text: 'How does the locking mechanism work?',
        weight: 1,
        naur_layer: 'modification',
        reference_answer: 'A Redis SET NX with TTL is used to acquire a lock keyed on the payment intent ID before calling Stripe.',
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

export const scoringFixtures = {
  highScore: {
    score: 0.92,
    rationale: 'Answer correctly identifies the race condition and explains the distributed lock solution.',
  } satisfies ScoringResponse,

  midScore: {
    score: 0.55,
    rationale: 'Answer mentions locking but misses the specific Redis implementation detail.',
  } satisfies ScoringResponse,

  lowScore: {
    score: 0.1,
    rationale: 'Answer is too vague — only mentions "some kind of fix" without demonstrating understanding.',
  } satisfies ScoringResponse,

  malformedJson: '{"score": 0.8 invalid',

  missingFields: {
    score: 0.75,
  },
};

export const relevanceFixtures = {
  relevant: {
    relevant: true,
    explanation: 'The answer demonstrates genuine engagement with the question.',
  } satisfies RelevanceResponse,

  irrelevantRandom: {
    relevant: false,
    explanation: 'Response consists of random characters with no semantic content.',
  } satisfies RelevanceResponse,

  irrelevantFiller: {
    relevant: false,
    explanation: 'Response is filler text ("I don\'t know") indicating no attempt to answer.',
  } satisfies RelevanceResponse,

  malformedJson: 'not json at all',
};
