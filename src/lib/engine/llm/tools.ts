import type { ZodType, z } from 'zod';

export type ToolResult =
  | { readonly kind: 'ok'; readonly content: string; readonly bytes: number }
  | { readonly kind: 'not_found'; readonly similar_paths: readonly string[]; readonly bytes: number }
  | { readonly kind: 'forbidden_path'; readonly reason: string; readonly bytes: number }
  | { readonly kind: 'error'; readonly message: string; readonly bytes: number };

export interface ToolDefinition<TInput extends ZodType = ZodType> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: TInput;
  readonly handler: (
    input: z.infer<TInput>,
    signal: AbortSignal,
  ) => Promise<ToolResult>;
}

export interface ToolLoopBounds {
  readonly maxCalls: number;
  readonly maxBytes: number;
  readonly maxExtraInputTokens: number;
  readonly timeoutMs: number;
  readonly perToolCallTimeoutMs: number;
}

export const DEFAULT_TOOL_LOOP_BOUNDS: ToolLoopBounds = {
  maxCalls: 5,
  maxBytes: 64 * 1024,
  maxExtraInputTokens: 10_000,
  timeoutMs: 120_000,
  perToolCallTimeoutMs: 10_000,
};

export type ToolCallOutcome =
  | 'ok'
  | 'not_found'
  | 'forbidden_path'
  | 'error'
  | 'budget_exhausted'
  | 'iteration_limit_reached';

export interface ToolCallLogEntry {
  readonly tool_name: string;
  readonly argument_path: string;
  readonly bytes_returned: number;
  readonly outcome: ToolCallOutcome;
}

export interface GenerateWithToolsRequest<TSchema extends ZodType> {
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly schema: TSchema;
  readonly tools: readonly ToolDefinition[];
  readonly bounds?: Partial<ToolLoopBounds>;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface GenerateWithToolsData<T> {
  readonly data: T;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly toolCalls: readonly ToolCallLogEntry[];
  readonly durationMs: number;
}
