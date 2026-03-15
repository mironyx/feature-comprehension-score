import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';
import {
  RelevanceResponseSchema,
  type RelevanceResponse,
} from '@/lib/engine/llm/schemas';

export interface DetectRelevanceRequest {
  questionText: string;
  participantAnswer: string;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
}

const SYSTEM_PROMPT = `You are a relevance classifier for a software comprehension assessment. Your job is to determine whether a participant's answer is a genuine attempt to answer the question.

Classify as **not relevant** (is_relevant: false) if the answer is:
- Empty or whitespace only
- Random characters (e.g. "asdfgh", "xxx")
- A copy of the question text
- Filler text (e.g. "I don't know", "n/a", "test", "...")
- Completely off-topic with no relation to the question

Classify as **relevant** (is_relevant: true) if the answer is a genuine attempt, even if it is factually incorrect.

Return a brief explanation for your classification.`;

export async function detectRelevance(
  request: DetectRelevanceRequest,
): Promise<LLMResult<RelevanceResponse>> {
  const { questionText, participantAnswer, llmClient, model, maxTokens } = request;

  const prompt = `## Question
${questionText}

## Participant's Answer
${participantAnswer}

Classify whether the participant's answer is a genuine attempt to answer the question.`;

  return llmClient.generateStructured<typeof RelevanceResponseSchema>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    schema: RelevanceResponseSchema,
    model,
    maxTokens,
  });
}
