import type { ZodType, z } from 'zod';

export type ToolResult =
  | { kind: 'ok'; content: string; bytes: number }
  | { kind: 'not_found'; similar_paths: string[]; bytes: number }
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
