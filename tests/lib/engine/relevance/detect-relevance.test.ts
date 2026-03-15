import { describe, it, expect, vi } from 'vitest';
import { detectRelevance } from '@/lib/engine/relevance/detect-relevance';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import { relevanceFixture } from '../../../fixtures/llm/relevance';
import { RelevanceResponseSchema } from '@/lib/engine/llm/schemas';

describe('detectRelevance', () => {
  describe('Given a genuine but incorrect answer', () => {
    it('then it returns relevant: true', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, relevanceFixture.valid]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: 'To improve performance by caching results.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(true);
      expect(result.data.explanation).toBeTruthy();
    });
  });

  describe('Given random characters ("asdfgh")', () => {
    it('then it returns relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, relevanceFixture.irrelevantRandom]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: 'asdfgh',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(false);
      expect(result.data.explanation).toBeTruthy();
    });
  });

  describe('Given filler text ("I dont know")', () => {
    it('then it returns relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, relevanceFixture.irrelevantFiller]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: "I don't know",
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(false);
      expect(result.data.explanation).toBeTruthy();
    });
  });

  describe('Given a copy of the question text', () => {
    it('then it returns relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, {
          is_relevant: false,
          explanation: 'Response is a copy of the question text.',
        }]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: 'Why was a distributed lock used?',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(false);
    });
  });

  describe('Given an empty string', () => {
    it('then it returns relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, {
          is_relevant: false,
          explanation: 'Response is empty.',
        }]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: '',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(false);
    });
  });

  describe('Given a completely off-topic answer', () => {
    it('then it returns relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceResponseSchema, {
          is_relevant: false,
          explanation: 'Response is completely off-topic.',
        }]]),
      });

      const result = await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: 'The weather is nice today.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.is_relevant).toBe(false);
      expect(result.data.explanation).toBeTruthy();
    });
  });

  describe('Given an LLM failure', () => {
    it('then it returns an error result', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'server_error', message: 'Service unavailable' },
      });

      const result = await detectRelevance({
        questionText: 'Q',
        participantAnswer: 'A',
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('server_error');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('Given the LLM client is called', () => {
    it('then it passes the correct prompt containing question and answer', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: relevanceFixture.valid,
      });
      const llmClient = { generateStructured };

      await detectRelevance({
        questionText: 'Why was a distributed lock used?',
        participantAnswer: 'To prevent race conditions.',
        llmClient,
      });

      expect(generateStructured).toHaveBeenCalledOnce();
      const call = generateStructured.mock.calls[0][0];
      expect(call.prompt).toContain('Why was a distributed lock used?');
      expect(call.prompt).toContain('To prevent race conditions.');
      expect(call.schema).toBe(RelevanceResponseSchema);
    });
  });
});
