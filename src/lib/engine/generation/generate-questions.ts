import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';
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
}

export async function generateQuestions(
  request: GenerateQuestionsRequest,
): Promise<LLMResult<QuestionGenerationResponse>> {
  const { artefacts, llmClient, model, maxTokens } = request;
  const { systemPrompt, userPrompt } = buildQuestionGenerationPrompt(artefacts);

  const result = await llmClient.generateStructured<typeof QuestionGenerationResponseSchema>({
    systemPrompt,
    prompt: userPrompt,
    schema: QuestionGenerationResponseSchema,
    model,
    maxTokens,
  });

  if (!result.success) {
    return result;
  }

  const actual = result.data.questions.length;
  const expected = artefacts.question_count;
  if (actual !== expected) {
    return {
      success: false,
      error: {
        code: 'validation_failed',
        message: `Expected ${expected} questions but received ${actual}`,
        retryable: false,
      },
    };
  }

  return result;
}
