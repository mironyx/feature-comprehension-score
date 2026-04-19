import type { ZodType } from 'zod';
import { z } from 'zod';

import {
  DEFAULT_TOOL_LOOP_BOUNDS,
  type GenerateWithToolsData,
  type GenerateWithToolsRequest,
  type ToolCallLogEntry,
  type ToolCallOutcome,
  type ToolDefinition,
  type ToolLoopBounds,
  type ToolResult,
} from './tools';
import type { LLMError, LLMResult } from './types';

export interface SdkToolCallRequest {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface SdkAssistantMessage {
  readonly role: string;
  readonly content: string | null;
  readonly tool_calls?: readonly SdkToolCallRequest[];
}

export interface SdkUsage {
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
}

export interface SdkResponse {
  readonly choices: ReadonlyArray<{ readonly message: SdkAssistantMessage }>;
  readonly usage?: SdkUsage;
}

export interface SdkRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly unknown[];
  readonly tools?: readonly unknown[];
}

export type ChatCallFn = (req: SdkRequest) => Promise<SdkResponse>;

export interface RunToolLoopParams<T extends ZodType> {
  readonly req: GenerateWithToolsRequest<T>;
  readonly chatCall: ChatCallFn;
  readonly defaultModel: string;
  readonly startMs: number;
}

interface LoopState {
  callCount: number;
  cumulativeBytes: number;
  lastBytesReturned: number;
  readonly toolCalls: ToolCallLogEntry[];
  readonly messages: unknown[];
}

export function toOpenAIToolSpec(def: ToolDefinition): {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
} {
  return {
    type: 'function',
    function: {
      name: def.name,
      description: def.description,
      parameters: z.toJSONSchema(def.inputSchema),
    },
  };
}

function makeTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms);
  timer.unref?.();
  return controller.signal;
}

function makeLoopSignal(callerSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = makeTimeoutSignal(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
}

function makeInitialState(req: GenerateWithToolsRequest<ZodType>): LoopState {
  return {
    callCount: 0,
    cumulativeBytes: 0,
    lastBytesReturned: 0,
    toolCalls: [],
    messages: [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.prompt },
    ],
  };
}

interface ParsedInput {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly path: string;
}

function parseToolInput(def: ToolDefinition | undefined, rawArgs: string): ParsedInput {
  if (!def) return { ok: false, path: '' };
  let raw: unknown;
  try {
    raw = JSON.parse(rawArgs);
  } catch (err) {
    // Malformed JSON from the LLM degrades to outcome='error' via the caller's breach path;
    // the error payload is fed back to the LLM so it can correct on the next turn.
    void err;
    return { ok: false, path: '' };
  }
  const validation = def.inputSchema.safeParse(raw);
  if (!validation.success) return { ok: false, path: '' };
  const record = validation.data as Record<string, unknown>;
  const path = typeof record.path === 'string' ? record.path : JSON.stringify(validation.data);
  return { ok: true, value: validation.data, path };
}

function recordOutcome(
  state: LoopState,
  tc: SdkToolCallRequest,
  outcome: ToolCallOutcome,
  bytes: number,
  path: string,
): void {
  state.toolCalls.push({
    tool_name: tc.function.name,
    argument_path: path,
    bytes_returned: bytes,
    outcome,
  });
}

function pushToolMessage(state: LoopState, tc: SdkToolCallRequest, payload: unknown): void {
  state.messages.push({
    role: 'tool',
    tool_call_id: tc.id,
    content: JSON.stringify(payload),
  });
}

function breach(
  state: LoopState,
  tc: SdkToolCallRequest,
  outcome: 'iteration_limit_reached' | 'budget_exhausted' | 'error',
  path: string,
  payload: unknown,
): void {
  recordOutcome(state, tc, outcome, 0, path);
  pushToolMessage(state, tc, payload);
}

async function runHandler(
  def: ToolDefinition,
  input: unknown,
  bounds: ToolLoopBounds,
  loopSignal: AbortSignal,
): Promise<ToolResult> {
  const callSignal = AbortSignal.any([loopSignal, makeTimeoutSignal(bounds.perToolCallTimeoutMs)]);
  try {
    return await def.handler(input as never, callSignal);
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err), bytes: 0 };
  }
}

