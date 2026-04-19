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

function resolveFixtureResponse(
  schema: ZodType,
  responses: Map<ZodType, unknown> | undefined,
): unknown {
  const override = responses?.get(schema);
  if (override !== undefined) return override;
  return defaultResponses.get(schema);
}

function toFailure(options: MockLLMClientOptions): LLMError | null {
  if (!options.error) return null;
  return {
    code: options.error.code,
    message: options.error.message ?? 'Mocked error',
    retryable: RETRYABLE_CODES.has(options.error.code),
  };
}

export function createMockLLMClient(options?: MockLLMClientOptions): LLMClient {
  const opts = options ?? {};
  return {
    generateWithTools: async (request) => {
      const fail = toFailure(opts);
      if (fail) return failure(fail);
      const fixture = resolveFixtureResponse(request.schema, opts.responses);
      if (fixture === undefined) {
        return failure({ code: 'unknown', message: 'No fixture registered for schema', retryable: false });
      }
      return success({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double; Map<ZodType, unknown> can't satisfy generic output<T>
        data: fixture as any,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolCalls: [],
        durationMs: 10,
      });
    },
    generateStructured: async (request) => {
      const fail = toFailure(opts);
      if (fail) return failure(fail);
      const fixture = resolveFixtureResponse(request.schema, opts.responses);
      if (fixture === undefined) {
        return failure({ code: 'unknown', message: 'No fixture registered for schema', retryable: false });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double; Map<ZodType, unknown> can't satisfy generic output<T>
      return success(fixture as any);
    },
  };
}
