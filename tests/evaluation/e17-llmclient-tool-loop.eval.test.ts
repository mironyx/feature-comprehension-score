import { readFileSync } from 'fs';
import { resolve } from 'path';
import OpenAI from 'openai';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

import { OpenRouterClient } from '@/lib/engine/llm/client';
import type { ToolDefinition, ToolResult } from '@/lib/engine/llm/tools';

// ---------------------------------------------------------------------------
// Engine-layer isolation — types.ts
//
// tools.test.ts (Property 6) already checks tools.ts for forbidden imports.
// types.ts was also modified in §17.1a (gained import from ./tools) and is
// equally part of the engine layer. AC-3 says "engine layer has zero
// framework/I/O imports" — this test extends that invariant to types.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Adversarial gap: 'error' outcome — handler returns kind='error' or throws
//
// The ToolCallOutcome type includes 'error' as one of the six documented
// literals (lld §17.1a, issue #250 AC). The test-author covered 'ok',
// 'not_found', 'iteration_limit_reached', and 'budget_exhausted', but
// neither the handler-returns-error-kind path nor the unknown-tool-name
// path (which also maps to outcome='error') were exercised.
// ---------------------------------------------------------------------------

const FinalSchema = z.object({ summary: z.string(), score: z.number() });

function makeMockOpenAI() {
  return { chat: { completions: { create: vi.fn() } } };
}

function makeToolCallResponse(
  toolCalls: Array<{ id: string; name: string; arguments: object }>,
) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 30 },
  };
}

const DEFAULT_FINAL = {
  choices: [{ message: { role: 'assistant', content: JSON.stringify({ summary: 'ok', score: 1 }), tool_calls: undefined } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

describe('Given a tool handler that returns kind=error', () => {
  let mockOpenAI: ReturnType<typeof makeMockOpenAI>;
  let client: OpenRouterClient;

  beforeEach(() => {
    mockOpenAI = makeMockOpenAI();
    client = new OpenRouterClient({
      apiKey: 'test-key',
      openAIClient: mockOpenAI as unknown as OpenAI,
      retryConfig: { maxRetries: 0, baseDelayMs: 10, maxDelayMs: 100 },
    });
  });

  it('then the toolCalls log entry has outcome error', async () => {
    const errorTool: ToolDefinition = {
      name: 'readFile',
      description: 'always errors',
      inputSchema: z.object({ path: z.string() }),
      handler: vi.fn(async (): Promise<ToolResult> => ({
        kind: 'error',
        message: 'disk full',
        bytes: 0,
      })),
    };

    mockOpenAI.chat.completions.create
      .mockResolvedValueOnce(
        makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'a.md' } }]),
      )
      .mockResolvedValueOnce(DEFAULT_FINAL);

    const result = await client.generateWithTools({
      prompt: 'p',
      systemPrompt: 's',
      schema: FinalSchema,
      tools: [errorTool],
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.toolCalls[0]!.outcome).toBe('error');
  });

  it('then the toolCalls log entry has outcome error when the LLM calls an unknown tool name', async () => {
    const knownTool: ToolDefinition = {
      name: 'readFile',
      description: 'known tool',
      inputSchema: z.object({ path: z.string() }),
      handler: vi.fn(async (): Promise<ToolResult> => ({ kind: 'ok', content: 'x', bytes: 1 })),
    };

    // LLM requests a tool that is not in the tools list
    mockOpenAI.chat.completions.create
      .mockResolvedValueOnce(
        makeToolCallResponse([{ id: 'c1', name: 'unknownTool', arguments: { path: 'a.md' } }]),
      )
      .mockResolvedValueOnce(DEFAULT_FINAL);

    const result = await client.generateWithTools({
      prompt: 'p',
      systemPrompt: 's',
      schema: FinalSchema,
      tools: [knownTool],
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    // Unknown tool name → breach with outcome='error'; known handler must not be called
    expect(result.data.toolCalls[0]!.outcome).toBe('error');
    expect(knownTool.handler).not.toHaveBeenCalled();
  });
});

describe('Given the engine layer isolation invariant (types.ts)', () => {
  const TYPES_FILE = resolve(__dirname, '../../src/lib/engine/llm/types.ts');

  const FORBIDDEN_PATTERNS = [
    '@/lib/github',
    '@/lib/supabase',
    "from 'next/",
    'from "next/',
    'node:fs',
    'node:path',
  ];

  it('then types.ts contains no forbidden framework/I/O import strings', () => {
    const content = readFileSync(TYPES_FILE, 'utf-8');
    const violations = FORBIDDEN_PATTERNS.filter((p) => content.includes(p));
    expect(violations).toHaveLength(0);
  });
});
