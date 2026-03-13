import type { ScoringResponse } from '@/lib/engine/llm/schemas';

export const scoringFixture = {
  valid: {
    score: 0.92,
    rationale:
      'Answer correctly identifies the race condition and explains the distributed lock solution.',
  } satisfies ScoringResponse,

  midScore: {
    score: 0.55,
    rationale:
      'Answer mentions locking but misses the specific Redis implementation detail.',
  } satisfies ScoringResponse,

  lowScore: {
    score: 0.1,
    rationale:
      'Answer is too vague — only mentions "some kind of fix" without demonstrating understanding.',
  } satisfies ScoringResponse,

  malformedJson: '{"score": 0.8 invalid',

  partialResponse: '{"score": 0.85, "rati',

  missingFields: {
    score: 0.75,
  },
};
