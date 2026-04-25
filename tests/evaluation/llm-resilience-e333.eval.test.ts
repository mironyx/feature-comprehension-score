/**
 * Adversarial evaluation tests for issue #333 — LLM resilience (retry, polling, abort).
 *
 * Gap: LLD invariant I1 specifies "429, 5xx" as retryable for generateWithTools.
 * The test-author covered 429 exhaustively. 5xx (server_error) is the same code
 * path via classifyHttpError but is unverified for the generateWithTools call path.
 *
 * This file probes that single gap. Failures are findings — do NOT fix the
 * implementation here.
 */

import OpenAI from 'openai';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { OpenRouterClient } from '@/lib/engine/llm/client';

// ---------------------------------------------------------------------------
// Reuse the same mock shape as generate-with-tools.test.ts
// ---------------------------------------------------------------------------

type MockOpenAI = {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
};

function makeMockOpenAI(): MockOpenAI {
  return { chat: { completions: { create: vi.fn() } } };
}

const FinalSchema = z.object({ summary: z.string(), score: z.number() });
type FinalData = z.infer<typeof FinalSchema>;

function makeFinalResponse(data: FinalData) {
  return {
    choices: [{ message: { role: 'assistant', content: JSON.stringify(data), tool_calls: undefined } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

const DEFAULT_FINAL = makeFinalResponse({ summary: 'All good', score: 42 });

function makeBaseRequest() {
  return {
    prompt: 'Generate assessment questions.',
    systemPrompt: 'You are an expert rubric evaluator.',
    schema: FinalSchema,
    tools: [] as never[],
  };
}

// ---------------------------------------------------------------------------
// Invariant I1 — 5xx is retryable for generateWithTools [lld §Fix A invariant I1]
//
// The LLD states: "generateWithTools retries transient errors (429, 5xx) with
// exponential backoff". The test-author validated 429 but not 5xx. These two
// tests confirm the same withRetry+classifyHttpError code path applies to 5xx.
// ---------------------------------------------------------------------------

describe('generateWithTools retry on 5xx server errors (#333 I1 gap)', () => {
  let mockOpenAI: MockOpenAI;

  beforeEach(() => {
    mockOpenAI = makeMockOpenAI();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Given chatCall throws a 500 Internal Server Error on first attempt then succeeds', () => {
    it('then result is successful and chatCall was called twice (5xx is retryable)', async () => {
      // I1 [lld §Fix A]: 5xx errors must retry. This is the same code path as 429
      // (classifyHttpError maps status >= 500 to server_error with retryable: true)
      // but was not explicitly tested by the test-author for generateWithTools.
      const retryClient = new OpenRouterClient({
        apiKey: 'test-key',
        openAIClient: mockOpenAI as unknown as OpenAI,
        retryConfig: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      });

      const serverError = Object.assign(new Error('Internal Server Error'), { status: 500 });
      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await retryClient.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given chatCall throws a 503 Service Unavailable on every attempt', () => {
    it('then result error code is server_error after exhausting retries', async () => {
      // I1 [lld §Fix A]: after exhausting retries on 5xx, returns server_error (not unknown)
      const retryClient = new OpenRouterClient({
        apiKey: 'test-key',
        openAIClient: mockOpenAI as unknown as OpenAI,
        retryConfig: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
      });

      const serviceUnavailable = Object.assign(new Error('Service Unavailable'), { status: 503 });
      mockOpenAI.chat.completions.create.mockRejectedValue(serviceUnavailable);

      const result = await retryClient.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.error.code).toBe('server_error');
      // maxRetries=1: 1 initial + 1 retry = 2 calls
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });
});
