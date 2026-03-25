// POST /api/assessments/[id]/answers — submission service.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { detectRelevance } from '@/lib/engine/relevance';
import { scoreAnswers, calculateAssessmentAggregate, type ScoredAnswer } from '@/lib/engine/pipeline';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { AnthropicClient } from '@/lib/engine/llm/client';

type UserClient = SupabaseClient<Database>;
type ServiceClient = SupabaseClient<Database>;

type ParticipantRow = Database['public']['Tables']['assessment_participants']['Row'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];

// ---------------------------------------------------------------------------
// Request / response contracts
// ---------------------------------------------------------------------------

export const SubmitBodySchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string().min(1),
      answer_text: z.string().min(1),
    }),
  ).min(1),
});

export type SubmitBody = z.infer<typeof SubmitBodySchema>;

export interface AnswerResult {
  question_id: string;
  is_relevant: boolean;
  explanation: string | null;
  attempts_remaining: number;
}

export interface SubmitResponse {
  status: 'accepted' | 'relevance_failed';
  results: AnswerResult[];
  participation: {
    completed: number;
    total: number;
  };
}

// MAX_ATTEMPTS per v1-design.md §4.4
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Resolve the caller's participant row. 403 if not enrolled; 422 if already submitted. */
async function resolveParticipant(
  supabase: UserClient,
  assessmentId: string,
  userId: string,
): Promise<ParticipantRow> {
  const { data, error } = await supabase
    .from('assessment_participants')
    .select('*')
    .eq('assessment_id', assessmentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('resolveParticipant: DB query failed:', error);
    throw new ApiError(500, 'Internal server error');
  }
  if (!data) throw new ApiError(403, 'Forbidden');

  const participant = data as ParticipantRow;
  if (participant.status === 'submitted') {
    throw new ApiError(422, 'Already submitted');
  }
  return participant;
}

/** Fetch all questions for the assessment. 500 on DB error. */
async function fetchQuestionsForValidation(
  adminSupabase: ServiceClient,
  assessmentId: string,
): Promise<QuestionRow[]> {
  const { data, error } = await adminSupabase
    .from('assessment_questions')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('question_number', { ascending: true });

  if (error) {
    console.error('fetchQuestionsForValidation: DB query failed:', error);
    throw new ApiError(500, 'Internal server error');
  }
  return (data ?? []) as QuestionRow[];
}

// Justification: resolveAttemptNumber is a pure extraction of the attempt-number derivation
// logic from submitAnswers. LLD §2.4 constraint: 'Determine attempt number from existing
// participant_answers rows — the client never sends one.' Extracted for clarity.
function resolveAttemptNumber(
  existingAnswers: { attempt_number: number }[],
): number {
  if (existingAnswers.length === 0) return 1;
  const max = Math.max(...existingAnswers.map(a => a.attempt_number));
  return max + 1;
}

/**
 * Validate submission against known questions.
 * First attempt: all questions must be answered.
 * Re-attempt: only previously flagged (irrelevant) question IDs are accepted.
 * 422 on any mismatch.
 */
function validateSubmission(
  body: SubmitBody,
  questions: QuestionRow[],
  isFirstAttempt: boolean,
  previouslyIrrelevantIds: Set<string>,
): void {
  const questionIds = new Set(questions.map(q => q.id));
  const submittedIds = new Set(body.answers.map(a => a.question_id));

  for (const answer of body.answers) {
    if (!questionIds.has(answer.question_id)) {
      throw new ApiError(422, 'Invalid question ID', { question_id: answer.question_id });
    }
  }

  if (isFirstAttempt) {
    const missing = questions.filter(q => !submittedIds.has(q.id));
    if (missing.length > 0) {
      throw new ApiError(422, 'Missing answers for all questions', {
        missing: missing.map(q => q.id),
      });
    }
  } else {
    // Re-attempt: must only answer previously flagged questions
    for (const id of submittedIds) {
      if (!previouslyIrrelevantIds.has(id)) {
        throw new ApiError(422, 'Re-attempt must only include previously flagged questions', {
          question_id: id,
        });
      }
    }
  }
}

/** Insert answer rows into participant_answers. */
async function storeAnswers(
  adminSupabase: ServiceClient,
  participantId: string,
  orgId: string,
  assessmentId: string,
  answers: SubmitBody['answers'],
  attemptNumber: number,
): Promise<void> {
  const rows = answers.map(a => ({
    participant_id: participantId,
    org_id: orgId,
    assessment_id: assessmentId,
    question_id: a.question_id,
    answer_text: a.answer_text,
    attempt_number: attemptNumber,
    is_reassessment: false,
  }));

  const { error } = await adminSupabase.from('participant_answers').insert(rows);
  if (error) {
    console.error('storeAnswers: insert failed:', error);
    throw new ApiError(500, 'Failed to store answers');
  }
}

/**
 * Run relevance detection on each answer. Never throws.
 * Failed calls are treated as irrelevant (logged).
 */
