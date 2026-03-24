// GET /api/assessments/[id] — assessment detail with field-level visibility rules.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { createReadonlyRouteHandlerClient } from '@/lib/supabase/route-handler-readonly';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import type { Database } from '@/lib/supabase/types';
import { filterQuestionFields } from './helpers';
import type { FilteredQuestion } from './helpers';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type AssessmentStatus = AssessmentRow['status'];
type NaurLayer = Database['public']['Tables']['assessment_questions']['Row']['naur_layer'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];

/** Assessment row with joined repository and organisation names. */
type AssessmentWithRelations = AssessmentRow & {
  repositories: { github_repo_name: string };
  organisations: { github_org_name: string };
};

// ---------------------------------------------------------------------------
// Contract types — query/path params and response shape. Convention: ADR-0014.
// ---------------------------------------------------------------------------

/**
 * GET /api/assessments/[id]
 *
 * Path parameters:
 *   id    (string) — assessment UUID
 *
 * Returns 200 AssessmentDetailResponse | 401 unauthenticated | 404 not found
 */
interface MyScoreQuestion {
  question_id: string;
  naur_layer: NaurLayer;
  question_text: string;
  my_answer: string;
  score: number;
  score_rationale: string;
}

interface MyScores {
  questions: MyScoreQuestion[];
  reassessment_available: boolean;
  last_reassessment_at: string | null;
}

interface MyParticipation {
  participant_id: string;
  status: 'pending' | 'submitted';
  submitted_at: string | null;
}

