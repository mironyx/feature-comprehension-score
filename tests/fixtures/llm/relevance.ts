import type { RelevanceResponse } from '@/lib/engine/llm/schemas';

export const relevanceFixture = {
  valid: {
    relevant: true,
    explanation: 'The answer demonstrates genuine engagement with the question.',
  } satisfies RelevanceResponse,

  irrelevantRandom: {
    relevant: false,
    explanation: 'Response consists of random characters with no semantic content.',
  } satisfies RelevanceResponse,

  irrelevantFiller: {
    relevant: false,
    explanation:
      "Response is filler text (\"I don't know\") indicating no attempt to answer.",
  } satisfies RelevanceResponse,

  malformedJson: 'not json at all',

  partialResponse: '{"relevant": true, "expl',
};
