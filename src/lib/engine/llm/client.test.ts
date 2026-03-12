import Anthropic from '@anthropic-ai/sdk';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { AnthropicClient } from './client';

const TestSchema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

type MockAnthropic = {
  messages: { create: ReturnType<typeof vi.fn> };
};

function makeTextResponse(text: string) {
  return { content: [{ type: 'text', text }], role: 'assistant' };
}

function makeValidResponse() {
  return makeTextResponse(JSON.stringify({ answer: 'Test answer', confidence: 0.95 }));
}

const TEST_REQUEST = {
  prompt: 'Test prompt',
  systemPrompt: 'Test system',
  schema: TestSchema,
} as const;

describe('LLM client wrapper', () => {
  let mockAnthropic: MockAnthropic;
  let client: AnthropicClient;

  beforeEach(() => {
    mockAnthropic = { messages: { create: vi.fn() } };
    client = new AnthropicClient({
      apiKey: 'test-key',
      anthropicClient: mockAnthropic as unknown as Anthropic,
      retryConfig: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Given a successful API call', () => {
    it('then it returns parsed, validated response', async () => {
      mockAnthropic.messages.create.mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ answer: 'Test answer', confidence: 0.95 });
      }
      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given a malformed JSON response', () => {
    it('then it retries up to 3 times before succeeding', async () => {
      mockAnthropic.messages.create
        .mockResolvedValueOnce(makeTextResponse('invalid json {'))
        .mockResolvedValueOnce(makeTextResponse('still invalid'))
        .mockResolvedValueOnce(makeTextResponse('nope'))
        .mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(4);
      expect(result.success).toBe(true);
    });
  });

  describe('Given a valid response with missing required fields', () => {
    it('then it treats it as malformed and retries', async () => {
      mockAnthropic.messages.create
        .mockResolvedValueOnce(makeTextResponse(JSON.stringify({ answer: 'Missing confidence' })))
        .mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });
  });

  describe('Given all retries exhausted', () => {
    it('then it returns a typed error, not an exception', async () => {
      mockAnthropic.messages.create.mockResolvedValue(makeTextResponse('invalid json'));

      const result = await client.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('malformed_response');
        expect(result.error.retryable).toBe(true);
      }
      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('Given a rate limit error (429)', () => {
    it('then it retries with exponential backoff', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), { status: 429 });

      mockAnthropic.messages.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeValidResponse());

      const fastClient = new AnthropicClient({
        apiKey: 'test-key',
        anthropicClient: mockAnthropic as unknown as Anthropic,
        retryConfig: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
      });

      const result = await fastClient.generateStructured(TEST_REQUEST);

      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });
  });

  describe('Given a server error (500)', () => {
    it('then it retries and returns a typed error after exhaustion', async () => {
      const serverError = Object.assign(new Error('Internal server error'), { status: 500 });
      mockAnthropic.messages.create.mockRejectedValue(serverError);

      const fastClient = new AnthropicClient({
        apiKey: 'test-key',
        anthropicClient: mockAnthropic as unknown as Anthropic,
        retryConfig: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
      });

      const result = await fastClient.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('server_error');
        expect(result.error.retryable).toBe(true);
      }
      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('Given a non-retryable error (401)', () => {
    it('then it fails immediately without retrying', async () => {
      const authError = Object.assign(new Error('Invalid API key'), { status: 401 });
      mockAnthropic.messages.create.mockRejectedValue(authError);

      const result = await client.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.retryable).toBe(false);
      }
      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given custom retry configuration', () => {
    it('then it respects the custom maxRetries limit', async () => {
      const customClient = new AnthropicClient({
        apiKey: 'test-key',
        anthropicClient: mockAnthropic as unknown as Anthropic,
        retryConfig: { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 100 },
      });

      mockAnthropic.messages.create.mockResolvedValue(makeTextResponse('invalid'));

      const result = await customClient.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(false);
      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(2);
    });
  });
});