async function runRelevanceChecks(
  answers: SubmitBody['answers'],
  questions: QuestionRow[],
  llmClient: AnthropicClient,
): Promise<AnswerResult[]> {
  const questionMap = new Map(questions.map(q => [q.id, q]));

  const results = await Promise.all(
    answers.map(async (answer): Promise<AnswerResult> => {
      const question = questionMap.get(answer.question_id);
      if (!question) {
        return { question_id: answer.question_id, is_relevant: false, explanation: 'Unknown question', attempts_remaining: 0 };
      }

      try {
        const result = await detectRelevance({
          questionText: question.question_text,
          participantAnswer: answer.answer_text,
          llmClient,
        });

        if (!result.success) {
          console.error('runRelevanceChecks: detectRelevance failed:', result.error);
          return { question_id: answer.question_id, is_relevant: false, explanation: null, attempts_remaining: 0 };
        }

        return {
          question_id: answer.question_id,
          is_relevant: result.data.is_relevant,
          explanation: result.data.is_relevant ? null : result.data.explanation,
          attempts_remaining: result.data.is_relevant ? 0 : MAX_ATTEMPTS - 1,
        };
      } catch (err) {
        console.error('runRelevanceChecks: unexpected error:', err);
        return { question_id: answer.question_id, is_relevant: false, explanation: null, attempts_remaining: 0 };
      }
    }),
  );

  return results;
}

// Justification: buildLlmClient is a factory extracted from submitAnswers to allow the
// single client instance to be passed through to both runRelevanceChecks and finaliseSubmission.
// Keeping construction at the top of submitAnswers satisfies DI without a full DI container.
function buildLlmClient(): AnthropicClient {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new ApiError(500, 'LLM client not configured');
  return new AnthropicClient({ apiKey });
}

/**
 * Finalise submission: mark participant as submitted, check if all done,
 * trigger scoring if last. Returns participation counts.
 */
async function finaliseSubmission(
  adminSupabase: ServiceClient,
  participantId: string,
  assessmentId: string,
  llmClient: AnthropicClient,
): Promise<{ completed: number; total: number }> {
  // Mark participant as submitted
  const { error: updateError } = await adminSupabase
    .from('assessment_participants')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', participantId);

  if (updateError) {
    console.error('finaliseSubmission: update participant failed:', updateError);
    throw new ApiError(500, 'Failed to update participant status');
  }

  // Fetch all participants to check completion
  const { data: allParticipants, error: fetchError } = await adminSupabase
    .from('assessment_participants')
    .select('id, status')
    .eq('assessment_id', assessmentId);

  if (fetchError) {
    console.error('finaliseSubmission: fetch participants failed:', fetchError);
    throw new ApiError(500, 'Internal server error');
  }

  const participants = (allParticipants ?? []) as { id: string; status: string }[];
  const total = participants.length;
  const completed = participants.filter(p => p.status === 'submitted').length;

  if (completed === total && total > 0) {
    await triggerScoring(adminSupabase, assessmentId, llmClient);
  }

  return { completed, total };
}

type ScoringQuestionRow = { id: string; question_number: number; question_text: string; reference_answer: string | null; weight: number; naur_layer: 'world_to_program' | 'design_justification' | 'modification_capacity' };
type ScoringAnswerRow = { participant_id: string; question_id: string; answer_text: string; attempt_number: number; is_relevant: boolean | null };

// Justification: triggerScoring decomposes the LLD's scoreAssessment() call into sub-helpers
// to satisfy the ≤20-line function limit (CLAUDE.md). The LLD names only finaliseSubmission
// as the caller; the internal decomposition is left as an implementation detail.
async function fetchScoringData(
  adminSupabase: ServiceClient,
  assessmentId: string,
): Promise<{ questions: ScoringQuestionRow[]; answers: ScoringAnswerRow[] }> {
  const [qResult, aResult] = await Promise.all([
    adminSupabase.from('assessment_questions').select('*').eq('assessment_id', assessmentId).order('question_number', { ascending: true }),
    adminSupabase.from('participant_answers').select('*').eq('assessment_id', assessmentId).eq('is_reassessment', false),
  ]);
  if (qResult.error) throw new Error('Failed to fetch questions for scoring');
  if (aResult.error) throw new Error('Failed to fetch answers for scoring');
  return {
    questions: (qResult.data ?? []) as ScoringQuestionRow[],
    answers: (aResult.data ?? []) as ScoringAnswerRow[],
  };
}

async function persistScoringResults(
  adminSupabase: ServiceClient,
  assessmentId: string,
  overallScore: number,
  scoringIncomplete: boolean,
  scored: ScoredAnswer[],
  questions: ScoringQuestionRow[],
): Promise<void> {
  const { error } = await adminSupabase
    .from('assessments')
    .update({ aggregate_score: overallScore, scoring_incomplete: scoringIncomplete, status: 'completed' })
    .eq('id', assessmentId);
  if (error) throw new Error('Failed to persist aggregate score');

  await Promise.all(
    scored.map(s => {
      const q = questions[s.questionIndex];
      if (!q) return Promise.resolve();
      return adminSupabase
        .from('participant_answers')
        .update({ score: s.score, score_rationale: s.rationale })
        .eq('participant_id', s.participantId)
        .eq('question_id', q.id)
        .eq('is_reassessment', false);
    }),
  );
}

