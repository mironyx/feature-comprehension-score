import type { LLMClient, LLMError } from '@/lib/engine/llm/types';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { Question, ArtefactQuality, AdditionalContextSuggestion } from '@/lib/engine/llm/schemas';
import { generateQuestions } from '@/lib/engine/generation';
import { scoreAnswer } from '@/lib/engine/scoring';
import { detectRelevance } from '@/lib/engine/relevance';
import { calculateAggregate, calculateQuestionAggregate, type ScoreEntry } from '@/lib/engine/aggregate';

export interface Rubric {
  questions: Question[];
  artefact_quality: ArtefactQuality;
  artefact_quality_note: string;
  additional_context_suggestions?: AdditionalContextSuggestion[];
}

export type GenerateRubricResult =
  | { status: 'success'; rubric: Rubric }
  | { status: 'generation_failed'; error: LLMError };

export interface GenerateRubricRequest {
  artefacts: AssembledArtefactSet;
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
}

export async function generateRubric(
  request: GenerateRubricRequest,
): Promise<GenerateRubricResult> {
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

export interface ScoreAnswersResult {
  status: 'success' | 'scoring_incomplete';
  scored: ScoredAnswer[];
  failures: Array<{ questionIndex: number; participantId: string; error: LLMError }>;
}

export interface ScoreAnswersRequest {
  rubric: Rubric;
  answers: ParticipantAnswer[];
  llmClient: LLMClient;
  model?: string;
  maxTokens?: number;
}

export async function scoreAnswers(
  request: ScoreAnswersRequest,
): Promise<ScoreAnswersResult> {
  const { rubric, answers, llmClient, model, maxTokens } = request;
  const scored: ScoredAnswer[] = [];
  const failures: ScoreAnswersResult['failures'] = [];

  for (const answer of answers) {
    const question = rubric.questions[answer.questionIndex];
    if (!question) {
      failures.push({
        questionIndex: answer.questionIndex,
        participantId: answer.participantId,
        error: {
          code: 'validation_failed',
          message: `Question index ${answer.questionIndex} out of range`,
          retryable: false,
        },
      });
      continue;
    }

    const [scoreResult, relevanceResult] = await Promise.all([
      scoreAnswer({
        questionText: question.question_text,
        referenceAnswer: question.reference_answer,
        participantAnswer: answer.answer,
        llmClient,
        model,
        maxTokens,
      }),
      detectRelevance({
        questionText: question.question_text,
        participantAnswer: answer.answer,
        llmClient,
        model,
        maxTokens,
      }),
    ]);

    if (!scoreResult.success) {
      failures.push({
        questionIndex: answer.questionIndex,
        participantId: answer.participantId,
        error: scoreResult.error,
      });
      continue;
    }

    if (!relevanceResult.success) {
      failures.push({
        questionIndex: answer.questionIndex,
        participantId: answer.participantId,
        error: relevanceResult.error,
      });
      continue;
    }

    scored.push({
      questionIndex: answer.questionIndex,
      participantId: answer.participantId,
      score: scoreResult.data.score,
      rationale: scoreResult.data.rationale,
      is_relevant: relevanceResult.data.is_relevant,
      relevance_explanation: relevanceResult.data.explanation,
    });
  }

  return {
    status: failures.length > 0 ? 'scoring_incomplete' : 'success',
    scored,
    failures,
  };
}

export interface AggregateResult {
  overallScore: number;
  participantScores: Map<string, number>;
  questionScores: Map<number, number>;
}

function toWeightedEntry(s: ScoredAnswer, rubric: Rubric): ScoreEntry {
  return { score: s.score, weight: rubric.questions[s.questionIndex]?.weight ?? 1 };
}

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

  // Question-level: unweighted mean across participants
  const questionScores = new Map<number, number>();
  const questionGroups = Map.groupBy(relevantScored, s => s.questionIndex);
  for (const [questionIndex, group] of questionGroups) {
    questionScores.set(questionIndex, calculateQuestionAggregate(group.map(s => s.score)));
  }

  return { overallScore, participantScores, questionScores };
}
