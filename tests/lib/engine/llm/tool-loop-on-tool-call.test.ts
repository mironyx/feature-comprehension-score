// Tests for the onToolCall callback contract on runToolLoop — Story 18.1 §C.
// Design reference: docs/design/lld-e18.md §18.1 "onToolCall callback — engine-to-service bridge"
// Requirements: docs/requirements/v2-requirements.md §Epic 18 Story 18.1
// Issue: #272

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

import { runToolLoop, type ChatCallFn } from '@/lib/engine/llm/tool-loop';
import type { ToolDefinition, ToolCallEvent } from '@/lib/engine/llm/tools';

// ---------------------------------------------------------------------------
// Shared schema — final structured output produced by the LLM
// ---------------------------------------------------------------------------

const FinalSchema = z.object({ summary: z.string() });

// ---------------------------------------------------------------------------
// Response builders — mirrors generate-with-tools.test.ts patterns
// ---------------------------------------------------------------------------

function makeFinalResponse(summary = 'done') {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify({ summary }),
          tool_calls: undefined,
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function makeToolCallResponse(toolCalls: Array<{ id: string; name: string; arguments: object }>) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 80, completion_tokens: 30 },
  };
}

// ---------------------------------------------------------------------------
// Tool definition builders
// ---------------------------------------------------------------------------

const PathInputSchema = z.object({ path: z.string() });

function makeSuccessTool(name: string, bytes = 42): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: PathInputSchema,
    handler: vi.fn(async () => ({ kind: 'ok' as const, content: 'x'.repeat(bytes), bytes })),
  };
}

function makeNotFoundTool(name: string): ToolDefinition {
  return {
    name,
    description: `Not-found tool: ${name}`,
    inputSchema: PathInputSchema,
    handler: vi.fn(async () => ({ kind: 'not_found' as const, similar_paths: [], bytes: 0 })),
  };
}

// ---------------------------------------------------------------------------
// Base runToolLoop params factory
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onToolCall callback (engine layer)', () => {
  let capturedEvents: ToolCallEvent[];

  beforeEach(() => {
    capturedEvents = [];
  });

  // =========================================================================
  // C1 — Single successful tool call → callback invoked once with correct shape
  // =========================================================================

  describe('Given one successful tool call', () => {
    it('C1: then onToolCall is invoked exactly once with toolName, argumentPath, bytesReturned, outcome: "ok", and toolCallCount: 1', async () => {
      const tool = makeSuccessTool('readFile', 42);
      const onToolCall = vi.fn((event: ToolCallEvent) => {
        capturedEvents.push(event);
      });

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      const result = await runToolLoop(makeLoopParams(chatCall, { tools: [tool], onToolCall }));

      expect(result.success).toBe(true);
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(capturedEvents[0]).toMatchObject({
        toolName: 'readFile',
        argumentPath: 'docs/adr/0023.md',
        bytesReturned: 42,
        outcome: 'ok',
        toolCallCount: 1,
      });
    });
  });

  // =========================================================================
  // C2 — Two successful tool calls → cumulative toolCallCount values 1, 2
  // =========================================================================

  describe('Given two sequential successful tool calls', () => {
    it('C2: then onToolCall is invoked twice with toolCallCount values 1 then 2 (cumulative)', async () => {
      const tool = makeSuccessTool('readFile', 10);
      const onToolCall = vi.fn((event: ToolCallEvent) => {
        capturedEvents.push(event);
      });

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      await runToolLoop(makeLoopParams(chatCall, { tools: [tool], onToolCall }));

      expect(onToolCall).toHaveBeenCalledTimes(2);
      expect(capturedEvents[0]!.toolCallCount).toBe(1);
      expect(capturedEvents[1]!.toolCallCount).toBe(2);
    });
  });

  // =========================================================================
  // C3 — Iteration limit breach → onToolCall NOT invoked for the breached call
  // =========================================================================

  describe('Given maxCalls=1 and the LLM requests 2 calls in one turn', () => {
    it('C3: then onToolCall is NOT invoked for the second (breached) call', async () => {
      const tool = makeSuccessTool('readFile', 10);
      const onToolCall = vi.fn((event: ToolCallEvent) => {
        capturedEvents.push(event);
      });

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      await runToolLoop(makeLoopParams(chatCall, {
        tools: [tool],
        onToolCall,
        bounds: { maxCalls: 1 },
      }));

      // Only the first (honoured) call should have triggered the callback
      expect(onToolCall).toHaveBeenCalledTimes(1);
      // The one event that fired must be for the successful call
      expect(capturedEvents[0]!.outcome).toBe('ok');
    });
  });

  // =========================================================================
  // C4 — onToolCall omitted → loop completes without error
  // =========================================================================

  describe('Given onToolCall is not provided', () => {
    it('C4: then the tool loop completes successfully without throwing', async () => {
      const tool = makeSuccessTool('readFile', 10);

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'a.md' } }]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      // No onToolCall — should not throw
      const result = await runToolLoop(makeLoopParams(chatCall, {
        tools: [tool],
        // onToolCall deliberately omitted
      }));

      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // C5 — bytesReturned matches the handler's returned bytes value
  // =========================================================================

  describe('Given a tool handler that returns 99 bytes', () => {
    it('C5: then the onToolCall callback receives bytesReturned=99', async () => {
      const tool = makeSuccessTool('readFile', 99);
      const onToolCall = vi.fn((event: ToolCallEvent) => {
        capturedEvents.push(event);
      });

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'large.md' } }]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      await runToolLoop(makeLoopParams(chatCall, { tools: [tool], onToolCall }));

      expect(capturedEvents[0]!.bytesReturned).toBe(99);
    });
  });

  // =========================================================================
  // C6 — outcome in callback matches the tool handler's returned kind
  // =========================================================================

  describe('Given a tool handler that returns kind: "not_found"', () => {
    it('C6: then the onToolCall callback receives outcome: "not_found"', async () => {
      const tool = makeNotFoundTool('readFile');
      const onToolCall = vi.fn((event: ToolCallEvent) => {
        capturedEvents.push(event);
      });

      const chatCall = vi.fn()
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'missing.md' } }]),
        )
        .mockResolvedValueOnce(makeFinalResponse());

      await runToolLoop(makeLoopParams(chatCall, { tools: [tool], onToolCall }));

      expect(capturedEvents[0]!.outcome).toBe('not_found');
    });
  });
});
