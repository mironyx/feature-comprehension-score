import type { ZodType } from 'zod';
import { z } from 'zod';

export const LLMErrorCode = z.enum([
  'rate_limit',
  'server_error',
  'malformed_response',
  'validation_failed',
  'network_error',
  'unknown',
]);

export type LLMErrorCode = z.infer<typeof LLMErrorCode>;

export interface LLMError {
  code: LLMErrorCode;
  message: string;
  retryable: boolean;
  context?: Record<string, unknown>;
}

export type LLMResult<T> =
  | { success: true; data: T }
  | { success: false; error: LLMError };

export interface LLMClient {
  generateStructured<T extends ZodType>(request: {
    prompt: string;
    systemPrompt: string;
    schema: T;
    model?: string;
    maxTokens?: number;
  }): Promise<LLMResult<z.infer<T>>>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};
