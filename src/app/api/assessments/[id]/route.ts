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
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id: assessmentId } = await params;
    const user = await requireAuth(request);
    const supabase = createReadonlyRouteHandlerClient(request);
    const adminSupabase = createSecretSupabaseClient();

    // 1. Fetch assessment (RLS enforced — returns null if caller has no access).
    const { data: rawAssessment, error: assessmentError } = await supabase
      .from('assessments')
      .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
      .eq('id', assessmentId)
      .single();

    if (assessmentError) {
      // PGRST116 = "no rows returned" — the assessment doesn't exist or RLS denied access.
      if ((assessmentError as unknown as Record<string, unknown>).code === 'PGRST116') {
        throw new ApiError(404, 'Not found');
      }
      console.error('GET /api/assessments/[id]: assessment query failed:', assessmentError);
      throw new ApiError(500, 'Internal server error');
    }
    if (!rawAssessment) {
      throw new ApiError(404, 'Not found');
    }

    // Double cast required: Supabase type generator lacks relationship metadata for this join,
    // producing SelectQueryError<> on the joined columns. Runtime shape is correct.
    const assessment = rawAssessment as unknown as AssessmentWithRelations;

    // 2–5. Run admin check, questions, participant counts, and caller participation in parallel.
    // All four queries depend only on assessmentId and user.id (available after step 1).
    const [
      { data: orgMembership, error: membershipError },
      { data: questions, error: questionsError },
      { data: allParticipants, error: participantsError },
      { data: myParticipantRow, error: myParticipationError },
    ] = await Promise.all([
      supabase
        .from('user_organisations')
        .select('github_role')
        .eq('user_id', user.id)
        .eq('org_id', assessment.org_id)
        .maybeSingle(),
      adminSupabase
        .from('assessment_questions')
        .select('id, question_number, naur_layer, question_text, weight, reference_answer, aggregate_score')
        .eq('assessment_id', assessmentId)
        .order('question_number', { ascending: true }),
      adminSupabase
        .from('assessment_participants')
        .select('id, status')
        .eq('assessment_id', assessmentId),
      supabase
        .from('assessment_participants')
        .select('id, status, submitted_at')
        .eq('assessment_id', assessmentId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (membershipError) {
      console.error('GET /api/assessments/[id]: org membership query failed:', membershipError);
      throw new ApiError(500, 'Internal server error');
    }
    if (questionsError) {
      console.error('GET /api/assessments/[id]: questions query failed:', questionsError);
      throw new ApiError(500, 'Internal server error');
    }
    if (participantsError) {
      console.error('GET /api/assessments/[id]: participants query failed:', participantsError);
      throw new ApiError(500, 'Internal server error');
    }
    if (myParticipationError) {
      console.error('GET /api/assessments/[id]: my participation query failed:', myParticipationError);
      throw new ApiError(500, 'Internal server error');
    }

    const callerRole: 'admin' | 'participant' =
      orgMembership?.github_role === 'admin' ? 'admin' : 'participant';

    const myParticipation: MyParticipation | null = myParticipantRow
      ? {
          participant_id: myParticipantRow.id,
          status: myParticipantRow.status as 'pending' | 'submitted',
          submitted_at: myParticipantRow.submitted_at,
        }
      : null;

    // 6. Fetch self-view scores for FCS participants who have submitted.
    const myScores = await fetchMyScores(adminSupabase, {
      assessmentType: assessment.type,
      assessmentStatus: assessment.status,
      callerRole,
      participantRow: myParticipantRow,
      questions: (questions as QuestionRow[]) ?? [],
    });

    // 7. Build and return response.
    const body: AssessmentDetailResponse = {
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
      questions: filterQuestionFields(
        (questions as QuestionRow[]) ?? [],
        assessment.type,
        callerRole,
        assessment.status,
      ),
      participants: {
        total: (allParticipants ?? []).length,
        completed: (allParticipants ?? []).filter(p => p.status === 'submitted').length,
      },
      my_participation: myParticipation,
      my_scores: myScores,
      skip_info:
        assessment.skip_reason && assessment.skipped_at
          ? { reason: assessment.skip_reason, skipped_at: assessment.skipped_at }
          : null,
      created_at: assessment.created_at,
    };

    return json(body);
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

async function fetchMyScores(
  adminSupabase: SupabaseServiceClient,
  ctx: MyScoresContext,
): Promise<MyScores | null> {
  const { assessmentType, assessmentStatus, callerRole, participantRow, questions } = ctx;

  if (
    assessmentType !== 'fcs' ||
    callerRole === 'admin' ||
    participantRow === null ||
    (assessmentStatus !== 'completed' && participantRow.status !== 'submitted')
  ) {
    return null;
  }

  const { data: answers, error: answersError } = await adminSupabase
    .from('participant_answers')
    .select('question_id, answer_text, score, score_rationale, is_reassessment, created_at')
    .eq('participant_id', participantRow.id)
    .order('attempt_number', { ascending: false });

  if (answersError) {
    console.error('GET /api/assessments/[id]: answers query failed:', answersError);
    throw new ApiError(500, 'Internal server error');
  }

  const allAnswers = (answers ?? []) as Array<{
    question_id: string;
    answer_text: string;
    score: number | null;
    score_rationale: string | null;
    is_reassessment: boolean;
    created_at: string;
  }>;

  const questionMap = new Map<string, QuestionRow>(questions.map(q => [q.id, q]));

  // Pick the latest non-reassessment answer per question (ordered descending by attempt_number).
  const latestByQuestion = new Map<string, typeof allAnswers[0]>();
  for (const a of allAnswers) {
    if (!a.is_reassessment && !latestByQuestion.has(a.question_id)) {
      latestByQuestion.set(a.question_id, a);
    }
  }

  const scoredQuestions: MyScoreQuestion[] = [];
  for (const [qid, answer] of latestByQuestion) {
    const question = questionMap.get(qid);
    if (!question || answer.score === null || answer.score_rationale === null) continue;
    scoredQuestions.push({
      question_id: qid,
      naur_layer: question.naur_layer,
      question_text: question.question_text,
      my_answer: answer.answer_text,
      score: answer.score,
      score_rationale: answer.score_rationale,
    });
  }

  // Sort by question_number for consistent ordering.
  scoredQuestions.sort((a, b) => {
    const numA = questionMap.get(a.question_id)?.question_number ?? 0;
    const numB = questionMap.get(b.question_id)?.question_number ?? 0;
    return numA - numB;
  });

  let lastReassessmentAt: string | null = null;
  for (const a of allAnswers) {
    if (a.is_reassessment && (lastReassessmentAt === null || a.created_at > lastReassessmentAt)) {
      lastReassessmentAt = a.created_at;
    }
  }

  return {
    questions: scoredQuestions,
    reassessment_available: assessmentStatus === 'completed',
    last_reassessment_at: lastReassessmentAt,
  };
}
