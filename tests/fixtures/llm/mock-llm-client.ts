import type { ZodType } from 'zod';
import type { LLMClient, LLMError, LLMErrorCode } from '@/lib/engine/llm/types';
import {
  QuestionGenerationResponseSchema,
  ScoringResponseSchema,
  RelevanceResponseSchema,
} from '@/lib/engine/llm/schemas';
import { questionGenerationFixture } from './question-generation';
import { scoringFixture } from './scoring';
import { relevanceFixture } from './relevance';

const RETRYABLE_CODES: ReadonlySet<LLMErrorCode> = new Set([
  'rate_limit',
  'server_error',
  'malformed_response',
  'network_error',
]);

interface MockLLMClientOptions {
  error?: { code: LLMErrorCode; message?: string };
  responses?: Map<ZodType, unknown>;
}

const defaultResponses = new Map<ZodType, unknown>([
  [QuestionGenerationResponseSchema, questionGenerationFixture.valid],
  [ScoringResponseSchema, scoringFixture.valid],
  [RelevanceResponseSchema, relevanceFixture.valid],
]);

function success<T>(data: T) {
  return { success: true as const, data };
}

function failure(error: LLMError) {
  return { success: false as const, error };
}

export function createMockLLMClient(options?: MockLLMClientOptions): LLMClient {
  return {
    generateStructured: async (request) => {
      if (options?.error) {
        return failure({
          code: options.error.code,
          message: options.error.message ?? 'Mocked error',
          retryable: RETRYABLE_CODES.has(options.error.code),
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double; Map<ZodType, unknown> can't satisfy output<T>
      const overrideResponse = options?.responses?.get(request.schema);
      if (overrideResponse !== undefined) {
        return success(overrideResponse as any);
      }

      const defaultResponse = defaultResponses.get(request.schema);
      if (defaultResponse !== undefined) {
        return success(defaultResponse as any);
      }

      return failure({
        code: 'unknown',
        message: 'No fixture registered for schema',
        retryable: false,
      });
    },
  };
}
