import type { RelevanceBatchResponse } from '@/lib/engine/llm/schemas';

// Single-item batch — convenience for unit tests that exercise one Q/A pair at a time.
export const relevanceFixture = {
  valid: {
    results: [
      { index: 0, is_relevant: true, explanation: 'The answer demonstrates genuine engagement with the question.' },
    ],
  } satisfies RelevanceBatchResponse,

  irrelevantRandom: {
    results: [
      { index: 0, is_relevant: false, explanation: 'Response consists of random characters with no semantic content.' },
    ],
  } satisfies RelevanceBatchResponse,

  irrelevantFiller: {
    results: [
      { index: 0, is_relevant: false, explanation: "Response is filler text (\"I don't know\") indicating no attempt to answer." },
    ],
  } satisfies RelevanceBatchResponse,

  malformedJson: 'not json at all',
  partialResponse: '{"results": [{"index": 0, "is_relevant": true, "expl',
};
