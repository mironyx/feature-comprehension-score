
import OpenAI from 'openai';
import { z } from 'zod';
import {
  DEFAULT_RETRY_CONFIG,
  type LLMClient,
  type LLMError,
  type LLMErrorCode,
  type LLMResult,
  type RetryConfig,
} from './types';

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

export interface OpenRouterClientConfig {
  apiKey: string;
  defaultModel?: string;
  openAIClient?: OpenAI;
  retryConfig?: Partial<RetryConfig>;
}

export interface GenerateStructuredRequest<T extends z.ZodType> {
  prompt: string;
  systemPrompt: string;
  schema: T;
  model?: string;
  maxTokens?: number;
}

export class OpenRouterClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly retryConfig: RetryConfig;

  constructor(config: OpenRouterClientConfig) {
    this.client =
      config.openAIClient ??
      new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: config.apiKey,
      });
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };
  }

  async generateStructured<T extends z.ZodType>(
    request: GenerateStructuredRequest<T>,
  ): Promise<LLMResult<z.infer<T>>> {
    const { prompt, systemPrompt, schema, model: modelOverride, maxTokens } = request;

    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: modelOverride ?? this.defaultModel,
        max_tokens: maxTokens ?? 4096,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return failure(makeError('malformed_response', 'No text content in response', true));
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        return failure(
          makeError(
            'malformed_response',
            `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
            true,
            { responseText: content.slice(0, 200) },
          ),
        );
      }

      const validation = schema.safeParse(parsed);
      if (!validation.success) {
        return failure(
          makeError(
            'validation_failed',
            `Schema validation failed: ${validation.error.message}`,
            true,
            { zodErrors: validation.error.issues },
          ),
        );
      }

      return { success: true, data: validation.data };
    });
  }

  private async withRetry<T>(
    fn: () => Promise<LLMResult<T>>,
  ): Promise<LLMResult<T>> {
    let lastError: LLMError | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        await this.delay(attempt - 1);
      }

      try {
        const result = await fn();
        if (result.success || !result.error.retryable) return result;
        lastError = result.error;
      } catch (err) {
        const error = classifyException(err);
        if (!error.retryable) return failure(error);
        lastError = error;
      }
    }

    return failure(
      lastError ?? makeError('unknown', 'Unknown error', false),
    );
  }

  private async delay(attempt: number): Promise<void> {
    const ms = Math.min(
      this.retryConfig.baseDelayMs * Math.pow(2, attempt),
      this.retryConfig.maxDelayMs,
    );
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function makeError(
  code: LLMErrorCode,
  message: string,
  retryable: boolean,
  context?: Record<string, unknown>,
): LLMError {
  return { code, message, retryable, context };
}

function failure<T>(error: LLMError): LLMResult<T> {
  return { success: false, error };
}

function classifyException(err: unknown): LLMError {
  if (!(err instanceof Error)) {
    return makeError('unknown', 'Unknown error occurred', false);
  }
  // OpenAI SDK errors carry .status as a typed property; plain errors may carry it duck-typed.
  const status = err instanceof OpenAI.APIError
    ? err.status
    : (err as Error & { status?: number }).status;
  return classifyHttpError(err, status);
}

function classifyHttpError(err: Error, status: number | undefined): LLMError {
  if (status === 429) return makeError('rate_limit', 'Rate limit exceeded', true, { status });
  if (status === 401 || status === 403) return makeError('unknown', 'Authentication failed', false, { status });
  if (status !== undefined && status >= 500) return makeError('server_error', err.message, true, { status });
  if (status !== undefined && status >= 400) return makeError('unknown', err.message, false, { status });
  return makeError('network_error', err.message, true);
}
