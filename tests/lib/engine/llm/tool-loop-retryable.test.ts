// Regression tests for issue #280 — all 5 malformed_response failure paths in
// runToolLoop must produce retryable: true, because the retry endpoint runs a
// full pipeline re-run and the LLM can succeed on a fresh attempt.
//
// Contract source: GitHub issue #280
// Requirements: docs/requirements/v2-requirements.md
//
// Observable properties tested (1 assertion per property):
//   1. JSON parse failure → error.retryable === true
//   2. JSON parse failure → error.code === 'malformed_response'
//   3. Schema validation failure → error.retryable === true
//   4. Schema validation failure → error.code === 'malformed_response'
//   5. Empty final content → error.retryable === true
//   6. Empty final content → error.code === 'malformed_response'
//   7. Missing assistant message (choices: []) → error.retryable === true
//   8. Missing assistant message → error.code === 'malformed_response'
//   9. Loop turn cap exceeded → error.retryable === true
//  10. Loop turn cap exceeded → error.code === 'malformed_response'

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { runToolLoop, type ChatCallFn } from '@/lib/engine/llm/tool-loop';
import type { ToolDefinition } from '@/lib/engine/llm/tools';

// ---------------------------------------------------------------------------
// Shared schema — final structured output expected from the LLM
// ---------------------------------------------------------------------------

const FinalSchema = z.object({ summary: z.string() });

// ---------------------------------------------------------------------------
// Response builders — adapted from tool-loop-on-tool-call.test.ts patterns
// (NOT duplicating factories; these are minimal variants for error-path driving)
// ---------------------------------------------------------------------------

/** Final response whose content is not valid JSON. */
function makeBadJsonResponse() {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '{ this is not json >>>',
          tool_calls: undefined,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  };
}

/** Final response that is valid JSON but fails the Zod schema (missing required field). */
function makeSchemaMismatchResponse() {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          // 'summary' field is absent — schema requires it
          content: JSON.stringify({ unrelated_key: 'value' }),
          tool_calls: undefined,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 20 },
  };
}

/** Final response whose content string is empty. */
function makeEmptyContentResponse() {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: undefined,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 5 },
  };
}

/** Response with no choices — simulates missing assistant message. */
function makeNoChoicesResponse() {
  return {
    choices: [],
    usage: { prompt_tokens: 50, completion_tokens: 0 },
  };
}

/** Tool-call response — drives the loop to keep issuing tool calls. */
function makeToolCallResponse(id: string) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id,
              type: 'function' as const,
              function: { name: 'readFile', arguments: JSON.stringify({ path: 'a.md' }) },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 30 },
  };
}

// ---------------------------------------------------------------------------
// Base params factory — mirrors makeLoopParams in tool-loop-on-tool-call.test.ts
// ---------------------------------------------------------------------------

function makeLoopParams(
  chatCall: ChatCallFn,
  overrides: Partial<Parameters<typeof runToolLoop>[0]['req']> = {},
): Parameters<typeof runToolLoop>[0] {
  return {
    req: {
      prompt: 'Generate questions.',
      systemPrompt: 'You are an expert evaluator.',
      schema: FinalSchema,
      tools: [],
      ...overrides,
    },
    chatCall,
    defaultModel: 'test-model',
    startMs: Date.now(),
  };
}

/** A minimal passthrough tool that always succeeds, used to keep the loop alive. */
function makePassthroughTool(): ToolDefinition {
  return {
    name: 'readFile',
    description: 'Read a file',
    inputSchema: z.object({ path: z.string() }),
    handler: vi.fn(async () => ({ kind: 'ok' as const, content: 'content', bytes: 7 })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runToolLoop malformed_response error paths — retryable contract (#280)', () => {

  // =========================================================================
  // Path 1: JSON parse failure in final content (validateFinalContent line ~242)
  // =========================================================================

  describe('Given the LLM returns final content that is not valid JSON', () => {
    it('Property 1 (#280 regression): error.retryable is true', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeBadJsonResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.retryable).toBe(true);
    });

    it('Property 2: error.code is malformed_response', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeBadJsonResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('malformed_response');
    });
  });

  // =========================================================================
  // Path 2: Schema validation failure in final content (validateFinalContent line ~249)
  // =========================================================================

  describe('Given the LLM returns final content that is valid JSON but fails the Zod schema', () => {
    it('Property 3 (#280 regression): error.retryable is true', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeSchemaMismatchResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.retryable).toBe(true);
    });

    it('Property 4: error.code is malformed_response', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeSchemaMismatchResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('malformed_response');
    });
  });

  // =========================================================================
  // Path 3: Empty final content (finalise line ~264)
  // =========================================================================

  describe('Given the LLM returns a final response with empty string content', () => {
    it('Property 5 (#280 regression): error.retryable is true', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeEmptyContentResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.retryable).toBe(true);
    });

    it('Property 6: error.code is malformed_response', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeEmptyContentResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('malformed_response');
    });
  });

  // =========================================================================
  // Path 4: No assistant message in response — choices: [] (runToolLoop line ~301)
  // =========================================================================

  describe('Given the LLM returns a response with no choices', () => {
    it('Property 7 (#280 regression): error.retryable is true', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeNoChoicesResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.retryable).toBe(true);
    });

    it('Property 8: error.code is malformed_response', async () => {
      const chatCall = vi.fn().mockResolvedValueOnce(makeNoChoicesResponse());
      const result = await runToolLoop(makeLoopParams(chatCall));

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('malformed_response');
    });
  });

  // =========================================================================
  // Path 5: Loop turn cap exceeded (runToolLoop line ~308)
  // The loop turn cap is maxCalls + 2 extra turns. We set maxCalls=1 and
  // drive the mock to keep returning tool calls so the cap is hit.
  // =========================================================================

  describe('Given the LLM keeps issuing tool calls past the loop turn cap', () => {
    it('Property 9 (#280 regression): error.retryable is true', async () => {
      const tool = makePassthroughTool();

      // Keep returning tool calls indefinitely — the loop will exhaust its
      // turn cap and produce a malformed_response error.
      const chatCall = vi.fn().mockResolvedValue(makeToolCallResponse('tc-infinite'));

      const result = await runToolLoop(
        makeLoopParams(chatCall, {
          tools: [tool],
          bounds: { maxCalls: 1, maxBytes: 1_000_000, maxExtraInputTokens: 100_000, timeoutMs: 30_000, perToolCallTimeoutMs: 5_000 },
        }),
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.retryable).toBe(true);
    });

    it('Property 10: error.code is malformed_response', async () => {
      const tool = makePassthroughTool();

      const chatCall = vi.fn().mockResolvedValue(makeToolCallResponse('tc-infinite'));

      const result = await runToolLoop(
        makeLoopParams(chatCall, {
          tools: [tool],
          bounds: { maxCalls: 1, maxBytes: 1_000_000, maxExtraInputTokens: 100_000, timeoutMs: 30_000, perToolCallTimeoutMs: 5_000 },
        }),
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.code).toBe('malformed_response');
    });
  });
});
