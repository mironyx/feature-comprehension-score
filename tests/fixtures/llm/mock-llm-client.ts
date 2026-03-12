import type { ZodType } from 'zod';
import type { LLMClient, LLMError, LLMErrorCode, LLMResult } from '@/lib/engine/llm/types';
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

export function createMockLLMClient(options?: MockLLMClientOptions): LLMClient {
  return {
    async generateStructured<T extends ZodType>(request: {
      prompt: string;
      systemPrompt: string;
      schema: T;
      model?: string;
      maxTokens?: number;
    }): Promise<LLMResult<T['_output']>> {
      if (options?.error) {
        const error: LLMError = {
          code: options.error.code,
          message: options.error.message ?? 'Mocked error',
          retryable: RETRYABLE_CODES.has(options.error.code),
        };
        return { success: false, error };
      }

      const overrideResponse = options?.responses?.get(request.schema);
      if (overrideResponse !== undefined) {
        return { success: true, data: overrideResponse as T['_output'] };
      }

      const defaultResponse = defaultResponses.get(request.schema);
      if (defaultResponse !== undefined) {
        return { success: true, data: defaultResponse as T['_output'] };
      }

      return {
        success: false,
        error: {
          code: 'unknown',
          message: `No fixture registered for schema`,
          retryable: false,
        },
      };
    },
  };
}
