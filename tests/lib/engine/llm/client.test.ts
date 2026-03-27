import OpenAI from 'openai';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { OpenRouterClient, DEFAULT_MODEL } from '@/lib/engine/llm/client';

const TestSchema = z.object({
  answer: z.string(),
  confidence: z.number(),
});

type MockOpenAI = {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
};

function makeTextResponse(text: string) {
  return {
    choices: [{ message: { role: 'assistant', content: text } }],
  };
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
  let mockOpenAI: MockOpenAI;
  let client: OpenRouterClient;

  beforeEach(() => {
    mockOpenAI = { chat: { completions: { create: vi.fn() } } };
    client = new OpenRouterClient({
      apiKey: 'test-key',
      openAIClient: mockOpenAI as unknown as OpenAI,
      retryConfig: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function generateOk() {
    const result = await client.generateStructured(TEST_REQUEST);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success result');
    return result.data;
  }

  async function generateErr() {
    const result = await client.generateStructured(TEST_REQUEST);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected error result');
    return result.error;
  }

  describe('Given a successful API call', () => {
    it('then it returns parsed, validated response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(makeValidResponse());

      const data = await generateOk();

      expect(data).toEqual({ answer: 'Test answer', confidence: 0.95 });
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given a malformed JSON response', () => {
    it('then it retries up to 3 times before succeeding', async () => {
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(makeTextResponse('invalid json {'))
        .mockResolvedValueOnce(makeTextResponse('still invalid'))
        .mockResolvedValueOnce(makeTextResponse('nope'))
        .mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(4);
      expect(result.success).toBe(true);
    });
  });

  describe('Given a valid response with missing required fields', () => {
    it('then it treats it as malformed and retries', async () => {
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(makeTextResponse(JSON.stringify({ answer: 'Missing confidence' })))
        .mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });
  });

  describe('Given all retries exhausted', () => {
    it('then it returns a typed error, not an exception', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(makeTextResponse('invalid json'));

      const error = await generateErr();

      expect(error.code).toBe('malformed_response');
      expect(error.retryable).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('Given a rate limit error (429)', () => {
    it('then it retries with exponential backoff', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), { status: 429 });

      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeValidResponse());

      const result = await client.generateStructured(TEST_REQUEST);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });
  });

  describe('Given a server error (500)', () => {
    it('then it retries and returns a typed error after exhaustion', async () => {
      const serverError = Object.assign(new Error('Internal server error'), { status: 500 });
      mockOpenAI.chat.completions.create.mockRejectedValue(serverError);

      const error = await generateErr();

      expect(error.code).toBe('server_error');
      expect(error.retryable).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(4);
    });
  });

  describe('Given a non-retryable error (401)', () => {
    it('then it fails immediately without retrying', async () => {
      const authError = Object.assign(new Error('Invalid API key'), { status: 401 });
      mockOpenAI.chat.completions.create.mockRejectedValue(authError);

      const error = await generateErr();

      expect(error.retryable).toBe(false);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given custom retry configuration', () => {
    it('then it respects the custom maxRetries limit', async () => {
      const customClient = new OpenRouterClient({
        apiKey: 'test-key',
        openAIClient: mockOpenAI as unknown as OpenAI,
        retryConfig: { maxRetries: 1, baseDelayMs: 10, maxDelayMs: 100 },
      });

      mockOpenAI.chat.completions.create.mockResolvedValue(makeTextResponse('invalid'));

      const result = await customClient.generateStructured(TEST_REQUEST);

      expect(result.success).toBe(false);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Given default model configuration', () => {
    it('then it calls OpenRouter with the default model', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(makeValidResponse());

      await client.generateStructured(TEST_REQUEST);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: DEFAULT_MODEL }),
      );
    });
  });

  describe('Given a custom model override', () => {
    it('then it uses the specified model', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(makeValidResponse());

      await client.generateStructured({ ...TEST_REQUEST, model: 'anthropic/claude-opus-4-6' });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'anthropic/claude-opus-4-6' }),
      );
    });
  });
});
