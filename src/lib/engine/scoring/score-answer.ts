import type { LLMClient, LLMResult } from '@/lib/engine/llm/types';
import {
  ScoringResponseSchema,
  type ScoringResponse,
} from '@/lib/engine/llm/schemas';

export interface ScoreAnswerRequest {
  questionText: string;
  referenceAnswer: string;
  participantAnswer: string;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
  comprehensionDepth?: 'conceptual' | 'detailed';
}

const BASE_SYSTEM_PROMPT = `You are a software comprehension assessor. You score a participant's answer against a reference answer.

Evaluate the participant's answer on three dimensions:
1. **Factual correctness** — Does the answer contain accurate information?
2. **Completeness** — Does the answer cover the key points from the reference?
3. **Demonstration of understanding** — Does the answer show genuine comprehension, not just keyword matching?

Semantically equivalent answers with different wording should receive similar scores to answers that match the reference closely.

Score on a continuous scale from 0.0 to 1.0:
- **0.0** — no comprehension, factually incorrect, or does not address the question
- **0.3** — minimal comprehension, vague or only touches a minor detail
- **0.5** — partial comprehension, some key points but important gaps or inaccuracies
- **0.8** — strong comprehension, covers most key points accurately
- **1.0** — complete, accurate understanding covering all key points

The score MUST be a decimal between 0.0 and 1.0 inclusive. Do not use a 1–5 or 1–10 scale.

Respond with a JSON object: { "score": number, "rationale": "brief reason" }`;

const CONCEPTUAL_CALIBRATION = `## Scoring Calibration — Conceptual Depth

This assessment measures reasoning and design understanding, not code recall:
- Accept semantically equivalent descriptions even without exact identifier names.
- Weight demonstration of reasoning and understanding of constraints over recall of specifics.
- Do not penalise for omitting file paths, type names, or function signatures when the conceptual understanding is correct.
- If the participant provides exact identifiers, accept them — specificity is welcomed but not required.`;

const DETAILED_CALIBRATION = `## Scoring Calibration — Detailed Depth

This assessment measures understanding of the implementation at the specific level: how the actual types, files, and call sites compose, why they were chosen, and what would change if they were different.

- Specific identifiers (type names, file paths, function signatures) are the expected vocabulary — use them to anchor reasoning, not as the reasoning itself.
- Accept answers that name the right identifiers and explain the role each plays; prefer them over answers that list names without context.
- Score lower when answers remain conceptual where specifics matter, OR list specifics without demonstrating understanding of their role.
- Purely recall-style answers ("the type is X") without reasoning about why or how should not score full marks.`;

function buildScoringPrompt(depth?: 'conceptual' | 'detailed'): string {
  const calibration = depth === 'detailed' ? DETAILED_CALIBRATION : CONCEPTUAL_CALIBRATION;
  return `${BASE_SYSTEM_PROMPT}\n\n${calibration}`;
}

export async function scoreAnswer(
  request: ScoreAnswerRequest,
): Promise<LLMResult<ScoringResponse>> {
  const { questionText, referenceAnswer, participantAnswer, llmClient, model, maxTokens, comprehensionDepth } = request;

  const prompt = `## Question
${questionText}

## Reference Answer
${referenceAnswer}

## Participant's Answer
${participantAnswer}

Score the participant's answer against the reference answer.`;

  return llmClient.generateStructured<typeof ScoringResponseSchema>({
    systemPrompt: buildScoringPrompt(comprehensionDepth),
    prompt,
    schema: ScoringResponseSchema,
    model,
    maxTokens,
  });
}
