import { describe, it, expect, vi } from 'vitest';
import { scoreAnswer } from '@/lib/engine/scoring/score-answer';
import { createMockLLMClient } from '../../../fixtures/llm/mock-llm-client';
import { scoringFixture } from '../../../fixtures/llm/scoring';
import { ScoringResponseSchema } from '@/lib/engine/llm/schemas';

describe('scoreAnswer', () => {
  describe('Given a correct, complete answer', () => {
    it('then it returns a score >= 0.8', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, scoringFixture.valid]]),
      });

      const result = await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions in concurrent payment processing.',
        participantAnswer: 'The distributed lock using Redis prevents race conditions when multiple payment requests arrive simultaneously.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.score).toBeGreaterThanOrEqual(0.8);
      expect(result.data.rationale).toBeTruthy();
    });
  });

  describe('Given a partially correct answer', () => {
    it('then it returns a score between 0.3 and 0.7', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, scoringFixture.midScore]]),
      });

      const result = await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions in concurrent payment processing.',
        participantAnswer: 'Something about locking I think.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.score).toBeGreaterThanOrEqual(0.3);
      expect(result.data.score).toBeLessThanOrEqual(0.7);
    });
  });

  describe('Given a completely wrong answer', () => {
    it('then it returns a score <= 0.2', async () => {
      const llmClient = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, scoringFixture.lowScore]]),
      });

      const result = await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions in concurrent payment processing.',
        participantAnswer: 'I made some kind of fix to the code.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.score).toBeLessThanOrEqual(0.2);
    });
  });

  describe('Given a semantically equivalent answer with different wording', () => {
    it('then it returns a similar score to the reference-matching answer', async () => {
      // Both get high scores — the LLM evaluates semantic equivalence
      const llmClient = createMockLLMClient({
        responses: new Map([[ScoringResponseSchema, { score: 0.9, rationale: 'Semantically equivalent.' }]]),
      });

      const result = await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions in concurrent payment processing.',
        participantAnswer: 'Concurrent payment requests could cause duplicate charges, so a Redis-based mutex was used.',
        llmClient,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.score).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Given an LLM failure during scoring', () => {
    it('then it returns a scoring_failed result after retries', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'server_error', message: 'Service unavailable' },
      });

      const result = await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions.',
        participantAnswer: 'Some answer.',
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('server_error');
      expect(result.error.retryable).toBe(true);
    });
  });

  describe('Given the LLM client is called', () => {
    it('then it passes the correct prompt containing question, reference, and answer', async () => {
      const generateStructured = vi.fn().mockResolvedValue({
        success: true,
        data: scoringFixture.valid,
      });
      const llmClient = { generateStructured };

      await scoreAnswer({
        questionText: 'Why was a distributed lock used?',
        referenceAnswer: 'To prevent race conditions.',
        participantAnswer: 'Redis-based locking.',
        llmClient,
      });

      expect(generateStructured).toHaveBeenCalledOnce();
      const call = generateStructured.mock.calls[0][0];
      expect(call.prompt).toContain('Why was a distributed lock used?');
      expect(call.prompt).toContain('To prevent race conditions.');
      expect(call.prompt).toContain('Redis-based locking.');
      expect(call.schema).toBe(ScoringResponseSchema);
    });
  });

  describe('Given the score returned is outside 0-1 range', () => {
    it('then it returns a validation_failed error', async () => {
      const llmClient = createMockLLMClient({
        error: { code: 'validation_failed', message: 'Score out of range' },
      });

      const result = await scoreAnswer({
        questionText: 'Q',
        referenceAnswer: 'A',
        participantAnswer: 'B',
        llmClient,
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error.code).toBe('validation_failed');
    });
  });
});