function isBudgetBreached(state: LoopState, bounds: ToolLoopBounds): boolean {
  // Predictive check: refuse the next call if another result of the same size as the last
  // one would push cumulative bytes past the budget. Keeps a single oversized result from
  // blowing the budget on the call *after* it lands.
  return state.cumulativeBytes + state.lastBytesReturned >= bounds.maxBytes;
}

async function processOneToolCall(
  tc: SdkToolCallRequest,
  tools: readonly ToolDefinition[],
  bounds: ToolLoopBounds,
  state: LoopState,
  loopSignal: AbortSignal,
): Promise<void> {
  const def = tools.find((d) => d.name === tc.function.name);
  const input = parseToolInput(def, tc.function.arguments);
  if (state.callCount >= bounds.maxCalls) {
    return breach(state, tc, 'iteration_limit_reached', input.path, { error: 'iteration_limit_reached' });
  }
  if (isBudgetBreached(state, bounds)) {
    return breach(state, tc, 'budget_exhausted', input.path, { error: 'budget_exhausted' });
  }
  if (!def || !input.ok) {
    return breach(state, tc, 'error', input.path, { error: 'invalid_tool_or_args' });
  }
  const result = await runHandler(def, input.value, bounds, loopSignal);
  state.callCount += 1;
  state.cumulativeBytes += result.bytes;
  state.lastBytesReturned = result.bytes;
  recordOutcome(state, tc, result.kind, result.bytes, input.path);
  pushToolMessage(state, tc, result);
}

async function processToolCalls(
  msg: SdkAssistantMessage,
  tools: readonly ToolDefinition[],
  bounds: ToolLoopBounds,
  state: LoopState,
  loopSignal: AbortSignal,
): Promise<void> {
  state.messages.push(msg);
  for (const tc of msg.tool_calls ?? []) {
    await processOneToolCall(tc, tools, bounds, state, loopSignal);
  }
}

function fail<T>(error: LLMError): LLMResult<T> {
  return { success: false, error };
}

function validateFinalContent<T extends ZodType>(
  content: string,
  schema: T,
): LLMResult<z.infer<T>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail({ code: 'malformed_response', message: `parse error: ${msg}`, retryable: false });
  }
  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    return fail({
      code: 'malformed_response',
      message: `schema validation failed: ${validation.error.message}`,
      retryable: false,
      context: { zodErrors: validation.error.issues },
    });
  }
  return { success: true, data: validation.data };
}

function finalise<T extends ZodType>(
  msg: SdkAssistantMessage,
  schema: T,
  state: LoopState,
  usage: SdkUsage | undefined,
  startMs: number,
): LLMResult<GenerateWithToolsData<z.infer<T>>> {
  if (!msg.content) {
    return fail({ code: 'malformed_response', message: 'empty final content', retryable: false });
  }
  const validated = validateFinalContent(msg.content, schema);
  if (!validated.success) return validated;
  return {
    success: true,
    data: {
      data: validated.data,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
      toolCalls: state.toolCalls,
      durationMs: Date.now() - startMs,
    },
  };
}

export async function runToolLoop<T extends ZodType>(
  params: RunToolLoopParams<T>,
): Promise<LLMResult<GenerateWithToolsData<z.infer<T>>>> {
  const { req, chatCall, defaultModel, startMs } = params;
  const bounds = { ...DEFAULT_TOOL_LOOP_BOUNDS, ...req.bounds };
  const loopSignal = makeLoopSignal(req.signal, bounds.timeoutMs);
  const state = makeInitialState(req);
  const model = req.model ?? defaultModel;
  const maxTokens = req.maxTokens ?? 4096;
  const maxTurns = bounds.maxCalls + 2;

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await chatCall({
      model,
      max_tokens: maxTokens,
      messages: state.messages,
      tools: req.tools.length ? req.tools.map(toOpenAIToolSpec) : undefined,
    });
    const msg = resp?.choices?.[0]?.message;
    if (!msg) return fail({ code: 'malformed_response', message: 'no assistant message', retryable: false });
    if (msg.tool_calls?.length) {
      await processToolCalls(msg, req.tools, bounds, state, loopSignal);
      continue;
    }
    return finalise(msg, req.schema, state, resp.usage, startMs);
  }
  return fail({ code: 'malformed_response', message: 'loop turn cap exceeded', retryable: false });
}
