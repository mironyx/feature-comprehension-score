import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { DEFAULT_TOOL_LOOP_BOUNDS } from '@/lib/engine/llm/tools';
import type {
  ToolResult,
  ToolCallLogEntry,
  ToolCallOutcome,
  ToolDefinition,
  ToolLoopBounds,
  GenerateWithToolsRequest,
  GenerateWithToolsData,
} from '@/lib/engine/llm/tools';
import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';

// ---------------------------------------------------------------------------
// Property 1 — DEFAULT_TOOL_LOOP_BOUNDS numeric values [lld §17.1a] [issue]
// ---------------------------------------------------------------------------

describe('Given DEFAULT_TOOL_LOOP_BOUNDS', () => {
  it('then maxCalls is 5 as per requirements v0.5', () => {
    expect(DEFAULT_TOOL_LOOP_BOUNDS.maxCalls).toBe(5);
  });

  it('then maxBytes is 64 KiB (65536) as per requirements v0.5', () => {
    expect(DEFAULT_TOOL_LOOP_BOUNDS.maxBytes).toBe(64 * 1024);
  });

  it('then maxExtraInputTokens is 10 000 as per requirements v0.5', () => {
    expect(DEFAULT_TOOL_LOOP_BOUNDS.maxExtraInputTokens).toBe(10_000);
  });

  it('then timeoutMs is 120 000 ms (120 s whole-loop) as per requirements v0.5', () => {
    expect(DEFAULT_TOOL_LOOP_BOUNDS.timeoutMs).toBe(120_000);
  });

  it('then perToolCallTimeoutMs is 10 000 ms (10 s per-call, fixed) as per requirements v0.5', () => {
    expect(DEFAULT_TOOL_LOOP_BOUNDS.perToolCallTimeoutMs).toBe(10_000);
  });
});

// ---------------------------------------------------------------------------
// Property 2 — ToolResult discriminated union: exhaustive compile-time check
// [lld §17.1a] [issue]
// ---------------------------------------------------------------------------

