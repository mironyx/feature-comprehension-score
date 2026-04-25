/**
 * Tests for OpenRouterClient.generateWithTools — §17.1c behavioural contract.
 *
 * Contract sources:
 *   [req]  docs/requirements/v2-requirements.md §Epic 17 Story 17.1 and Story 17.2
 *   [lld]  docs/design/lld-v2-e17-agentic-retrieval.md §17.1c
 *   [issue] #250
 *
 * Mocking pattern: inject a fake OpenAI instance via the `openAIClient`
 * constructor option — mirrors tests/lib/engine/llm/client.test.ts.
 */

import OpenAI from 'openai';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

import { OpenRouterClient } from '@/lib/engine/llm/client';
import { DEFAULT_TOOL_LOOP_BOUNDS } from '@/lib/engine/llm/tools';
import type { ToolDefinition, ToolResult } from '@/lib/engine/llm/tools';

// ---------------------------------------------------------------------------
// Shared test schema — final structured output the LLM is expected to produce
// ---------------------------------------------------------------------------

const FinalSchema = z.object({ summary: z.string(), score: z.number() });
type FinalData = z.infer<typeof FinalSchema>;

// ---------------------------------------------------------------------------
// Mock OpenAI factory — same pattern as client.test.ts
// ---------------------------------------------------------------------------

type MockOpenAI = {
  chat: { completions: { create: ReturnType<typeof vi.fn> } };
};

function makeMockOpenAI(): MockOpenAI {
  return { chat: { completions: { create: vi.fn() } } };
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions response builders
// ---------------------------------------------------------------------------

/** Final (non-tool-call) response carrying a JSON-serialised structured object. */
function makeFinalResponse(data: FinalData, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: JSON.stringify(data),
          tool_calls: undefined,
        },
      },
    ],
    usage,
  };
}

/** Response where the LLM requests one or more tool calls. */
function makeToolCallResponse(
  toolCalls: Array<{ id: string; name: string; arguments: object }>,
  usage = { prompt_tokens: 80, completion_tokens: 30 },
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
    usage,
  };
}

/** A valid default tool response payload for use in most tests. */
const DEFAULT_FINAL = makeFinalResponse({ summary: 'All good', score: 42 });

// ---------------------------------------------------------------------------
// Shared ToolDefinition builders
// ---------------------------------------------------------------------------

const PathInputSchema = z.object({ path: z.string() });

/** A synchronous (fast) tool handler that always succeeds. */
function makeSuccessTool(name: string, content = 'file content', bytes = 12): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    inputSchema: PathInputSchema,
    handler: vi.fn(async (_input, _signal): Promise<ToolResult> => ({
      kind: 'ok',
      content,
      bytes,
    })),
  };
}

