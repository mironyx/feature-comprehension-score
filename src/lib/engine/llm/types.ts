import type { ZodType } from 'zod';
import { z } from 'zod';
import type {
  GenerateWithToolsData,
  GenerateWithToolsRequest,
} from './tools';

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

  generateWithTools<T extends ZodType>(
    request: GenerateWithToolsRequest<T>,
  ): Promise<LLMResult<GenerateWithToolsData<z.infer<T>>>>;
}

// Justification: LLMLogger is a port interface for structured logging at the LLM call
// boundary. Not in the original LLD — added as part of #136 to inject logging without
// coupling the engine layer to a concrete logger (Pino). Matches Pino's call signature
// so the real logger can be passed directly without an adapter.
export interface LLMLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
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
