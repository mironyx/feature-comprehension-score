import { describe, it, expect } from 'vitest';
import { createMockLLMClient } from './mock-llm-client';
import { questionGenerationFixture } from './question-generation';
import { scoringFixture } from './scoring';
import { relevanceFixture } from './relevance';
import {
  QuestionGenerationResponseSchema,
  ScoringResponseSchema,
  RelevanceResponseSchema,
} from '@/lib/engine/llm/schemas';

describe('LLM mock factory', () => {
  describe('Given default configuration', () => {
    it('then it returns valid fixture responses for question generation', async () => {
      const client = createMockLLMClient();

      const result = await client.generateStructured({
        prompt: 'Generate questions',
        systemPrompt: 'You are an assessor',
        schema: QuestionGenerationResponseSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(questionGenerationFixture.valid);
      }
    });

    it('then it returns valid fixture responses for scoring', async () => {
      const client = createMockLLMClient();

      const result = await client.generateStructured({
        prompt: 'Score this answer',
        systemPrompt: 'You are a scorer',
        schema: ScoringResponseSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(scoringFixture.valid);
      }
    });

    it('then it returns valid fixture responses for relevance', async () => {
      const client = createMockLLMClient();

      const result = await client.generateStructured({
        prompt: 'Is this relevant?',
        systemPrompt: 'You are a classifier',
        schema: RelevanceResponseSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(relevanceFixture.valid);
      }
    });
  });

  describe('Given override for malformed JSON', () => {
    it('then it returns malformed_response error', async () => {
      const client = createMockLLMClient({
        error: { code: 'malformed_response', message: 'Unparseable response' },
      });

      const result = await client.generateStructured({
        prompt: 'Generate questions',
        systemPrompt: 'You are an assessor',
        schema: QuestionGenerationResponseSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('malformed_response');
        expect(result.error.message).toBe('Unparseable response');
      }
    });
  });

  describe('Given override for rate limit error', () => {
    it('then it returns rate_limit error', async () => {
      const client = createMockLLMClient({
        error: { code: 'rate_limit', message: 'Rate limit exceeded' },
      });

      const result = await client.generateStructured({
        prompt: 'Score this answer',
        systemPrompt: 'You are a scorer',
        schema: ScoringResponseSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('rate_limit');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('Given override for server error', () => {
    it('then it returns server_error error', async () => {
      const client = createMockLLMClient({
        error: { code: 'server_error', message: 'Internal server error' },
      });

      const result = await client.generateStructured({
        prompt: 'Is this relevant?',
        systemPrompt: 'You are a classifier',
        schema: RelevanceResponseSchema,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('server_error');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('Given per-schema response override', () => {
    it('then it returns the custom response for the matching schema', async () => {
      const customScore = { score: 0.42, rationale: 'Custom test rationale' };
      const client = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, customScore]]),
      });

      const result = await client.generateStructured({
        prompt: 'Score this',
        systemPrompt: 'You are a scorer',
        schema: ScoringResponseSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(customScore);
      }
    });

    it('then it still returns defaults for non-overridden schemas', async () => {
      const client = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, { score: 0.42, rationale: 'Custom' }]]),
      });

      const result = await client.generateStructured({
        prompt: 'Generate questions',
        systemPrompt: 'You are an assessor',
        schema: QuestionGenerationResponseSchema,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(questionGenerationFixture.valid);
      }
    });
  });
});
