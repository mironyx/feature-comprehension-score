import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';
import type {
  ToolCallEvent,
  ToolCallLogEntry,
  ToolDefinition,
  ToolLoopBounds,
} from '@/lib/engine/llm/tools';
import {
  QuestionGenerationResponseSchema,
  type QuestionGenerationResponse,
} from '@/lib/engine/llm/schemas';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { buildQuestionGenerationPrompt } from '@/lib/engine/prompts/prompt-builder';

export interface GenerateQuestionsRequest {
  artefacts: AssembledArtefactSet;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
  tools?: readonly ToolDefinition[];
  bounds?: Partial<ToolLoopBounds>;
  signal?: AbortSignal;
  onToolCall?: (event: ToolCallEvent) => void;
}

export type GenerateQuestionsData = QuestionGenerationResponse & {
  inputTokens: number;
  outputTokens: number;
  toolCalls: readonly ToolCallLogEntry[];
  durationMs: number;
};

export async function generateQuestions(
  request: GenerateQuestionsRequest,
): Promise<LLMResult<GenerateQuestionsData>> {
  const { artefacts, llmClient, model, maxTokens, tools, bounds, signal, onToolCall } = request;
  const { systemPrompt, userPrompt } = buildQuestionGenerationPrompt(artefacts);

  const result = await llmClient.generateWithTools<typeof QuestionGenerationResponseSchema>({
    systemPrompt,
    prompt: userPrompt,
    schema: QuestionGenerationResponseSchema,
    tools: tools ?? [],
    bounds,
    model,
    maxTokens,
    signal,
    onToolCall,
  });

  if (!result.success) {
    return result;
  }

  const response = result.data.data;
  if (response.questions.length !== artefacts.question_count) {
    return {
      success: false,
      error: {
        code: 'validation_failed',
        message: `Expected ${artefacts.question_count} questions but received ${response.questions.length}`,
        retryable: true,
      },
    };
  }

  return {
    success: true,
    data: {
      ...response,
      inputTokens: result.data.usage.inputTokens,
      outputTokens: result.data.usage.outputTokens,
      toolCalls: result.data.toolCalls,
      durationMs: result.data.durationMs,
    },
  };
}
