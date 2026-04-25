import { describe, it, expect, vi } from 'vitest';
import { detectRelevance } from '@/lib/engine/relevance/detect-relevance';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import { relevanceFixture } from '../../../fixtures/llm/relevance';
import { RelevanceBatchResponseSchema } from '@/lib/engine/llm/schemas';

describe('detectRelevance (batched)', () => {
  describe('Given a single (question, answer) pair classified as relevant', () => {
    it('then it returns one result with is_relevant: true', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceBatchResponseSchema, relevanceFixture.valid]]),
      });

      const result = await detectRelevance({
        items: [{ questionText: 'Why was a distributed lock used?', participantAnswer: 'To prevent race conditions.' }],
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.is_relevant).toBe(true);
      expect(result.data[0]?.explanation).toBeTruthy();
    });
  });

  describe('Given a single irrelevant answer', () => {
    it('then it returns is_relevant: false with explanation', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[RelevanceBatchResponseSchema, relevanceFixture.irrelevantRandom]]),
      });

      const result = await detectRelevance({
        items: [{ questionText: 'Why was a distributed lock used?', participantAnswer: 'asdfgh' }],
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data[0]?.is_relevant).toBe(false);
      expect(result.data[0]?.explanation).toBeTruthy();
    });
  });

  describe('Given multiple items in a batch', () => {
    it('then it issues exactly ONE LLM call and returns results aligned by index', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: {
          results: [
            { index: 0, is_relevant: true, explanation: 'Genuine attempt' },
            { index: 1, is_relevant: false, explanation: 'Random characters' },
            { index: 2, is_relevant: true, explanation: 'Good answer' },
          ],
        },
      });
      const llmClient = { generateStructured };

      const result = await detectRelevance({
        items: [
          { questionText: 'Q1', participantAnswer: 'A1' },
          { questionText: 'Q2', participantAnswer: 'asdf' },
          { questionText: 'Q3', participantAnswer: 'A3' },
        ],
        llmClient,
      });

      expect(generateStructured).toHaveBeenCalledOnce();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.is_relevant).toBe(true);
      expect(result.data[1]?.is_relevant).toBe(false);
      expect(result.data[2]?.is_relevant).toBe(true);
    });
  });

  describe('Given the LLM returns FEWER results than items (#335 contract)', () => {
    it('then missing entries are treated as is_relevant: true (scoring will sort it out)', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: {
          results: [
            { index: 0, is_relevant: false, explanation: 'Irrelevant' },
            // index 1 missing → should be filled as relevant: true
            { index: 2, is_relevant: false, explanation: 'Off topic' },
          ],
        },
      });
      const llmClient = { generateStructured };

      const result = await detectRelevance({
        items: [
          { questionText: 'Q1', participantAnswer: 'A1' },
          { questionText: 'Q2', participantAnswer: 'A2' },
          { questionText: 'Q3', participantAnswer: 'A3' },
        ],
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toHaveLength(3);
      expect(result.data[1]?.is_relevant).toBe(true);
      expect(result.data[1]?.explanation).toBe('');
    });
  });

  describe('Given an LLM failure (e.g. 429 after retries)', () => {
    it('then it returns success: false and lets the caller surface the failure', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'server_error', message: 'Service unavailable' },
      });

      const result = await detectRelevance({
        items: [{ questionText: 'Q', participantAnswer: 'A' }],
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('server_error');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('Given an empty items array', () => {
    it('then it short-circuits without calling the LLM', async () => {
      const generateStructured = vi.fn();
      const llmClient = { generateStructured };

      const result = await detectRelevance({ items: [], llmClient });

      expect(generateStructured).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toEqual([]);
    });
  });

  describe('Given the LLM client is called', () => {
    it('then the prompt contains every numbered item and the batch schema', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: { results: [{ index: 0, is_relevant: true, explanation: '' }, { index: 1, is_relevant: true, explanation: '' }] },
      });
      const llmClient = { generateStructured };

      await detectRelevance({
        items: [
          { questionText: 'Why was a distributed lock used?', participantAnswer: 'To prevent race conditions.' },
          { questionText: 'How does Redis SET NX work?', participantAnswer: 'It sets only if the key is absent.' },
        ],
        llmClient,
      });

      expect(generateStructured).toHaveBeenCalledOnce();
      const call = generateStructured.mock.calls[0][0];
      expect(call.prompt).toContain('Why was a distributed lock used?');
      expect(call.prompt).toContain('To prevent race conditions.');
      expect(call.prompt).toContain('How does Redis SET NX work?');
      expect(call.prompt).toContain('Item 0');
      expect(call.prompt).toContain('Item 1');
      expect(call.schema).toBe(RelevanceBatchResponseSchema);
    });
  });
});
