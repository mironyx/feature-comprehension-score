import type { RelevanceResponse } from '@/lib/engine/llm/schemas';

export const relevanceFixture = {
  valid: {
    is_relevant: true,
    explanation: 'The answer demonstrates genuine engagement with the question.',
  } satisfies RelevanceResponse,

  irrelevantRandom: {
    is_relevant: false,
    explanation: 'Response consists of random characters with no semantic content.',
  } satisfies RelevanceResponse,

  irrelevantFiller: {
    is_relevant: false,
    explanation:
      "Response is filler text (\"I don't know\") indicating no attempt to answer.",
  } satisfies RelevanceResponse,

  malformedJson: 'not json at all',

  partialResponse: '{"is_relevant": true, "expl',
};