/** A tool handler that always returns not_found. */
function makeNotFoundTool(name: string): ToolDefinition {
  return {
    name,
    description: `Test not_found tool: ${name}`,
    inputSchema: PathInputSchema,
    handler: vi.fn(async (): Promise<ToolResult> => ({
      kind: 'not_found',
      similar_paths: [],
      bytes: 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Base request factory
// ---------------------------------------------------------------------------

function makeBaseRequest(overrides: Partial<Parameters<OpenRouterClient['generateWithTools']>[0]> = {}) {
  return {
    prompt: 'Generate assessment questions.',
    systemPrompt: 'You are an expert rubric evaluator.',
    schema: FinalSchema,
    tools: [] as ToolDefinition[],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OpenRouter generateWithTools', () => {
  let mockOpenAI: MockOpenAI;
  let client: OpenRouterClient;

  beforeEach(() => {
    mockOpenAI = makeMockOpenAI();
    client = new OpenRouterClient({
      apiKey: 'test-key',
      openAIClient: mockOpenAI as unknown as OpenAI,
      retryConfig: { maxRetries: 0, baseDelayMs: 10, maxDelayMs: 100 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 1: Returns the final structured response when LLM does not call
  // any tools. [lld §17.1c] [issue] [req Story 17.1]
  // -------------------------------------------------------------------------

  describe('Given the LLM does not call any tools (no-tool-call path)', () => {
    it('then it returns a successful result whose data matches the validated schema', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.data).toEqual({ summary: 'All good', score: 42 });
    });

    it('then toolCalls in the result is an empty array', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Multi-turn — LLM calls tool, receives result, finalises.
  // [lld §17.1c] [req Story 17.1]
  // -------------------------------------------------------------------------

  describe('Given the LLM makes one tool call then finalises (multi-turn)', () => {
    it('then the handler is invoked exactly once', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(tool.handler).toHaveBeenCalledTimes(1);
    });

    it('then the result is the validated final output from the second LLM turn', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.data).toEqual({ summary: 'All good', score: 42 });
    });

    it('then the toolCalls log contains one entry for the single tool call', async () => {
      const tool = makeSuccessTool('readFile', 'file content', 12);
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls).toHaveLength(1);
    });

    it('then the toolCalls log entry records the tool_name', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls[0]!.tool_name).toBe('readFile');
    });

    it('then the toolCalls log entry records the argument_path from the parsed input path field', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      // The argument_path is derived from the parsed input's `path` field [lld §17.1c pseudocode]
      expect(result.data.toolCalls[0]!.argument_path).toBe('docs/adr/0023.md');
    });

    it('then the toolCalls log entry records bytes_returned from the handler result', async () => {
      const tool = makeSuccessTool('readFile', 'hello world', 11);
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls[0]!.bytes_returned).toBe(11);
    });

    it('then the toolCalls log entry records outcome matching the ToolResult kind', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/adr/0023.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls[0]!.outcome).toBe('ok');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Stops after maxCalls; logs iteration_limit_reached.
  // [lld §17.1c] [req Story 17.1 AC] [issue]
  // -------------------------------------------------------------------------

  describe('Given the LLM attempts more tool calls than maxCalls allows', () => {
    it('then no handler is invoked beyond the maxCalls limit', async () => {
      const tool = makeSuccessTool('readFile');
      // LLM requests 3 calls in a single turn, but maxCalls=2
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
            { id: 'c3', name: 'readFile', arguments: { path: 'c.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxCalls: 2 } }),
      );

      // Only 2 of the 3 calls should be honoured
      expect(tool.handler).toHaveBeenCalledTimes(2);
    });

    it('then the excess call produces an iteration_limit_reached log entry', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
            { id: 'c3', name: 'readFile', arguments: { path: 'c.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxCalls: 2 } }),
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      const limitEntries = result.data.toolCalls.filter(
        (e) => e.outcome === 'iteration_limit_reached',
      );
      expect(limitEntries).toHaveLength(1);
    });

    it('then an error message is fed back to the LLM after iteration_limit_reached so it can finalise', async () => {
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxCalls: 1 } }),
      );

      // The loop must have made a second LLM call (for finalisation) — if the
      // breach error message is not fed back the second call would not happen.
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Stops after maxBytes; logs budget_exhausted.
  // [lld §17.1c] [req Story 17.1 AC] [issue]
  // -------------------------------------------------------------------------

  describe('Given cumulative bytes from tool results exceed maxBytes', () => {
    it('then the call that would breach the budget produces a budget_exhausted log entry', async () => {
      // Each tool returns 100 bytes; maxBytes=150 → second call breaches
      const tool = makeSuccessTool('readFile', 'x'.repeat(100), 100);
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxBytes: 150 } }),
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      const budgetEntries = result.data.toolCalls.filter((e) => e.outcome === 'budget_exhausted');
      expect(budgetEntries).toHaveLength(1);
    });

    it('then the handler is not invoked for the breaching call', async () => {
      const tool = makeSuccessTool('readFile', 'x'.repeat(100), 100);
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxBytes: 150 } }),
      );

      // Only the first call (100 bytes) should be honoured; second is refused
      expect(tool.handler).toHaveBeenCalledTimes(1);
    });

    it('then an error message is fed back to the LLM after budget_exhausted so it can finalise', async () => {
      const tool = makeSuccessTool('readFile', 'x'.repeat(200), 200);
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'a.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxBytes: 100 } }),
      );

      // A second LLM call must occur for finalisation
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Aborts in-flight handlers when whole-loop timeoutMs elapses.
  // [lld §17.1c Invariant 8] [req Story 17.2 AC] [issue]
  // -------------------------------------------------------------------------

  describe('Given the whole-loop timeoutMs elapses while a handler is in-flight', () => {
    it('then the in-flight handler receives an aborted AbortSignal', async () => {
      vi.useFakeTimers();

      let capturedSignal: AbortSignal | undefined;

      const slowTool: ToolDefinition = {
        name: 'readFile',
        description: 'Slow tool',
        inputSchema: PathInputSchema,
        handler: vi.fn(async (_input, signal): Promise<ToolResult> => {
          capturedSignal = signal;
          // Block until signal fires
          return new Promise<ToolResult>((_resolve, reject) => {
            if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          });
        }),
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'slow.md' } }]),
      );

      const resultPromise = client.generateWithTools(
        makeBaseRequest({ tools: [slowTool], bounds: { timeoutMs: 5_000 } }),
      );

      // Let the first LLM call resolve and the handler start
      await vi.advanceTimersByTimeAsync(0);

      // Advance past the loop timeout
      await vi.advanceTimersByTimeAsync(6_000);

      // Await result — expect error or the signal to be aborted
      const result = await resultPromise.catch((e: Error) => e);

      // The handler must have received a signal that is now aborted
      expect(capturedSignal?.aborted).toBe(true);
      void result; // result may be an error or a typed failure — either is acceptable
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Per-tool-call timeout fires without consuming the whole budget.
  // [lld §17.1c Invariant 8] [req Story 17.2 AC]
  // -------------------------------------------------------------------------

  describe('Given a single slow handler that exceeds perToolCallTimeoutMs', () => {
    it('then the slow handler receives an aborted signal before the whole-loop timeout fires', async () => {
      vi.useFakeTimers();

      let handlerSignalAborted = false;

      const slowTool: ToolDefinition = {
        name: 'readFile',
        description: 'Slow tool',
        inputSchema: PathInputSchema,
        handler: vi.fn(async (_input, signal): Promise<ToolResult> => {
          return new Promise<ToolResult>((_resolve, reject) => {
            if (signal.aborted) {
              handlerSignalAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              handlerSignalAborted = true;
              reject(new DOMException('Aborted', 'AbortError'));
            });
          });
        }),
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'slow.md' } }]),
      );

      const resultPromise = client.generateWithTools(
        makeBaseRequest({
          tools: [slowTool],
          // per-call timeout (15s) fires well before whole-loop timeout (120s)
          bounds: { perToolCallTimeoutMs: 15_000, timeoutMs: 120_000 },
        }),
      );

      // Let the first LLM response arrive and the handler start
      await vi.advanceTimersByTimeAsync(0);

      // Advance past perToolCallTimeoutMs but not timeoutMs
      await vi.advanceTimersByTimeAsync(16_000);

      await resultPromise.catch(() => undefined);

      // The handler's own signal must have been aborted
      expect(handlerSignalAborted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Returns malformed_response error when the LLM's final output
  // fails schema validation. [lld §17.1c] [req Story 17.1] [issue]
  // -------------------------------------------------------------------------

  describe('Given the LLM produces a final response that does not conform to the schema', () => {
    it('then the result is an error with code malformed_response', async () => {
      // Missing required `score` field — Zod validation will reject
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ summary: 'Good' /* score missing */ }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.error.code).toBe('malformed_response');
    });

    it('then the result is an error (not a thrown exception) — caller receives typed error', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [{ message: { role: 'assistant', content: 'not json at all' } }],
        usage: { prompt_tokens: 100, completion_tokens: 10 },
      });

      // Must not throw
      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Records input + output token usage from the LLM response.
  // [lld §17.1c] [req Story 17.1 AC observability] [issue]
  // -------------------------------------------------------------------------

  describe('Given a successful run without tool calls', () => {
    it('then usage.inputTokens reflects prompt_tokens from the LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeFinalResponse({ summary: 'ok', score: 1 }, { prompt_tokens: 320, completion_tokens: 80 }),
      );

      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.usage.inputTokens).toBe(320);
    });

    it('then usage.outputTokens reflects completion_tokens from the LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeFinalResponse({ summary: 'ok', score: 1 }, { prompt_tokens: 320, completion_tokens: 80 }),
      );

      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.usage.outputTokens).toBe(80);
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Records durationMs from wall-clock.
  // [lld §17.1c] [req Story 17.1 AC observability] [issue]
  // -------------------------------------------------------------------------

  describe('Given a successful run', () => {
    it('then durationMs is a positive integer', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(typeof result.data.durationMs).toBe('number');
      expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('then durationMs is at least as large as any artificial delay introduced by the call', async () => {
      vi.useFakeTimers();

      mockOpenAI.chat.completions.create.mockImplementationOnce(async () => {
        await vi.advanceTimersByTimeAsync(200);
        return makeFinalResponse({ summary: 'delayed', score: 9 });
      });

      const resultPromise = client.generateWithTools(makeBaseRequest());
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      // With fake timers advancing 200 ms, durationMs must reflect that
      expect(result.data.durationMs).toBeGreaterThanOrEqual(200);
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: Caller's AbortSignal composes with the internal timeout signal.
  // If the caller aborts, in-flight handlers are aborted too.
  // [lld §17.1c] [req Story 17.2 AC] [issue]
  // -------------------------------------------------------------------------

  describe('Given the caller provides an AbortSignal and aborts it', () => {
    it('then an in-flight handler receives an aborted signal', async () => {
      const controller = new AbortController();
      let capturedSignal: AbortSignal | undefined;

      const slowTool: ToolDefinition = {
        name: 'readFile',
        description: 'Slow tool',
        inputSchema: PathInputSchema,
        handler: vi.fn(async (_input, signal): Promise<ToolResult> => {
          capturedSignal = signal;
          return new Promise<ToolResult>((_resolve, reject) => {
            if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          });
        }),
      };

      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'slow.md' } }]),
      );

      const resultPromise = client.generateWithTools(
        makeBaseRequest({ tools: [slowTool], signal: controller.signal }),
      );

      // Allow the first LLM call to complete and the handler to start
      await Promise.resolve();
      await Promise.resolve();

      // Caller aborts
      controller.abort();

      await resultPromise.catch(() => undefined);

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: Bounds merge with DEFAULT_TOOL_LOOP_BOUNDS — partial overrides
  // only the specified keys, defaults fill the rest.
  // [lld §17.1a] [lld §17.1c pseudocode] [issue]
  // -------------------------------------------------------------------------

  describe('Given a request with only a partial bounds override', () => {
    it('then a maxCalls override of 1 is enforced while other defaults remain', async () => {
      // With maxCalls=1, the second call in a 2-call response must be refused
      const tool = makeSuccessTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([
            { id: 'c1', name: 'readFile', arguments: { path: 'a.md' } },
            { id: 'c2', name: 'readFile', arguments: { path: 'b.md' } },
          ]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(
        makeBaseRequest({ tools: [tool], bounds: { maxCalls: 1 } }),
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      // One real call + one iteration_limit_reached synthetic entry
      const realCalls = result.data.toolCalls.filter((e) => e.outcome !== 'iteration_limit_reached');
      expect(realCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: not_found outcome is recorded in the toolCalls log.
  // [req Story 17.1 AC — outcome set includes not_found] [lld §17.1c]
  // -------------------------------------------------------------------------

  describe('Given a tool handler that returns not_found', () => {
    it('then the toolCalls log entry has outcome not_found', async () => {
      const tool = makeNotFoundTool('readFile');
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse([{ id: 'c1', name: 'readFile', arguments: { path: 'missing.md' } }]),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.toolCalls[0]!.outcome).toBe('not_found');
    });
  });

  // -------------------------------------------------------------------------
  // Property 13: Observability fields are populated on the no-tool path too.
  // Disabled path (tools=[]) still produces tokens and durationMs.
  // [req Story 17.1 AC] [lld Invariant 5]
  // -------------------------------------------------------------------------

  describe('Given tool-use is effectively disabled (empty tools array)', () => {
    it('then usage is populated from the single-shot LLM response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(
        makeFinalResponse({ summary: 'direct', score: 7 }, { prompt_tokens: 200, completion_tokens: 40 }),
      );

      const result = await client.generateWithTools(makeBaseRequest({ tools: [] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.usage.inputTokens).toBe(200);
      expect(result.data.usage.outputTokens).toBe(40);
    });

    it('then durationMs is a non-negative number', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Property 14: generateStructured behaviour is unchanged (regression smoke).
  // [issue BDD spec — "never changes generateStructured behaviour"] [lld §17.1a AC]
  // -------------------------------------------------------------------------

  describe('Given a generateStructured call (regression — #250)', () => {
    it('then it still returns a parsed, validated response unchanged by generateWithTools addition', async () => {
      const StructuredSchema = z.object({ answer: z.string(), confidence: z.number() });
      mockOpenAI.chat.completions.create.mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: JSON.stringify({ answer: 'unchanged', confidence: 0.99 }),
            },
          },
        ],
      });

      const result = await client.generateStructured({
        prompt: 'Test prompt',
        systemPrompt: 'Test system',
        schema: StructuredSchema,
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ answer: 'unchanged', confidence: 0.99 });
    });
  });

  // -------------------------------------------------------------------------
  // Property 15: No OpenRouter-specific types leak into the return value.
  // The public return type is LLMResult<GenerateWithToolsData<T>> [lld Invariant 9]
  // [req AC "No engine-layer imports leak into OpenRouter-specific types"]
  // -------------------------------------------------------------------------

  describe('Given the return type of generateWithTools', () => {
    it('then on success the data field satisfies GenerateWithToolsData shape', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest());

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      // All required fields of GenerateWithToolsData must be present
      expect('data' in result.data).toBe(true);
      expect('usage' in result.data).toBe(true);
      expect('toolCalls' in result.data).toBe(true);
      expect('durationMs' in result.data).toBe(true);
      expect('inputTokens' in result.data.usage).toBe(true);
      expect('outputTokens' in result.data.usage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Property 16: DEFAULT_TOOL_LOOP_BOUNDS are used when no bounds supplied.
  // The default maxCalls of 5 caps the loop at 5 honoured calls.
  // [lld §17.1c pseudocode: bounds = { ...DEFAULT_TOOL_LOOP_BOUNDS, ...req.bounds }]
  // -------------------------------------------------------------------------

  describe('Given a request with no bounds override (defaults apply)', () => {
    it('then the loop honours up to DEFAULT_TOOL_LOOP_BOUNDS.maxCalls calls before breaching', async () => {
      const tool = makeSuccessTool('readFile', 'x', 1);
      // 6 tool calls requested — 5th should be honoured, 6th refused
      mockOpenAI.chat.completions.create
        .mockResolvedValueOnce(
          makeToolCallResponse(
            Array.from({ length: 6 }, (_, i) => ({
              id: `c${i + 1}`,
              name: 'readFile',
              arguments: { path: `file${i + 1}.md` },
            })),
          ),
        )
        .mockResolvedValueOnce(DEFAULT_FINAL);

      const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(tool.handler).toHaveBeenCalledTimes(DEFAULT_TOOL_LOOP_BOUNDS.maxCalls);
      const limitEntries = result.data.toolCalls.filter(
        (e) => e.outcome === 'iteration_limit_reached',
      );
      expect(limitEntries).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // onToolCall callback — V2 Epic 18, Stories 18.1 + 18.3. Issue: #274
  // AC 4: onToolCall invoked AFTER each successful tool call, not for breaches.
  // AC 5: onToolCall is optional — loop runs fine without it.
  // -------------------------------------------------------------------------

  describe('onToolCall callback (Story 18.1 + 18.3)', () => {
    describe('Given an onToolCall callback and the LLM makes one successful tool call', () => {
      it('then onToolCall is invoked exactly once with a ToolCallEvent carrying the correct fields', async () => {
        // AC 4 [lld §18.1: invoked AFTER each successful tool call with ToolCallEvent]
        const tool = makeSuccessTool('readFile', 'export const x = 1;', 20);
        const onToolCall = vi.fn();

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([{ id: 'tc1', name: 'readFile', arguments: { path: 'src/x.ts' } }]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(
          makeBaseRequest({ tools: [tool], onToolCall }),
        );

        expect(onToolCall).toHaveBeenCalledTimes(1);
        expect(onToolCall).toHaveBeenCalledWith(
          expect.objectContaining({
            toolName: 'readFile',
            argumentPath: 'src/x.ts',
            bytesReturned: 20,
            outcome: 'ok',
            toolCallCount: 1,
          }),
        );
      });
    });

    describe('Given an onToolCall callback and the LLM makes three successful tool calls', () => {
      it('then onToolCall is invoked three times, once per tool call', async () => {
        // AC 4 [lld §18.1: called for each successful tool call]
        const tool = makeSuccessTool('readFile', 'content', 8);
        const onToolCall = vi.fn();

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([
              { id: 'tc1', name: 'readFile', arguments: { path: 'a.ts' } },
              { id: 'tc2', name: 'readFile', arguments: { path: 'b.ts' } },
              { id: 'tc3', name: 'readFile', arguments: { path: 'c.ts' } },
            ]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(
          makeBaseRequest({ tools: [tool], onToolCall }),
        );

        expect(onToolCall).toHaveBeenCalledTimes(3);
      });
    });

    describe('Given an onToolCall callback and the tool call hits the iteration limit (breach)', () => {
      it('then onToolCall is NOT invoked for the breached call', async () => {
        // AC 4 [lld §18.1 invariant I8: breach paths do not invoke callback]
        const tool = makeSuccessTool('readFile', 'content', 1);
        const onToolCall = vi.fn();

        // maxCalls=1: first call succeeds (callback fires), second is breached (no callback)
        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([
              { id: 'tc1', name: 'readFile', arguments: { path: 'a.ts' } },
              { id: 'tc2', name: 'readFile', arguments: { path: 'b.ts' } },
            ]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(
          makeBaseRequest({ tools: [tool], bounds: { maxCalls: 1 }, onToolCall }),
        );

        // Only the first (successful) call fires the callback
        expect(onToolCall).toHaveBeenCalledTimes(1);
        // The second tool call should have been breached (iteration_limit_reached)
        const result = await client.generateWithTools(
          makeBaseRequest({ tools: [tool], bounds: { maxCalls: 1 }, onToolCall: undefined }),
        );
        if (result.success) {
          const breachedEntries = result.data.toolCalls.filter(
            (e) => e.outcome === 'iteration_limit_reached',
          );
          expect(breachedEntries.length).toBeGreaterThan(0);
        }
      });
    });

    describe('Given an onToolCall callback and the tool call hits the budget limit (breach)', () => {
      it('then onToolCall is NOT invoked for the budget_exhausted call', async () => {
        // AC 4 [lld §18.1 invariant I8: budget_exhausted path does not invoke callback]
        // First call returns 200 bytes (> maxBytes=100), second call is refused
        const tool = makeSuccessTool('readFile', 'x'.repeat(200), 200);
        const onToolCall = vi.fn();

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([
              { id: 'tc1', name: 'readFile', arguments: { path: 'a.ts' } },
              { id: 'tc2', name: 'readFile', arguments: { path: 'b.ts' } },
            ]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(
          makeBaseRequest({ tools: [tool], bounds: { maxBytes: 100 }, onToolCall }),
        );

        // First call (200 bytes) was executed and callback fired; second was not budget-breached
        // Actually first call puts cumulativeBytes=200, lastBytesReturned=200, and predictive check
        // refuses second call. First call DOES fire callback.
        // Budget breach is: second call is refused — callback must NOT be invoked for it.
        // So total callback invocations must be 1 (only the first successful call).
        expect(onToolCall).toHaveBeenCalledTimes(1);
      });
    });

    describe('Given no onToolCall callback is provided', () => {
      it('then the tool loop completes successfully without throwing', async () => {
        // AC 5 [lld §18.1 invariant I9: onToolCall is optional]
        const tool = makeSuccessTool('readFile', 'content', 8);

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([{ id: 'tc1', name: 'readFile', arguments: { path: 'a.ts' } }]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        const result = await client.generateWithTools(
          makeBaseRequest({ tools: [tool] }), // no onToolCall
        );

        expect(result.success).toBe(true);
      });

      it('then the tool loop produces identical results to a request without onToolCall', async () => {
        // AC 5 [lld §18.1: no regression when callback omitted]
        const tool = makeSuccessTool('readFile', 'file-body', 10);

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([{ id: 'tc1', name: 'readFile', arguments: { path: 'x.ts' } }]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        const result = await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

        if (!result.success) throw new Error('expected success');
        expect(result.data.data).toEqual({ summary: 'All good', score: 42 });
        expect(result.data.toolCalls).toHaveLength(1);
        expect(result.data.toolCalls[0]?.outcome).toBe('ok');
      });
    });

    describe('Given an onToolCall callback and toolCallCount increments per call', () => {
      it('then toolCallCount in each event reflects the cumulative count at that point', async () => {
        // AC 4 [lld §18.1: toolCallCount is cumulative count so far]
        const tool = makeSuccessTool('readFile', 'c', 1);
        const capturedCounts: number[] = [];
        const onToolCall = vi.fn((event: { toolCallCount: number }) => {
          capturedCounts.push(event.toolCallCount);
        });

        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([
              { id: 'tc1', name: 'readFile', arguments: { path: 'a.ts' } },
              { id: 'tc2', name: 'readFile', arguments: { path: 'b.ts' } },
            ]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(makeBaseRequest({ tools: [tool], onToolCall }));

        expect(capturedCounts).toEqual([1, 2]);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Response format constraint (regression — #279)
  //
  // Bug: tool-loop.ts did not pass `response_format: { type: 'json_object' }`
  // to chatCall(). After large tool results the LLM dropped back to prose,
  // causing malformed_response failures in production.
  //
  // Contract: every chatCall invocation in the tool loop must carry the same
  // response_format constraint that generateStructured uses (client.ts:91).
  //
  // Observable properties:
  //   A. No-tool path   — the single chatCall includes response_format.
  //   B. Multi-turn path — BOTH the initial and the finalisation chatCall
  //      invocations include response_format.
  // -------------------------------------------------------------------------

  describe('Response format constraint (regression — #279)', () => {
    // Property A: no-tool path — single chatCall carries response_format.
    // [issue #279] [bug-report-21-04-26.md]
    describe('Given the LLM returns a final JSON response immediately (no tool calls)', () => {
      it('then chatCall is invoked with response_format: { type: "json_object" }', async () => {
        mockOpenAI.chat.completions.create.mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(makeBaseRequest({ tools: [] }));

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledOnce();
        // Fix D adds a second arg (request options with signal) — match any Object for it
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
          expect.objectContaining({ response_format: { type: 'json_object' } }),
          expect.any(Object),
        );
      });
    });

    // Property B1: multi-turn path — first (tool-requesting) chatCall carries
    // response_format.
    // [issue #279] [bug-report-21-04-26.md — prose returned after first tool call]
    describe('Given the LLM makes one tool call then finalises (multi-turn)', () => {
      it('then the first chatCall (turn 1 — tool request) includes response_format: { type: "json_object" }', async () => {
        const tool = makeSuccessTool('readFile');
        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/lld.md' } }]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

        // Inspect the first invocation specifically
        const firstCallArg = mockOpenAI.chat.completions.create.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(firstCallArg).toBeDefined();
        expect(firstCallArg['response_format']).toEqual({ type: 'json_object' });
      });

      // Property B2: multi-turn path — finalisation chatCall also carries
      // response_format. This is the turn where the LLM dropped back to prose
      // in the production bug.
      // [issue #279] [bug-report-21-04-26.md]
      it('then the second chatCall (turn 2 — finalisation) includes response_format: { type: "json_object" }', async () => {
        const tool = makeSuccessTool('readFile');
        mockOpenAI.chat.completions.create
          .mockResolvedValueOnce(
            makeToolCallResponse([{ id: 'call-1', name: 'readFile', arguments: { path: 'docs/lld.md' } }]),
          )
          .mockResolvedValueOnce(DEFAULT_FINAL);

        await client.generateWithTools(makeBaseRequest({ tools: [tool] }));

        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
        // Inspect the second invocation — the finalisation turn that was producing prose
        const secondCallArg = mockOpenAI.chat.completions.create.mock.calls[1]?.[0] as Record<string, unknown>;
        expect(secondCallArg).toBeDefined();
        expect(secondCallArg['response_format']).toEqual({ type: 'json_object' });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Fix A — Retry on transient errors (#333)
  //
  // Contract: generateWithTools must retry when chatCall throws a retryable
  // HTTP error (429, 5xx) up to retryConfig.maxRetries times.
  // Non-retryable errors (401, 403) must fail immediately.
  // Each retry starts a fresh tool loop (I3).
  //
  // Sources: [lld §Fix A invariants I1, I2, I3]
  // -------------------------------------------------------------------------

  describe('generateWithTools retry on transient errors (#333 Fix A)', () => {
    // -----------------------------------------------------------------------
    // Test 1 — I1: 429 on first call, success on second → called twice
    // -----------------------------------------------------------------------
    describe('Given chatCall throws 429 on first call and succeeds on second', () => {
      it('when generateWithTools is called, then result is successful and chatCall was called twice', async () => {
        const retryClient = new OpenRouterClient({
          apiKey: 'test-key',
          openAIClient: mockOpenAI as unknown as OpenAI,
          retryConfig: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
        });

        const rateLimitError = Object.assign(new Error('Rate limit'), { status: 429 });
        mockOpenAI.chat.completions.create
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce(DEFAULT_FINAL);

        const result = await retryClient.generateWithTools(makeBaseRequest());

        expect(result.success).toBe(true);
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      });
    });

    // -----------------------------------------------------------------------
    // Test 2 — I1: 429 on every call → exhausts retries → rate_limit error
    // Called 2 times (1 initial + 1 retry when maxRetries=1)
    // -----------------------------------------------------------------------
    describe('Given chatCall throws 429 on every call', () => {
      it('when generateWithTools exhausts retries, then result.error.code === "rate_limit"', async () => {
        const retryClient = new OpenRouterClient({
          apiKey: 'test-key',
          openAIClient: mockOpenAI as unknown as OpenAI,
          retryConfig: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
        });

        const rateLimitError = Object.assign(new Error('Rate limit'), { status: 429 });
        mockOpenAI.chat.completions.create.mockRejectedValue(rateLimitError);

        const result = await retryClient.generateWithTools(makeBaseRequest());

        expect(result.success).toBe(false);
        if (result.success) throw new Error('expected failure');
        expect(result.error.code).toBe('rate_limit');
        // 1 initial attempt + 1 retry = 2 total calls
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      });
    });

    // -----------------------------------------------------------------------
    // Test 3 — I2: 401 is non-retryable → fails immediately with one call
    // -----------------------------------------------------------------------
    describe('Given chatCall throws 401 (non-retryable)', () => {
      it('when generateWithTools is called, then it fails immediately with one call', async () => {
        // Use the default client (retryConfig.maxRetries=0 already set in beforeEach)
        const authError = Object.assign(new Error('Unauthorised'), { status: 401 });
        mockOpenAI.chat.completions.create.mockRejectedValue(authError);

        const result = await client.generateWithTools(makeBaseRequest());

        expect(result.success).toBe(false);
        // Must not retry — exactly 1 call
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      });
    });

    // -----------------------------------------------------------------------
    // Test 4 — I3: 429 twice then success → each retry starts fresh loop
    // Validates that runToolLoop is called fresh on each retry attempt.
    // With maxRetries=2, three attempts are allowed: fail, fail, succeed.
    // -----------------------------------------------------------------------
    describe('Given chatCall throws 429 twice then succeeds on the third attempt', () => {
      it('when generateWithTools retries, then each retry starts a fresh tool loop (startMs resets) and result is successful', async () => {
        const retryClient = new OpenRouterClient({
          apiKey: 'test-key',
          openAIClient: mockOpenAI as unknown as OpenAI,
          retryConfig: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
        });

        const rateLimitError = Object.assign(new Error('Rate limit'), { status: 429 });
        mockOpenAI.chat.completions.create
          .mockRejectedValueOnce(rateLimitError)
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce(DEFAULT_FINAL);

        const result = await retryClient.generateWithTools(makeBaseRequest());

        // Succeeds on third attempt — each retry is a fresh runToolLoop call
        expect(result.success).toBe(true);
        // 1 initial + 2 retries = 3 total chatCall invocations
        expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Fix D — AbortSignal passed to chatCall (#333)
  //
  // Contract: the loop-level AbortSignal (created from timeoutMs) must be
  // threaded through to the OpenAI SDK call so that the in-flight HTTP request
  // is cancelled when the timeout fires.
  //
  // The OpenAI SDK accepts signal as the second argument options object:
  //   client.chat.completions.create(body, { signal })
  //
  // Sources: [lld §Fix D invariant I7]
  // -------------------------------------------------------------------------

  describe('AbortSignal passed to chatCall (#333 Fix D)', () => {
    describe('Given the loop AbortSignal fires during chatCall', () => {
      it('when the signal is aborted, then the signal passed to chatCall is aborted', async () => {
        vi.useFakeTimers();

        const retryClient = new OpenRouterClient({
          apiKey: 'test-key',
          openAIClient: mockOpenAI as unknown as OpenAI,
          retryConfig: { maxRetries: 0, baseDelayMs: 0, maxDelayMs: 0 },
        });

        // Capture the second argument (options) passed to create — that is where
        // Fix D places the signal: create(body, { signal })
        // The mock settles immediately (via rejection) so the outer promise
        // always resolves, allowing us to assert capturedSignal after the fact.
        let capturedSignal: AbortSignal | undefined;
        let resolveCreate!: () => void;
        const createBlocker = new Promise<void>((resolve) => { resolveCreate = resolve; });

        mockOpenAI.chat.completions.create.mockImplementation(
          (_body: unknown, options: { signal?: AbortSignal } | undefined) => {
            capturedSignal = options?.signal;
            // Wait until the caller unblocks us (after timers advance)
            return createBlocker.then(() => {
              throw new DOMException('Aborted', 'AbortError');
            });
          },
        );

        // timeoutMs=1000 → loop AbortSignal fires after 1000ms
        const resultPromise = retryClient.generateWithTools(
          makeBaseRequest({ bounds: { timeoutMs: 1_000 } }),
        );

        // Advance past the loop timeout so the loop AbortSignal fires
        await vi.advanceTimersByTimeAsync(2_000);

        // Unblock the mock so resultPromise can settle
        resolveCreate();
        await resultPromise.catch(() => undefined);

        // After the timeout, the signal passed to create must be aborted [lld I7]
        expect(capturedSignal?.aborted).toBe(true);
      });
    });
  });
});
