import { vi } from 'vitest';
import type { AnthropicClient } from './client';
import {
  questionGenerationFixtures,
  relevanceFixtures,
  scoringFixtures,
} from './fixtures';
import type {
  QuestionGenerationResponse,
  RelevanceResponse,
  ScoringResponse,
} from './schemas';
import type { LLMError, LLMResult } from './types';

function success<T>(data: T): LLMResult<T> {
  return { success: true, data };
}

function failure<T>(
  code: LLMError['code'],
  message = 'Mocked error',
): LLMResult<T> {
  return { success: false, error: { code, message, retryable: true } };
}

export function mockAnthropicClient() {
  return {
    generateStructured: vi.fn(),
  } as unknown as AnthropicClient;
}

export const questionGenerationMocks = {
  success: () =>
    success<QuestionGenerationResponse>(questionGenerationFixtures.valid),

  serverError: () =>
    failure<QuestionGenerationResponse>('server_error'),

  malformedResponse: () =>
    failure<QuestionGenerationResponse>('malformed_response'),
};

export const scoringMocks = {
  highScore: () => success<ScoringResponse>(scoringFixtures.highScore),
  midScore: () => success<ScoringResponse>(scoringFixtures.midScore),
  lowScore: () => success<ScoringResponse>(scoringFixtures.lowScore),
  serverError: () => failure<ScoringResponse>('server_error'),
};

export const relevanceMocks = {
  relevant: () => success<RelevanceResponse>(relevanceFixtures.relevant),
  irrelevantRandom: () =>
    success<RelevanceResponse>(relevanceFixtures.irrelevantRandom),
  irrelevantFiller: () =>
    success<RelevanceResponse>(relevanceFixtures.irrelevantFiller),
  serverError: () => failure<RelevanceResponse>('server_error'),
};
