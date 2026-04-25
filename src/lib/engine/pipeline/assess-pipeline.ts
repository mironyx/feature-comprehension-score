import type { LLMClient, LLMError } from '@/lib/engine/llm/types';
import type {
  ToolCallEvent,
  ToolCallLogEntry,
  ToolDefinition,
  ToolLoopBounds,
} from '@/lib/engine/llm/tools';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { Question, ArtefactQuality, AdditionalContextSuggestion } from '@/lib/engine/llm/schemas';
import { generateQuestions } from '@/lib/engine/generation';
import { scoreAnswer } from '@/lib/engine/scoring';
import { calculateAggregate, calculateQuestionAggregate, type ScoreEntry } from '@/lib/engine/aggregate';

export interface Rubric {
  questions: Question[];
  artefact_quality: ArtefactQuality;
  artefact_quality_note: string;
  additional_context_suggestions?: AdditionalContextSuggestion[];
}

export interface RubricObservability {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: readonly ToolCallLogEntry[];
  readonly durationMs: number;
}

export type GenerateRubricResult =
  | {
      status: 'success';
      rubric: Rubric;
      observability: RubricObservability;
    }
  | { status: 'generation_failed'; error: LLMError };

export interface GenerateRubricRequest {
  artefacts: AssembledArtefactSet;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
  tools?: readonly ToolDefinition[];
  bounds?: Partial<ToolLoopBounds>;
  signal?: AbortSignal;
  onToolCall?: (event: ToolCallEvent) => void;
}

export async function generateRubric(
  request: GenerateRubricRequest,
): Promise<GenerateRubricResult> {
  // generateQuestions accepts the same fields including onToolCall — pass through.
  const result = await generateQuestions(request);

  if (!result.success) {
    return { status: 'generation_failed', error: result.error };
  }

  return {
    status: 'success',
    rubric: {
      questions: result.data.questions,
      artefact_quality: result.data.artefact_quality,
      artefact_quality_note: result.data.artefact_quality_note,
      additional_context_suggestions: result.data.additional_context_suggestions,
    },
    observability: {
      inputTokens: result.data.inputTokens,
      outputTokens: result.data.outputTokens,
      toolCalls: result.data.toolCalls,
      durationMs: result.data.durationMs,
    },
  };
}

export interface ParticipantAnswer {
  questionIndex: number;
  participantId: string;
  answer: string;
}

export interface ScoredAnswer {
  questionIndex: number;
  participantId: string;
  score: number;
  rationale: string;
  is_relevant: boolean;
  relevance_explanation: string;
}

export interface ScoringFailure {
  questionIndex: number;
  participantId: string;
  error: LLMError;
}

export interface ScoreAnswersResult {
  status: 'success' | 'scoring_incomplete';
  scored: ScoredAnswer[];
  failures: ScoringFailure[];
}

export interface ScoreAnswersRequest {
  rubric: Rubric;
  answers: ParticipantAnswer[];
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
  comprehensionDepth?: 'conceptual' | 'detailed';
}

interface LLMCallConfig {
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
  comprehensionDepth?: 'conceptual' | 'detailed';
}

type AnswerOutcome =
  | { kind: 'scored'; value: ScoredAnswer }
  | { kind: 'failed'; value: ScoringFailure };

// Relevance is checked once per submission upstream (web API) before the answer reaches
// scoring; the caller is expected to filter out irrelevant answers. Scoring decides for
// itself how to score borderline content. See issue #335.
async function processAnswer(
  answer: ParticipantAnswer,
  question: Question,
  config: LLMCallConfig,
): Promise<AnswerOutcome> {
  const { llmClient, model, maxTokens, comprehensionDepth } = config;
  const scoreResult = await scoreAnswer({
    questionText: question.question_text,
    referenceAnswer: question.reference_answer,
    participantAnswer: answer.answer,
    llmClient,
    model,
    maxTokens,
    comprehensionDepth,
  });

  if (!scoreResult.success) {
    return { kind: 'failed', value: { questionIndex: answer.questionIndex, participantId: answer.participantId, error: scoreResult.error } };
  }

  return { kind: 'scored', value: { questionIndex: answer.questionIndex, participantId: answer.participantId, score: scoreResult.data.score, rationale: scoreResult.data.rationale, is_relevant: true, relevance_explanation: '' } };
}

