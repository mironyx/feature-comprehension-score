// Shared query logic for assessment detail.
// Extracted from route.ts so both the API route and the page server loader can use
// it without duplication. Issue: #376
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { filterQuestionFields } from './helpers';
import type { FilteredQuestion } from './helpers';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type AssessmentStatus = AssessmentRow['status'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];

// ---------------------------------------------------------------------------
// Contract types — response shape for GET /api/assessments/[id]
// ---------------------------------------------------------------------------

export interface MyParticipation {
  participant_id: string;
  status: 'pending' | 'submitted';
  submitted_at: string | null;
}

export interface FcsPr {
  pr_number: number;
  pr_title: string;
}

export interface FcsIssue {
  issue_number: number;
  issue_title: string;
}

interface ParticipantSummary {
  total: number;
  completed: number;
}

export type ParticipantStatus = 'pending' | 'submitted' | 'removed' | 'did_not_participate';

export interface ParticipantDetail {
  github_login: string;
  status: ParticipantStatus;
}

export interface AssessmentDetailResponse {
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
  config: { enforcement_mode: string; score_threshold: number; question_count: number };
  questions: FilteredQuestion[];
  participants: ParticipantSummary | ParticipantDetail[];
  my_participation: MyParticipation | null;
  fcs_prs: FcsPr[];
  fcs_issues: FcsIssue[];
  caller_role: 'admin' | 'participant';
  skip_info: { reason: string; skipped_at: string } | null;
  rubric_progress: string | null;
  rubric_progress_updated_at: string | null;
  rubric_error_code: string | null;
  rubric_retry_count: number;
  rubric_error_retryable: boolean | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Assessment row with joined repository and organisation names. */
export type AssessmentWithRelations = AssessmentRow & {
  repositories: { github_repo_name: string };
  organisations: { github_org_name: string };
};

type UserClient = SupabaseClient<Database>;
type ServiceClient = SupabaseClient<Database>;

type ParallelData = {
  callerRole: 'admin' | 'participant';
  questions: QuestionRow[];
  allParticipants: { id: string; status: string; github_username: string }[];
  myParticipation: MyParticipation | null;
  fcsPrs: FcsPr[];
  fcsIssues: FcsIssue[];
};

export interface FetchContext {
  supabase: UserClient;
  adminSupabase: ServiceClient;
  assessmentId: string;
  userId: string;
  orgId: string;
  assessmentType: 'prcc' | 'fcs';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNoDbError(error: unknown, label: string): void {
  if (!error) return;
  logger.error({ err: error, label }, 'assessment-detail-queries: query failed');
  throw new ApiError(500, 'Internal server error');
}

/** Resolves the assessment row or throws 404/500. */
export function resolveAssessment(data: unknown, error: unknown): AssessmentWithRelations {
  if (error) {
    if ((error as unknown as Record<string, unknown>).code === 'PGRST116') throw new ApiError(404, 'Not found');
    logger.error({ err: error }, 'assessment-detail-queries: assessment query failed');
    throw new ApiError(500, 'Internal server error');
  }
  if (!data) throw new ApiError(404, 'Not found');
  // Double cast required: Supabase type generator lacks relationship metadata for this join.
  return data as unknown as AssessmentWithRelations;
}

export async function fetchParallelData(ctx: FetchContext): Promise<ParallelData> {
  const { supabase, adminSupabase, assessmentId, userId, orgId, assessmentType } = ctx;
  const emptyTableResult = { data: [], error: null };
  const [
    { data: orgMembership, error: membershipError },
    { data: questions, error: questionsError },
    { data: allParticipants, error: participantsError },
    { data: myParticipantRow, error: myParticipationError },
    { data: fcsPrs, error: fcsPrsError },
    { data: fcsIssues, error: fcsIssuesError },
  ] = await Promise.all([
    supabase.from('user_organisations').select('github_role').eq('user_id', userId).eq('org_id', orgId).maybeSingle(),
    adminSupabase.from('assessment_questions').select('id, question_number, naur_layer, question_text, weight, reference_answer, hint, aggregate_score').eq('assessment_id', assessmentId).eq('org_id', orgId).order('question_number', { ascending: true }),
    adminSupabase.from('assessment_participants').select('id, status, github_username').eq('assessment_id', assessmentId).eq('org_id', orgId),
    supabase.from('assessment_participants').select('id, status, submitted_at').eq('assessment_id', assessmentId).eq('user_id', userId).maybeSingle(),
    assessmentType === 'fcs'
      ? adminSupabase.from('fcs_merged_prs').select('pr_number, pr_title').eq('assessment_id', assessmentId).eq('org_id', orgId)
      : Promise.resolve(emptyTableResult),
    assessmentType === 'fcs'
      ? adminSupabase.from('fcs_issue_sources').select('issue_number, issue_title').eq('assessment_id', assessmentId).eq('org_id', orgId)
      : Promise.resolve(emptyTableResult),
  ]);

  assertNoDbError(membershipError, 'org membership');
  assertNoDbError(questionsError, 'questions');
  assertNoDbError(participantsError, 'participants');
  assertNoDbError(myParticipationError, 'my participation');
  assertNoDbError(fcsPrsError, 'fcs prs');
  assertNoDbError(fcsIssuesError, 'fcs issues');

  const callerRole: 'admin' | 'participant' =
    (orgMembership as { github_role: string } | null)?.github_role === 'admin' ? 'admin' : 'participant';

  const typedMyParticipant = myParticipantRow as { id: string; status: string; submitted_at: string | null } | null;
  const myParticipation: MyParticipation | null = typedMyParticipant
    ? { participant_id: typedMyParticipant.id, status: typedMyParticipant.status as 'pending' | 'submitted', submitted_at: typedMyParticipant.submitted_at }
    : null;

  return {
    callerRole,
    questions: (questions ?? []) as QuestionRow[],
    allParticipants: (allParticipants ?? []) as { id: string; status: string; github_username: string }[],
    myParticipation,
    fcsPrs: (fcsPrs ?? []) as FcsPr[],
    fcsIssues: (fcsIssues ?? []) as FcsIssue[],
  };
}

function buildParticipantsField(
  callerRole: 'admin' | 'participant',
  allParticipants: ParallelData['allParticipants'],
): ParticipantSummary | ParticipantDetail[] {
  if (callerRole === 'admin') {
    return allParticipants.map(p => ({
      github_login: p.github_username,
      status: p.status as ParticipantStatus,
    }));
  }
  return {
    total: allParticipants.length,
    completed: allParticipants.filter(p => p.status === 'submitted').length,
  };
}

export function buildResponse(
  assessment: AssessmentWithRelations,
  { callerRole, questions, allParticipants, myParticipation, fcsPrs, fcsIssues }: ParallelData,
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
    participants: buildParticipantsField(callerRole, allParticipants),
    my_participation: myParticipation,
    fcs_prs: fcsPrs,
    fcs_issues: fcsIssues,
    caller_role: callerRole,
    skip_info: assessment.skip_reason && assessment.skipped_at
      ? { reason: assessment.skip_reason, skipped_at: assessment.skipped_at }
      : null,
    rubric_progress: assessment.rubric_progress,
    rubric_progress_updated_at: assessment.rubric_progress_updated_at,
    rubric_error_code: assessment.rubric_error_code,
    rubric_retry_count: assessment.rubric_retry_count,
    rubric_error_retryable: assessment.rubric_error_retryable,
    created_at: assessment.created_at,
  };
}