interface AssessmentDetailResponse {
  id: string;
  type: 'prcc' | 'fcs';
  status: AssessmentStatus;
  repository_name: string;
  repository_full_name: string;
  pr_number: number | null;
  pr_head_sha: string | null;
  feature_name: string | null;
  feature_description: string | null;
  aggregate_score: number | null;
  scoring_incomplete: boolean;
  artefact_quality: string | null;
  conclusion: AssessmentRow['conclusion'];
  config: {
    enforcement_mode: string;
    score_threshold: number;
    question_count: number;
  };
  questions: FilteredQuestion[];
  participants: {
    total: number;
    completed: number;
  };
  my_participation: MyParticipation | null;
  my_scores: MyScores | null;
  skip_info: { reason: string; skipped_at: string } | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Route context
// ---------------------------------------------------------------------------

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Throws 500 if a Supabase query returned an error. */
function assertNoQueryError(error: unknown, label: string): void {
  if (error) {
    console.error(`GET /api/assessments/[id]: ${label} query failed:`, error);
    throw new ApiError(500, 'Internal server error');
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

type SupabaseUserClient = ReturnType<typeof createReadonlyRouteHandlerClient>;

type ParallelQueryResults = {
  orgMembership: { github_role: string } | null;
  questions: QuestionRow[] | null;
  allParticipants: { id: string; status: string }[] | null;
  myParticipantRow: { id: string; status: string; submitted_at: string | null } | null;
};

interface ParallelQueryContext {
  supabase: SupabaseUserClient;
  adminSupabase: SupabaseServiceClient;
  assessmentId: string;
  userId: string;
  orgId: string;
}

async function fetchParallelData(ctx: ParallelQueryContext): Promise<ParallelQueryResults> {
  const { supabase, adminSupabase, assessmentId, userId, orgId } = ctx;
  const [
    { data: orgMembership, error: membershipError },
    { data: questions, error: questionsError },
    { data: allParticipants, error: participantsError },
    { data: myParticipantRow, error: myParticipationError },
  ] = await Promise.all([
    supabase.from('user_organisations').select('github_role').eq('user_id', userId).eq('org_id', orgId).maybeSingle(),
    adminSupabase.from('assessment_questions').select('id, question_number, naur_layer, question_text, weight, reference_answer, aggregate_score').eq('assessment_id', assessmentId).order('question_number', { ascending: true }),
    adminSupabase.from('assessment_participants').select('id, status').eq('assessment_id', assessmentId),
    supabase.from('assessment_participants').select('id, status, submitted_at').eq('assessment_id', assessmentId).eq('user_id', userId).maybeSingle(),
  ]);

  assertNoQueryError(membershipError, 'org membership');
  assertNoQueryError(questionsError, 'questions');
  assertNoQueryError(participantsError, 'participants');
  assertNoQueryError(myParticipationError, 'my participation');

  return {
    orgMembership: orgMembership as { github_role: string } | null,
    questions: questions as QuestionRow[] | null,
    allParticipants: allParticipants as { id: string; status: string }[] | null,
    myParticipantRow: myParticipantRow as { id: string; status: string; submitted_at: string | null } | null,
  };
}

/** Resolves the assessment or throws 404/500. Extracts nested PGRST116 check. */
function resolveAssessment(data: unknown, error: unknown): AssessmentWithRelations {
  if (error) {
    if ((error as Record<string, unknown>).code === 'PGRST116') throw new ApiError(404, 'Not found');
    console.error('GET /api/assessments/[id]: assessment query failed:', error);
    throw new ApiError(500, 'Internal server error');
  }
  if (!data) throw new ApiError(404, 'Not found');
  // Double cast required: Supabase type generator lacks relationship metadata for this join.
  return data as unknown as AssessmentWithRelations;
}

function buildDetailResponse(
  assessment: AssessmentWithRelations,
  callerRole: 'admin' | 'participant',
  questions: QuestionRow[],
  allParticipants: { id: string; status: string }[],
  myParticipation: MyParticipation | null,
  myScores: MyScores | null,
): AssessmentDetailResponse {
  return {
    id: assessment.id,
    type: assessment.type,
    status: assessment.status,
    repository_name: assessment.repositories.github_repo_name,
    repository_full_name: `${assessment.organisations.github_org_name}/${assessment.repositories.github_repo_name}`,
    pr_number: assessment.pr_number,
    pr_head_sha: assessment.pr_head_sha,
    feature_name: assessment.feature_name,
    feature_description: assessment.feature_description,
    aggregate_score: assessment.aggregate_score,
    scoring_incomplete: assessment.scoring_incomplete,
    artefact_quality: assessment.artefact_quality,
    conclusion: assessment.conclusion,
    config: {
      enforcement_mode: assessment.config_enforcement_mode,
      score_threshold: assessment.config_score_threshold,
      question_count: assessment.config_question_count,
    },
    questions: filterQuestionFields(questions, assessment.type, callerRole, assessment.status),
    participants: {
      total: allParticipants.length,
      completed: allParticipants.filter(p => p.status === 'submitted').length,
    },
    my_participation: myParticipation,
    my_scores: myScores,
    skip_info: assessment.skip_reason && assessment.skipped_at
      ? { reason: assessment.skip_reason, skipped_at: assessment.skipped_at }
      : null,
    created_at: assessment.created_at,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: assessmentId } = await params;
    const user = await requireAuth(request);
    const supabase = createReadonlyRouteHandlerClient(request);
    const adminSupabase = createSecretSupabaseClient();

    // 1. Fetch assessment (RLS enforced — returns null/error if caller has no access).
    const { data: rawAssessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
      .eq('id', assessmentId)
      .single();

    const assessment = resolveAssessment(rawAssessment, assessmentError);

    // 2–5. Parallel queries (all depend only on assessmentId + user.id, available after step 1).
    const { orgMembership, questions, allParticipants, myParticipantRow } =
      await fetchParallelData({ supabase, adminSupabase, assessmentId, userId: user.id, orgId: assessment.org_id });

    const callerRole: 'admin' | 'participant' =
      orgMembership?.github_role === 'admin' ? 'admin' : 'participant';

    const myParticipation: MyParticipation | null = myParticipantRow
      ? { participant_id: myParticipantRow.id, status: myParticipantRow.status as 'pending' | 'submitted', submitted_at: myParticipantRow.submitted_at }
      : null;

    // 6. Fetch self-view scores for FCS participants who have submitted.
    const myScores = await fetchMyScores(adminSupabase, {
      assessmentType: assessment.type,
      assessmentStatus: assessment.status,
      callerRole,
      participantRow: myParticipantRow,
      questions: questions ?? [],
    });

    return json(buildDetailResponse(assessment, callerRole, questions ?? [], allParticipants ?? [], myParticipation, myScores));
  } catch (error) {
    return handleApiError(error);
  }
}

// ---------------------------------------------------------------------------
// Private helper: fetch self-view scores
// ---------------------------------------------------------------------------

type SupabaseServiceClient = ReturnType<typeof createSecretSupabaseClient>;

interface MyScoresContext {
  assessmentType: 'prcc' | 'fcs';
  assessmentStatus: AssessmentStatus;
  callerRole: 'admin' | 'participant';
  participantRow: { id: string; status: string } | null;
  questions: QuestionRow[];
}

type AnswerRow = {
  question_id: string;
  answer_text: string;
  score: number | null;
  score_rationale: string | null;
  is_reassessment: boolean;
  created_at: string;
};

/** Returns true when `fetchMyScores` should short-circuit and return null. */
function shouldSkipMyScores(ctx: MyScoresContext): boolean {
  if (ctx.assessmentType !== 'fcs') return true;
  if (ctx.callerRole === 'admin') return true;
  if (ctx.participantRow === null) return true;
  const scored = ctx.assessmentStatus === 'completed' || ctx.participantRow.status === 'submitted';
  return !scored;
}

/** Returns the latest non-reassessment answer per question (answers must be pre-sorted descending). */
function pickLatestAnswers(allAnswers: AnswerRow[]): Map<string, AnswerRow> {
  const latest = new Map<string, AnswerRow>();
  for (const a of allAnswers) {
    if (!a.is_reassessment && !latest.has(a.question_id)) latest.set(a.question_id, a);
  }
  return latest;
}

type ScoredAnswerRow = AnswerRow & { score: number; score_rationale: string };

/** Narrows an answer to one with a complete (non-null) score and rationale. */
function isFullyScored(answer: AnswerRow): answer is ScoredAnswerRow {
  return answer.score !== null && answer.score_rationale !== null;
}

/** Builds the scored-questions array from the latest non-reassessment answers. */
function buildScoredQuestions(
  allAnswers: AnswerRow[],
  questionMap: Map<string, QuestionRow>,
): MyScoreQuestion[] {
  const scored: MyScoreQuestion[] = [];
  for (const [qid, answer] of pickLatestAnswers(allAnswers)) {
    const question = questionMap.get(qid);
    if (!question || !isFullyScored(answer)) continue;
    scored.push({
      question_id: qid,
      naur_layer: question.naur_layer,
      question_text: question.question_text,
      my_answer: answer.answer_text,
      score: answer.score,
      score_rationale: answer.score_rationale,
    });
  }
  scored.sort((a, b) => {
    const numA = questionMap.get(a.question_id)?.question_number ?? 0;
    const numB = questionMap.get(b.question_id)?.question_number ?? 0;
    return numA - numB;
  });
  return scored;
}

/** Returns the ISO timestamp of the most recent reassessment answer, or null. */
function findLastReassessmentAt(allAnswers: AnswerRow[]): string | null {
  let latest: string | null = null;
  for (const a of allAnswers) {
    if (!a.is_reassessment) continue;
    if (latest === null || a.created_at > latest) latest = a.created_at;
  }
  return latest;
}

async function fetchMyScores(
  adminSupabase: SupabaseServiceClient,
  ctx: MyScoresContext,
): Promise<MyScores | null> {
  if (shouldSkipMyScores(ctx)) return null;

  // participantRow is guaranteed non-null here (shouldSkipMyScores guards it).
  const participantRow = ctx.participantRow!;

  const { data: answers, error: answersError } = await adminSupabase
    .from('participant_answers')
    .select('question_id, answer_text, score, score_rationale, is_reassessment, created_at')
    .eq('participant_id', participantRow.id)
    .order('attempt_number', { ascending: false });

  assertNoQueryError(answersError, 'answers');

  const allAnswers = (answers ?? []) as AnswerRow[];
  const questionMap = new Map<string, QuestionRow>(ctx.questions.map(q => [q.id, q]));

  return {
    questions: buildScoredQuestions(allAnswers, questionMap),
    reassessment_available: ctx.assessmentStatus === 'completed',
    last_reassessment_at: findLastReassessmentAt(allAnswers),
  };
}