export async function scoreAnswers(
  request: ScoreAnswersRequest,
): Promise<ScoreAnswersResult> {
  const { rubric, answers, llmClient, model, maxTokens, comprehensionDepth } = request;
  const config: LLMCallConfig = { llmClient, model, maxTokens, comprehensionDepth };
  const scored: ScoredAnswer[] = [];
  const failures: ScoringFailure[] = [];

  const outcomes = await Promise.all(
    answers.map((answer) => {
      const question = rubric.questions[answer.questionIndex];
      if (!question) {
        return Promise.resolve({
          kind: 'failed' as const,
          value: {
            questionIndex: answer.questionIndex,
            participantId: answer.participantId,
            error: { code: 'validation_failed' as const, message: `Question index ${answer.questionIndex} out of range`, retryable: false },
          },
        });
      }
      return processAnswer(answer, question, config);
    }),
  );

  for (const outcome of outcomes) {
    if (outcome.kind === 'scored') {
      scored.push(outcome.value);
    } else {
      failures.push(outcome.value);
    }
  }

  return {
    status: failures.length > 0 ? 'scoring_incomplete' : 'success',
    scored,
    failures,
  };
}

export interface AggregateResult {
  /** Single 0–1 score across all participants and questions, weighted by question weight. */
  overallScore: number;
  /** Per-participant 0–1 score (weighted mean of their answered questions). */
  participantScores: Map<string, number>;
  /** Per-question 0–1 score (unweighted mean across participants). */
  questionScores: Map<number, number>;
}

/** Map a scored answer to a {score, weight} entry using the question's weight from the rubric. */
function toWeightedEntry(s: ScoredAnswer, rubric: Rubric): ScoreEntry {
  return { score: s.score, weight: rubric.questions[s.questionIndex]?.weight ?? 1 };
}

/**
 * Compute a weighted aggregate score for each group in a Map<K, ScoredAnswer[]>.
 * Reused for both participant-level and any future grouping dimensions.
 */
function aggregateGroup<K>(
  groups: Map<K, ScoredAnswer[]>,
  rubric: Rubric,
): Map<K, number> {
  const result = new Map<K, number>();
  for (const [key, group] of groups) {
    const entries = group.map(s => toWeightedEntry(s, rubric));
    result.set(key, calculateAggregate(entries));
  }
  return result;
}

/**
 * Compute aggregate scores at three levels from a set of scored answers.
 *
 * Irrelevant answers (is_relevant === false) are excluded before aggregation.
 *
 * - **overallScore**: weighted mean across all relevant answers (weight = question weight).
 * - **participantScores**: weighted mean per participant — shows individual comprehension.
 * - **questionScores**: unweighted mean per question across participants — shows which
 *   topics the team understood well or poorly, independent of question difficulty weighting.
 */
export function calculateAssessmentAggregate(
  scored: ScoredAnswer[],
  rubric: Rubric,
): AggregateResult {
  const relevantScored = scored.filter(s => s.is_relevant);

  const overallScore = calculateAggregate(
    relevantScored.map(s => toWeightedEntry(s, rubric)),
  );

  const participantScores = aggregateGroup(
    Map.groupBy(relevantScored, s => s.participantId),
    rubric,
  );

  // Question-level uses unweighted mean — we want to know how well each topic was
  // understood across the team, not biased by the question's importance weight.
  const questionScores = new Map<number, number>();
  const questionGroups = Map.groupBy(relevantScored, s => s.questionIndex);
  for (const [questionIndex, group] of questionGroups) {
    questionScores.set(questionIndex, calculateQuestionAggregate(group.map(s => s.score)));
  }

  return { overallScore, participantScores, questionScores };
}