describe('Given the ToolResult discriminated union', () => {
  it('then an exhaustive switch over .kind compiles with a never assertion in the default arm', () => {
    // This function will not typecheck unless all four variants are handled.
    // A missing variant causes the default arm to be reachable with a non-never type.
    function describeResult(r: ToolResult): string {
      switch (r.kind) {
        case 'ok':
          // content and bytes exist on this variant [lld §17.1a]
          return `ok: ${r.content.length} chars, ${r.bytes} bytes`;
        case 'not_found':
          // similar_paths and bytes exist on this variant [lld §17.1a]
          return `not_found: ${r.similar_paths.length} suggestions, ${r.bytes} bytes`;
        case 'forbidden_path':
          // reason and bytes exist on this variant [lld §17.1a]
          return `forbidden_path: ${r.reason}, ${r.bytes} bytes`;
        case 'error':
          // message and bytes exist on this variant [lld §17.1a]
          return `error: ${r.message}, ${r.bytes} bytes`;
        default: {
          const _exhaustive: never = r;
          return _exhaustive;
        }
      }
    }

    const ok: ToolResult = { kind: 'ok', content: 'hello', bytes: 5 };
    const notFound: ToolResult = { kind: 'not_found', similar_paths: ['docs/foo.md'], bytes: 0 };
    const forbidden: ToolResult = { kind: 'forbidden_path', reason: 'traversal', bytes: 0 };
    const error: ToolResult = { kind: 'error', message: 'timeout', bytes: 0 };

    expect(describeResult(ok)).toContain('ok');
    expect(describeResult(notFound)).toContain('not_found');
    expect(describeResult(forbidden)).toContain('forbidden_path');
    expect(describeResult(error)).toContain('error');
  });

  it('then the ok variant carries content (string) and bytes (number)', () => {
    const r: ToolResult = { kind: 'ok', content: 'body text', bytes: 9 };
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(typeof r.content).toBe('string');
      expect(typeof r.bytes).toBe('number');
    }
  });

  it('then the not_found variant carries similar_paths and bytes', () => {
    const r: ToolResult = { kind: 'not_found', similar_paths: ['docs/design.md'], bytes: 0 };
    expect(r.kind).toBe('not_found');
    if (r.kind === 'not_found') {
      expect(Array.isArray(r.similar_paths)).toBe(true);
      expect(typeof r.bytes).toBe('number');
    }
  });

  it('then the forbidden_path variant carries reason and bytes', () => {
    const r: ToolResult = { kind: 'forbidden_path', reason: 'absolute path', bytes: 0 };
    expect(r.kind).toBe('forbidden_path');
    if (r.kind === 'forbidden_path') {
      expect(typeof r.reason).toBe('string');
      expect(typeof r.bytes).toBe('number');
    }
  });

  it('then the error variant carries message and bytes', () => {
    const r: ToolResult = { kind: 'error', message: 'network failure', bytes: 0 };
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(typeof r.message).toBe('string');
      expect(typeof r.bytes).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 3 — ToolCallLogEntry.outcome: all six documented literals [lld §17.1a] [issue]
// ---------------------------------------------------------------------------

describe('Given ToolCallLogEntry.outcome', () => {
  it('then all six documented outcome literals are assignable to the outcome field', () => {
    // Compile-time: typed array ensures every literal is a valid ToolCallOutcome.
    const outcomes: ToolCallOutcome[] = [
      'ok',
      'not_found',
      'forbidden_path',
      'error',
      'budget_exhausted',
      'iteration_limit_reached',
    ];
    expect(outcomes).toHaveLength(6);
  });

  it('then an arbitrary string is NOT assignable to ToolCallOutcome (compile-time)', () => {
    // @ts-expect-error — 'whatever' is not a valid ToolCallOutcome
    const bad: ToolCallOutcome = 'whatever';
    void bad;
  });

  it('then a ToolCallLogEntry with each outcome literal is structurally valid', () => {
    const makeEntry = (outcome: ToolCallOutcome): ToolCallLogEntry => ({
      tool_name: 'readFile',
      argument_path: 'docs/adr/0023.md',
      bytes_returned: 0,
      outcome,
    });

    const entries: ToolCallLogEntry[] = [
      makeEntry('ok'),
      makeEntry('not_found'),
      makeEntry('forbidden_path'),
      makeEntry('error'),
      makeEntry('budget_exhausted'),
      makeEntry('iteration_limit_reached'),
    ];

    expect(entries).toHaveLength(6);
    for (const entry of entries) {
      expect(typeof entry.tool_name).toBe('string');
      expect(typeof entry.argument_path).toBe('string');
      expect(typeof entry.bytes_returned).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Property 4 — GenerateWithToolsRequest.bounds is Partial<ToolLoopBounds>
// [lld §17.1a] [issue]
// ---------------------------------------------------------------------------

describe('Given GenerateWithToolsRequest', () => {
  const Schema = z.object({ answer: z.string() });

  it('then bounds is optional — a request without bounds is valid', () => {
    const req: GenerateWithToolsRequest<typeof Schema> = {
      prompt: 'Generate a rubric',
      systemPrompt: 'You are an expert evaluator.',
      schema: Schema,
      tools: [],
    };
    expect(req.bounds).toBeUndefined();
  });

  it('then bounds accepts a subset of ToolLoopBounds keys (Partial)', () => {
    const req: GenerateWithToolsRequest<typeof Schema> = {
      prompt: 'Generate a rubric',
      systemPrompt: 'You are an expert evaluator.',
      schema: Schema,
      tools: [],
      bounds: { maxCalls: 3 },
    };
    expect(req.bounds?.maxCalls).toBe(3);
    expect(req.bounds?.maxBytes).toBeUndefined();
  });

  it('then merging partial bounds with defaults produces full ToolLoopBounds', () => {
    const partial: Partial<ToolLoopBounds> = { maxCalls: 2, timeoutMs: 60_000 };
    const merged: ToolLoopBounds = { ...DEFAULT_TOOL_LOOP_BOUNDS, ...partial };

    expect(merged.maxCalls).toBe(2);
    expect(merged.timeoutMs).toBe(60_000);
    expect(merged.maxBytes).toBe(DEFAULT_TOOL_LOOP_BOUNDS.maxBytes);
    expect(merged.maxExtraInputTokens).toBe(DEFAULT_TOOL_LOOP_BOUNDS.maxExtraInputTokens);
    expect(merged.perToolCallTimeoutMs).toBe(DEFAULT_TOOL_LOOP_BOUNDS.perToolCallTimeoutMs);
  });
});

// ---------------------------------------------------------------------------
// Property 5 — LLMClient interface: generateWithTools does not break
// existing generateStructured callers [lld §17.1a] [issue] [req §E17 AC]
// ---------------------------------------------------------------------------

describe('Given the LLMClient port', () => {
  it('then an object literal satisfying LLMClient compiles with both methods present', () => {
    // Compile-time: if generateWithTools signature is wrong or generateStructured
    // is broken, this satisfies check will fail.
    const stub = {
      generateStructured: async <T extends z.ZodType>(req: {
        prompt: string;
        systemPrompt: string;
        schema: T;
        model?: string;
        maxTokens?: number;
      }): Promise<LLMResult<z.infer<T>>> => {
        void req;
        return { success: false, error: { code: 'unknown', message: 'stub', retryable: false } };
      },
      generateWithTools: async <T extends z.ZodType>(
        req: GenerateWithToolsRequest<T>,
      ): Promise<LLMResult<GenerateWithToolsData<z.infer<T>>>> => {
        void req;
        return { success: false, error: { code: 'unknown', message: 'stub', retryable: false } };
      },
    } satisfies LLMClient;

    expect(typeof stub.generateStructured).toBe('function');
    expect(typeof stub.generateWithTools).toBe('function');
  });

  it('then generateStructured can be called through the LLMClient port type without type error', async () => {
    const Schema2 = z.object({ score: z.number() });
    let capturedSchema: z.ZodType | undefined;

    const client: LLMClient = {
      generateStructured: async (req) => {
        capturedSchema = req.schema;
        // Cast needed: the stub returns a concrete shape; the generic T is opaque here.
        return { success: true, data: { score: 42 } as z.infer<typeof req.schema> };
      },
      generateWithTools: async (_req) => {
        return { success: false, error: { code: 'unknown', message: 'stub', retryable: false } };
      },
    };

    const result = await client.generateStructured({
      prompt: 'p',
      systemPrompt: 's',
      schema: Schema2,
    });

    expect(result.success).toBe(true);
    expect(capturedSchema).toBe(Schema2);
  });
});

// ---------------------------------------------------------------------------
// Property 6 — Engine layer isolation: tools.ts has zero framework/I/O imports
// [lld Invariant 6] [req AC 3]
// ---------------------------------------------------------------------------

describe('Given the engine layer isolation invariant', () => {
  const TOOLS_FILE = resolve(__dirname, '../../../../src/lib/engine/llm/tools.ts');

  const FORBIDDEN_PATTERNS = [
    '@/lib/github',
    '@/lib/supabase',
    'next/',
    'node:fs',
    'node:path',
  ];

  it('then tools.ts imports nothing from @/lib/github', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    expect(content).not.toContain('@/lib/github');
  });

  it('then tools.ts imports nothing from @/lib/supabase', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    expect(content).not.toContain('@/lib/supabase');
  });

  it('then tools.ts imports nothing from next/*', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    expect(content).not.toContain("from 'next/");
    expect(content).not.toContain('from "next/');
  });

  it('then tools.ts imports nothing from node:fs', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    expect(content).not.toContain('node:fs');
  });

  it('then tools.ts imports nothing from node:path', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    expect(content).not.toContain('node:path');
  });

  it('then tools.ts contains no forbidden import strings (combined check)', () => {
    const content = readFileSync(TOOLS_FILE, 'utf-8');
    const violations = FORBIDDEN_PATTERNS.filter((p) => content.includes(p));
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property 7 — ToolDefinition structural shape [lld §17.1a]
// ---------------------------------------------------------------------------

describe('Given ToolDefinition', () => {
  it('then a ToolDefinition with an inputSchema and handler satisfies the type', () => {
    const InputSchema = z.object({ path: z.string() });

    const def: ToolDefinition<typeof InputSchema> = {
      name: 'readFile',
      description: 'Read a file by repo-relative path.',
      inputSchema: InputSchema,
      handler: async (input, signal): Promise<ToolResult> => {
        void signal;
        return { kind: 'ok', content: `contents of ${input.path}`, bytes: 42 };
      },
    };

    expect(def.name).toBe('readFile');
    expect(typeof def.handler).toBe('function');
  });

  it('then the handler receives input inferred from inputSchema (compile-time via type narrowing)', async () => {
    const InputSchema = z.object({ path: z.string(), encoding: z.enum(['utf-8', 'base64']) });
    type Input = z.infer<typeof InputSchema>;

    let capturedInput: Input | undefined;

    const def: ToolDefinition<typeof InputSchema> = {
      name: 'readFileEncoded',
      description: 'Read with explicit encoding.',
      inputSchema: InputSchema,
      handler: async (input, _signal) => {
        capturedInput = input;
        // input.path and input.encoding are accessible — if the type is wrong this won't compile
        return { kind: 'ok', content: `${input.path}:${input.encoding}`, bytes: 0 };
      },
    };

    await def.handler({ path: 'docs/adr/0023.md', encoding: 'utf-8' }, new AbortController().signal);
    expect(capturedInput?.path).toBe('docs/adr/0023.md');
    expect(capturedInput?.encoding).toBe('utf-8');
  });

  it('then the handler accepts an AbortSignal as its second argument', async () => {
    const InputSchema = z.object({ path: z.string() });
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;

    const def: ToolDefinition<typeof InputSchema> = {
      name: 'signalCheck',
      description: 'Checks signal propagation.',
      inputSchema: InputSchema,
      handler: async (_input, signal) => {
        receivedSignal = signal;
        return { kind: 'ok', content: '', bytes: 0 };
      },
    };

    await def.handler({ path: 'x' }, controller.signal);
    expect(receivedSignal).toBe(controller.signal);
  });
});

// ---------------------------------------------------------------------------
// Property 8 — GenerateWithToolsData<T> shape [lld §17.1a] [issue]
// ---------------------------------------------------------------------------

describe('Given GenerateWithToolsData', () => {
  it('then the data field carries the generic type parameter T', () => {
    type MyData = { rubric: string[] };
    const d: GenerateWithToolsData<MyData> = {
      data: { rubric: ['Q1', 'Q2'] },
      usage: { inputTokens: 1200, outputTokens: 300 },
      toolCalls: [],
      durationMs: 4200,
    };
    expect(d.data.rubric).toHaveLength(2);
  });

  it('then usage carries inputTokens and outputTokens as numbers', () => {
    const d: GenerateWithToolsData<string> = {
      data: 'hello',
      usage: { inputTokens: 500, outputTokens: 100 },
      toolCalls: [],
      durationMs: 1000,
    };
    expect(typeof d.usage.inputTokens).toBe('number');
    expect(typeof d.usage.outputTokens).toBe('number');
  });

  it('then toolCalls is an array of ToolCallLogEntry', () => {
    const entry: ToolCallLogEntry = {
      tool_name: 'listDirectory',
      argument_path: 'docs/',
      bytes_returned: 128,
      outcome: 'ok',
    };
    const d: GenerateWithToolsData<null> = {
      data: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      toolCalls: [entry],
      durationMs: 0,
    };
    expect(d.toolCalls).toHaveLength(1);
    expect(d.toolCalls[0]!.outcome).toBe('ok');
  });

  it('then durationMs is a number', () => {
    const d: GenerateWithToolsData<boolean> = {
      data: true,
      usage: { inputTokens: 0, outputTokens: 0 },
      toolCalls: [],
      durationMs: 3750,
    };
    expect(typeof d.durationMs).toBe('number');
    expect(d.durationMs).toBe(3750);
  });
});
