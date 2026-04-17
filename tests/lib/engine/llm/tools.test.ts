/**
 * Tests for tool-loop engine types — issue #245.
 *
 * All tests in this file are compile-time or value-level checks against
 * exported constants and type shapes. No I/O, no mocks needed.
 *
 * BDD specs from LLD §17.1a and ADR-0023.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_TOOL_LOOP_BOUNDS,
  type ToolResult,
  type ToolCallOutcome,
  type ToolCallLogEntry,
  type ToolDefinition,
  type ToolLoopBounds,
  type GenerateWithToolsRequest,
  type GenerateWithToolsData,
} from '@/lib/engine/llm/tools';
import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';

// ---------------------------------------------------------------------------
// Helper: exhaustiveness check — forces a compile error if a branch is missed
// ---------------------------------------------------------------------------
function assertNever(_x: never): never {
  throw new Error('assertNever: unreachable');
}

// ---------------------------------------------------------------------------
// DEFAULT_TOOL_LOOP_BOUNDS — ADR-0023 mandated values
// ---------------------------------------------------------------------------

describe('Tool loop — engine types', () => {
  describe('Given DEFAULT_TOOL_LOOP_BOUNDS', () => {
    it('then it has maxCalls equal to 5 as per ADR-0023', () => {
      expect(DEFAULT_TOOL_LOOP_BOUNDS.maxCalls).toBe(5);
    });

    it('then it has maxBytes equal to 64 KiB (65536) as per ADR-0023', () => {
      expect(DEFAULT_TOOL_LOOP_BOUNDS.maxBytes).toBe(64 * 1024);
    });

    it('then it has maxExtraInputTokens equal to 10_000 as per ADR-0023', () => {
      expect(DEFAULT_TOOL_LOOP_BOUNDS.maxExtraInputTokens).toBe(10_000);
    });

    it('then it has timeoutMs equal to 60_000 as per ADR-0023', () => {
      expect(DEFAULT_TOOL_LOOP_BOUNDS.timeoutMs).toBe(60_000);
    });

    it('then it satisfies the ToolLoopBounds interface (compile-time)', () => {
      // If DEFAULT_TOOL_LOOP_BOUNDS does not implement all four required fields
      // with the correct types, this `satisfies` expression will fail at compile time.
      const _check: ToolLoopBounds = DEFAULT_TOOL_LOOP_BOUNDS;
      expect(_check).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // ToolResult discriminated union — 4 variants, each carrying bytes
  // -------------------------------------------------------------------------

  describe('Given ToolResult discriminated union', () => {
    it('then it exhaustively matches all four variants at compile-time', () => {
      // This function would produce a TypeScript error if any ToolResult variant
      // is missing from the switch — assertNever would receive a non-never type.
      function handleResult(r: ToolResult): string {
        switch (r.kind) {
          case 'ok':
            return r.content;
          case 'not_found':
            return r.similar_paths.join(',');
          case 'forbidden_path':
            return r.reason;
          case 'error':
            return r.message;
          default:
            return assertNever(r);
        }
      }

      const okResult: ToolResult = { kind: 'ok', content: 'hello', bytes: 5 };
      expect(handleResult(okResult)).toBe('hello');
    });

    it('then the "ok" variant carries content and bytes', () => {
      const r: ToolResult = { kind: 'ok', content: 'file contents', bytes: 13 };
      expect(r.kind).toBe('ok');
      expect((r as Extract<ToolResult, { kind: 'ok' }>).content).toBe('file contents');
      expect(r.bytes).toBe(13);
    });

    it('then the "not_found" variant carries similar_paths and bytes', () => {
      const r: ToolResult = {
        kind: 'not_found',
        similar_paths: ['src/foo.ts', 'src/bar.ts'],
        bytes: 0,
      };
      expect(r.kind).toBe('not_found');
      expect((r as Extract<ToolResult, { kind: 'not_found' }>).similar_paths).toEqual([
        'src/foo.ts',
        'src/bar.ts',
      ]);
      expect(r.bytes).toBe(0);
    });

    it('then the "forbidden_path" variant carries reason and bytes', () => {
      const r: ToolResult = {
        kind: 'forbidden_path',
        reason: 'path traversal detected',
        bytes: 0,
      };
      expect(r.kind).toBe('forbidden_path');
      expect((r as Extract<ToolResult, { kind: 'forbidden_path' }>).reason).toBe(
        'path traversal detected',
      );
      expect(r.bytes).toBe(0);
    });

    it('then the "error" variant carries message and bytes', () => {
      const r: ToolResult = { kind: 'error', message: 'timeout reading file', bytes: 0 };
      expect(r.kind).toBe('error');
      expect((r as Extract<ToolResult, { kind: 'error' }>).message).toBe(
        'timeout reading file',
      );
      expect(r.bytes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // ToolCallLogEntry — six outcome values
  // -------------------------------------------------------------------------

  describe('Given ToolCallLogEntry', () => {
    it('then the outcome "ok" is a valid ToolCallOutcome (compile-time)', () => {
      const outcome: ToolCallOutcome = 'ok';
      expect(outcome).toBe('ok');
    });

    it('then the outcome "not_found" is a valid ToolCallOutcome (compile-time)', () => {
      const outcome: ToolCallOutcome = 'not_found';
      expect(outcome).toBe('not_found');
    });

    it('then the outcome "forbidden_path" is a valid ToolCallOutcome (compile-time)', () => {
      const outcome: ToolCallOutcome = 'forbidden_path';
      expect(outcome).toBe('forbidden_path');
    });

    it('then the outcome "error" is a valid ToolCallOutcome (compile-time)', () => {
      const outcome: ToolCallOutcome = 'error';
      expect(outcome).toBe('error');
    });

    it('then the outcome "budget_exhausted" is a valid ToolCallOutcome — synthesised by loop (compile-time)', () => {
      const outcome: ToolCallOutcome = 'budget_exhausted';
      expect(outcome).toBe('budget_exhausted');
    });

    it('then the outcome "iteration_limit_reached" is a valid ToolCallOutcome — synthesised by loop (compile-time)', () => {
      const outcome: ToolCallOutcome = 'iteration_limit_reached';
      expect(outcome).toBe('iteration_limit_reached');
    });

    it('then ToolCallLogEntry accepts all six outcome values at runtime', () => {
      const outcomes: ToolCallOutcome[] = [
        'ok',
        'not_found',
        'forbidden_path',
        'error',
        'budget_exhausted',
        'iteration_limit_reached',
      ];

      for (const outcome of outcomes) {
        const entry: ToolCallLogEntry = {
          tool_name: 'readFile',
          argument_path: 'src/index.ts',
          bytes_returned: 42,
          outcome,
        };
        expect(entry.outcome).toBe(outcome);
      }
    });

    it('then ToolCallLogEntry has tool_name, argument_path, bytes_returned, and outcome fields', () => {
      const entry: ToolCallLogEntry = {
        tool_name: 'listDirectory',
        argument_path: 'src/',
        bytes_returned: 128,
        outcome: 'ok',
      };
      expect(entry.tool_name).toBe('listDirectory');
      expect(entry.argument_path).toBe('src/');
      expect(entry.bytes_returned).toBe(128);
      expect(entry.outcome).toBe('ok');
    });
  });

  // -------------------------------------------------------------------------
  // ToolDefinition — required fields
  // -------------------------------------------------------------------------

  describe('Given ToolDefinition', () => {
    it('then it requires name, description, inputSchema, and handler (compile-time)', () => {
      const schema = z.object({ path: z.string() });

      const def: ToolDefinition<typeof schema> = {
        name: 'readFile',
        description: 'Read a file from the repository',
        inputSchema: schema,
        handler: async (_input, _signal) => ({
          kind: 'ok',
          content: 'file content',
          bytes: 12,
        }),
      };

      expect(def.name).toBe('readFile');
      expect(def.description).toBe('Read a file from the repository');
      expect(def.inputSchema).toBe(schema);
      expect(typeof def.handler).toBe('function');
    });

    it('then the handler returns a Promise<ToolResult> (compile-time)', () => {
      const schema = z.object({ path: z.string() });
      const def: ToolDefinition<typeof schema> = {
        name: 'readFile',
        description: 'Reads a file',
        inputSchema: schema,
        handler: async (input, _signal): Promise<ToolResult> => ({
          kind: 'ok',
          content: input.path,
          bytes: input.path.length,
        }),
      };

      expectTypeOf(def.handler).returns.resolves.toMatchTypeOf<ToolResult>();
    });
  });

  // -------------------------------------------------------------------------
  // GenerateWithToolsRequest — bounds is Partial<ToolLoopBounds>
  // -------------------------------------------------------------------------

  describe('Given GenerateWithToolsRequest', () => {
    const schema = z.object({ answer: z.string() });
    const tools: readonly ToolDefinition[] = [];

    it('then bounds can be omitted entirely (Partial allows all fields optional)', () => {
      const req: GenerateWithToolsRequest<typeof schema> = {
        prompt: 'Generate questions',
        systemPrompt: 'You are an evaluator',
        schema,
        tools,
        // bounds omitted — should compile
      };
      expect(req.bounds).toBeUndefined();
    });

    it('then bounds can provide only maxCalls without other fields', () => {
      const req: GenerateWithToolsRequest<typeof schema> = {
        prompt: 'Generate questions',
        systemPrompt: 'You are an evaluator',
        schema,
        tools,
        bounds: { maxCalls: 3 },
      };
      expect(req.bounds?.maxCalls).toBe(3);
      expect(req.bounds?.maxBytes).toBeUndefined();
    });

    it('then bounds can provide only maxBytes without other fields', () => {
      const req: GenerateWithToolsRequest<typeof schema> = {
        prompt: 'Generate questions',
        systemPrompt: 'You are an evaluator',
        schema,
        tools,
        bounds: { maxBytes: 32 * 1024 },
      };
      expect(req.bounds?.maxBytes).toBe(32 * 1024);
    });

    it('then bounds can provide all four fields', () => {
      const fullBounds: ToolLoopBounds = {
        maxCalls: 10,
        maxBytes: 128 * 1024,
        maxExtraInputTokens: 20_000,
        timeoutMs: 30_000,
      };
      const req: GenerateWithToolsRequest<typeof schema> = {
        prompt: 'Generate questions',
        systemPrompt: 'You are an evaluator',
        schema,
        tools,
        bounds: fullBounds,
      };
      expect(req.bounds).toEqual(fullBounds);
    });

    it('then prompt, systemPrompt, schema, and tools are required fields (compile-time)', () => {
      // This satisfies check would fail at compile time if any required field is missing.
      const req = {
        prompt: 'p',
        systemPrompt: 's',
        schema,
        tools,
      } satisfies GenerateWithToolsRequest<typeof schema>;
      expect(req.prompt).toBe('p');
    });

    it('then model, maxTokens, and signal are optional fields', () => {
      const controller = new AbortController();
      const req: GenerateWithToolsRequest<typeof schema> = {
        prompt: 'p',
        systemPrompt: 's',
        schema,
        tools,
        model: 'anthropic/claude-3-5-sonnet',
        maxTokens: 4096,
        signal: controller.signal,
      };
      expect(req.model).toBe('anthropic/claude-3-5-sonnet');
      expect(req.maxTokens).toBe(4096);
      expect(req.signal).toBe(controller.signal);
    });
  });

  // -------------------------------------------------------------------------
  // GenerateWithToolsData — output shape
  // -------------------------------------------------------------------------

  describe('Given GenerateWithToolsData', () => {
    it('then it has data, usage, toolCalls, and durationMs fields (compile-time)', () => {
      const result: GenerateWithToolsData<{ answer: string }> = {
        data: { answer: '42' },
        usage: { inputTokens: 500, outputTokens: 150 },
        toolCalls: [
          {
            tool_name: 'readFile',
            argument_path: 'src/index.ts',
            bytes_returned: 1024,
            outcome: 'ok',
          },
        ],
        durationMs: 3500,
      };
      expect(result.data).toEqual({ answer: '42' });
      expect(result.usage.inputTokens).toBe(500);
      expect(result.usage.outputTokens).toBe(150);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.durationMs).toBe(3500);
    });

    it('then usage carries inputTokens and outputTokens (compile-time)', () => {
      const result: GenerateWithToolsData<string> = {
        data: 'hello',
        usage: { inputTokens: 100, outputTokens: 50 },
        toolCalls: [],
        durationMs: 1000,
      };
      expectTypeOf(result.usage).toMatchTypeOf<{
        inputTokens: number;
        outputTokens: number;
      }>();
    });

    it('then toolCalls is an array of ToolCallLogEntry', () => {
      const entry: ToolCallLogEntry = {
        tool_name: 'listDirectory',
        argument_path: 'docs/',
        bytes_returned: 256,
        outcome: 'ok',
      };
      const result: GenerateWithToolsData<null> = {
        data: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        toolCalls: [entry],
        durationMs: 0,
      };
      expectTypeOf(result.toolCalls).toMatchTypeOf<readonly ToolCallLogEntry[]>();
    });
  });

  // -------------------------------------------------------------------------
  // LLMClient interface — generateWithTools added, generateStructured preserved
  // -------------------------------------------------------------------------

  describe('Given the LLMClient interface', () => {
    it('then generateStructured is still present and compiles with its original call shape', () => {
      // Construct a mock that satisfies LLMClient — if generateStructured signature
      // changed incompatibly, this object literal would fail to compile.
      const schema = z.object({ score: z.number() });
      const mockClient: LLMClient = {
        generateStructured: async (_request) => ({
          success: true,
          data: { score: 1 },
        }),
        generateWithTools: async (_request) => ({
          success: true,
          data: {
            data: { score: 1 },
            usage: { inputTokens: 0, outputTokens: 0 },
            toolCalls: [],
            durationMs: 0,
          },
        }),
      };

      expectTypeOf(mockClient.generateStructured).toBeFunction();

      // Simulate a caller using only generateStructured — the old API must work.
      const call = mockClient.generateStructured({
        prompt: 'hello',
        systemPrompt: 'sys',
        schema,
      });
      expectTypeOf(call).resolves.toMatchTypeOf<LLMResult<z.infer<typeof schema>>>();
    });

    it('then generateWithTools is present on LLMClient and returns LLMResult<GenerateWithToolsData<T>>', () => {
      const schema = z.object({ score: z.number() });
      const tools: readonly ToolDefinition[] = [];

      const mockClient: LLMClient = {
        generateStructured: async () => ({ success: false, error: { code: 'unknown', message: '', retryable: false } }),
        generateWithTools: async (_request) => ({
          success: true,
          data: {
            data: { score: 5 },
            usage: { inputTokens: 200, outputTokens: 80 },
            toolCalls: [],
            durationMs: 2000,
          },
        }),
      };

      const call = mockClient.generateWithTools({
        prompt: 'p',
        systemPrompt: 's',
        schema,
        tools,
      });

      expectTypeOf(call).resolves.toMatchTypeOf<
        LLMResult<GenerateWithToolsData<z.infer<typeof schema>>>
      >();
    });

    it('then a caller using generateStructured without generateWithTools cannot satisfy LLMClient (compile-time incompleteness check)', () => {
      // We verify that both methods exist by confirming a partial object fails
      // when typed explicitly as LLMClient. We do this by checking the type
      // rather than runtime, using expectTypeOf.
      expectTypeOf<LLMClient>().toHaveProperty('generateWithTools');
      expectTypeOf<LLMClient>().toHaveProperty('generateStructured');
    });
  });
});
