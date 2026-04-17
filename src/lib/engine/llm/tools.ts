import type { ZodType, z } from 'zod';

export type ToolResult =
  | { kind: 'ok'; content: string; bytes: number }
  | { kind: 'not_found'; similar_paths: readonly string[]; bytes: number }
  | { kind: 'forbidden_path'; reason: string; bytes: number }
  | { kind: 'error'; message: string; bytes: number };

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
}

export const DEFAULT_TOOL_LOOP_BOUNDS: ToolLoopBounds = {
  maxCalls: 5,
  maxBytes: 64 * 1024,
  maxExtraInputTokens: 10_000,
  timeoutMs: 60_000,
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