/** Trigger assessment scoring synchronously. Wraps internal errors as ApiError(500). */
async function triggerScoring(
  adminSupabase: ServiceClient,
  assessmentId: string,
  llmClient: AnthropicClient,
): Promise<void> {
  try {
    const { questions, answers } = await fetchScoringData(adminSupabase, assessmentId);
    const rubric = {
      questions: questions.map(q => ({
        question_number: q.question_number,
        question_text: q.question_text,
        reference_answer: q.reference_answer ?? '',
        weight: q.weight,
        naur_layer: q.naur_layer,
      })),
      artefact_quality: 'code_only' as const,
      artefact_quality_note: '',
    };
    const questionIndexMap = new Map(questions.map((q, i) => [q.id, i]));
    const participantAnswers = answers
      .filter(a => a.is_relevant !== false)
      .map(a => ({ questionIndex: questionIndexMap.get(a.question_id) ?? -1, participantId: a.participant_id, answer: a.answer_text }))
      .filter(a => a.questionIndex >= 0);
    const result = await scoreAnswers({ rubric, answers: participantAnswers, llmClient });
    const aggregate = calculateAssessmentAggregate(result.scored, rubric);
    await persistScoringResults(adminSupabase, assessmentId, aggregate.overallScore, result.status === 'scoring_incomplete', result.scored, questions);
  } catch (err) {
    console.error('triggerScoring: scoring failed:', err);
    throw new ApiError(500, 'Scoring failed');
  }
}

// ---------------------------------------------------------------------------
// Exported service function
// ---------------------------------------------------------------------------

export async function submitAnswers(
  supabase: UserClient,
  adminSupabase: ServiceClient,
  assessmentId: string,
  userId: string,
  body: SubmitBody,
): Promise<SubmitResponse> {
  // 1. Verify participant
  const participant = await resolveParticipant(supabase, assessmentId, userId);

  // 2. Fetch questions
  const questions = await fetchQuestionsForValidation(adminSupabase, assessmentId);

  // 3. Fetch existing answers to determine attempt number and flagged questions
  const { data: existingAnswers, error: existingError } = await adminSupabase
    .from('participant_answers')
    .select('question_id, attempt_number, is_relevant')
    .eq('participant_id', participant.id)
    .eq('is_reassessment', false);

  if (existingError) {
    console.error('submitAnswers: fetch existing answers failed:', existingError);
    throw new ApiError(500, 'Internal server error');
  }

  const typedExisting = (existingAnswers ?? []) as { question_id: string; attempt_number: number; is_relevant: boolean | null }[];
  const isFirstAttempt = typedExisting.length === 0;
  const previouslyIrrelevantIds = new Set(
    typedExisting.filter(a => a.is_relevant === false).map(a => a.question_id),
  );
  const attemptNumber = resolveAttemptNumber(typedExisting);

  if (attemptNumber > MAX_ATTEMPTS) {
    throw new ApiError(422, 'Max attempts exhausted');
  }

  // 4. Validate submission
  validateSubmission(body, questions, isFirstAttempt, previouslyIrrelevantIds);

  // 5. Store answers
  await storeAnswers(adminSupabase, participant.id, participant.org_id, assessmentId, body.answers, attemptNumber);

  // 6. Build LLM client once for this request
  const llmClient = buildLlmClient();

  // 7. Run relevance checks
  const relevanceResults = await runRelevanceChecks(body.answers, questions, llmClient);

  // 8. Update stored answers with relevance results
  await Promise.all(
    relevanceResults.map(r =>
      adminSupabase
        .from('participant_answers')
        .update({ is_relevant: r.is_relevant, relevance_explanation: r.explanation })
        .eq('participant_id', participant.id)
        .eq('question_id', r.question_id)
        .eq('attempt_number', attemptNumber)
        .eq('is_reassessment', false),
    ),
  );

  const anyIrrelevant = relevanceResults.some(r => !r.is_relevant);

  if (anyIrrelevant) {
    // Return relevance_failed — participant stays 'pending'
    const { data: allParticipants } = await adminSupabase
      .from('assessment_participants')
      .select('id, status')
      .eq('assessment_id', assessmentId);

    const participants = (allParticipants ?? []) as { id: string; status: string }[];
    return {
      status: 'relevance_failed',
      results: relevanceResults,
      participation: {
        completed: participants.filter(p => p.status === 'submitted').length,
        total: participants.length,
      },
    };
  }

  // 9. All relevant — finalise
  const participation = await finaliseSubmission(adminSupabase, participant.id, assessmentId, llmClient);

  return {
    status: 'accepted',
    results: relevanceResults,
    participation,
  };
}
