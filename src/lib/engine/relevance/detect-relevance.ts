import type { LLMClient, LLMError } from '@/lib/engine/llm/types';
import {
  RelevanceBatchResponseSchema,
} from '@/lib/engine/llm/schemas';

export interface RelevanceItem {
  questionText: string;
  participantAnswer: string;
}

export interface RelevanceItemResult {
  is_relevant: boolean;
  explanation: string;
}

export interface DetectRelevanceRequest {
  items: RelevanceItem[];
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
}

export type DetectRelevanceResult =
  | { success: true; data: RelevanceItemResult[] }
  | { success: false; error: LLMError };

const SYSTEM_PROMPT = `You are a relevance classifier for a software comprehension assessment. For each numbered question/answer pair, decide whether the participant's answer is a genuine attempt to answer the question.

Classify as **not relevant** (is_relevant: false) if the answer is:
- Empty or whitespace only
- Random characters (e.g. "asdfgh", "xxx")
- A copy of the question text
- Filler text (e.g. "I don't know", "n/a", "test", "...")
- Completely off-topic with no relation to the question

Classify as **relevant** (is_relevant: true) if the answer is a genuine attempt, even if it is factually incorrect.

Respond with a JSON object: { "results": [ { "index": 0, "is_relevant": boolean, "explanation": "brief reason" }, ... ] }
Use the same index value as the input item. Include exactly one result per input item.`;

function buildPrompt(items: RelevanceItem[]): string {
  const blocks = items.map((item, i) => `### Item ${i}
Question: ${item.questionText}
Answer: ${item.participantAnswer}`).join('\n\n');
  return `Classify each question/answer pair below.\n\n${blocks}`;
}

/**
 * Classify a batch of (question, answer) pairs in a single LLM call.
 *
 * On LLM failure: returns { success: false } — caller decides how to surface (typically
 * map all items to is_relevant: null).
 *
 * On success but missing items: any input index without a returned result is treated as
 * relevant (is_relevant: true, empty explanation). Scoring will sort it out.
 */
export async function detectRelevance(
  request: DetectRelevanceRequest,
): Promise<DetectRelevanceResult> {
  const { items, llmClient, model, maxTokens } = request;

  if (items.length === 0) {
    return { success: true, data: [] };
  }

  const result = await llmClient.generateStructured<typeof RelevanceBatchResponseSchema>({
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildPrompt(items),
    schema: RelevanceBatchResponseSchema,
    model,
    maxTokens,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const byIndex = new Map<number, { is_relevant: boolean; explanation: string }>();
  for (const r of result.data.results) {
    byIndex.set(r.index, { is_relevant: r.is_relevant, explanation: r.explanation });
  }

  const aligned: RelevanceItemResult[] = items.map((_, i) =>
    byIndex.get(i) ?? { is_relevant: true, explanation: '' },
  );

  return { success: true, data: aligned };
}
