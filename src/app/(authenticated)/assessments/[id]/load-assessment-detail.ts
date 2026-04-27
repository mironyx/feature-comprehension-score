// Server-side loader for /assessments/[id] — replaces the broken relative-URL self-fetch.
// Queries Supabase directly, mirroring the logic from GET /api/assessments/[id].
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #376

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import type {
  AssessmentDetailResponse,
  MyParticipation,
  FcsPr,
  FcsIssue,
  ParticipantStatus,
} from '@/app/api/assessments/[id]/route';
import { filterQuestionFields } from '@/app/api/assessments/[id]/helpers';
import { logger } from '@/lib/logger';

type DB = Database;
type Row<T extends keyof DB['public']['Tables']> = DB['public']['Tables'][T]['Row'];
type AssessmentRow = Row<'assessments'>;
type QuestionRow = Row<'assessment_questions'>;

type AssessmentWithRelations = AssessmentRow & {
  readonly repositories: { readonly github_repo_name: string };
  readonly organisations: { readonly github_org_name: string };
};

type UserClient = SupabaseClient<DB>;
type AdminClient = SupabaseClient<DB>;

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function fetchAssessmentRow(
  supabase: UserClient,
  assessmentId: string,
): Promise<AssessmentWithRelations | null> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
    .eq('id', assessmentId)
    .single();
  if (error?.code === 'PGRST116' || !data) return null;
  if (error) {
    logger.error({ err: error, assessmentId }, 'loadAssessmentDetail: assessment query failed');
    return null;
  }
  return data as unknown as AssessmentWithRelations;
}

type ParticipantRow = { id: string; status: string; github_username: string };

async function fetchParallelData(
  supabase: UserClient,
  adminSupabase: AdminClient,
  assessmentId: string,
  userId: string,
  orgId: string,
  assessmentType: 'prcc' | 'fcs',
) {
  const empty = { data: [], error: null };
  const [membership, questions, participants, myRow, fcsPrs, fcsIssues] = await Promise.all([
    supabase.from('user_organisations').select('github_role').eq('user_id', userId).eq('org_id', orgId).maybeSingle(),
    adminSupabase.from('assessment_questions').select('id, question_number, naur_layer, question_text, weight, reference_answer, hint, aggregate_score').eq('assessment_id', assessmentId).eq('org_id', orgId).order('question_number', { ascending: true }),
    adminSupabase.from('assessment_participants').select('id, status, github_username').eq('assessment_id', assessmentId).eq('org_id', orgId),
    supabase.from('assessment_participants').select('id, status, submitted_at').eq('assessment_id', assessmentId).eq('user_id', userId).maybeSingle(),
    assessmentType === 'fcs' ? adminSupabase.from('fcs_merged_prs').select('pr_number, pr_title').eq('assessment_id', assessmentId).eq('org_id', orgId) : Promise.resolve(empty),
    assessmentType === 'fcs' ? adminSupabase.from('fcs_issue_sources').select('issue_number, issue_title').eq('assessment_id', assessmentId).eq('org_id', orgId) : Promise.resolve(empty),
  ]);
  const anyError = membership.error ?? questions.error ?? participants.error ?? myRow.error ?? fcsPrs.error ?? fcsIssues.error;
  if (anyError) throw new Error(`loadAssessmentDetail parallel query failed: ${anyError.message}`);
  const callerRole: 'admin' | 'participant' =
    (membership.data as { github_role: string } | null)?.github_role === 'admin' ? 'admin' : 'participant';
  const raw = myRow.data as { id: string; status: string; submitted_at: string | null } | null;
  const myParticipation: MyParticipation | null = raw
    ? { participant_id: raw.id, status: raw.status as 'pending' | 'submitted', submitted_at: raw.submitted_at }
    : null;
  return {
    callerRole,
    questions: (questions.data ?? []) as QuestionRow[],
    allParticipants: (participants.data ?? []) as ParticipantRow[],
    myParticipation,
    fcsPrs: (fcsPrs.data ?? []) as FcsPr[],
    fcsIssues: (fcsIssues.data ?? []) as FcsIssue[],
  };
}

function buildParticipantsField(
  callerRole: 'admin' | 'participant',
  all: ParticipantRow[],
) {
  if (callerRole === 'admin') {
    return all.map(p => ({ github_login: p.github_username, status: p.status as ParticipantStatus }));
  }
  return { total: all.length, completed: all.filter(p => p.status === 'submitted').length };
}

function buildResponse(
  a: AssessmentWithRelations,
  d: Awaited<ReturnType<typeof fetchParallelData>>,
): AssessmentDetailResponse {
  return {
    id: a.id,
    type: a.type,
    status: a.status,
    repository_name: a.repositories.github_repo_name,
    repository_full_name: `${a.organisations.github_org_name}/${a.repositories.github_repo_name}`,
    pr_number: a.pr_number,
    pr_head_sha: a.pr_head_sha,
    feature_name: a.feature_name,
    feature_description: a.feature_description,
    aggregate_score: a.aggregate_score,
    scoring_incomplete: a.scoring_incomplete,
    artefact_quality: a.artefact_quality,
    conclusion: a.conclusion,
    config: { enforcement_mode: a.config_enforcement_mode, score_threshold: a.config_score_threshold, question_count: a.config_question_count },
    questions: filterQuestionFields(d.questions, a.type, d.callerRole, a.status),
    participants: buildParticipantsField(d.callerRole, d.allParticipants),
    my_participation: d.myParticipation,
    fcs_prs: d.fcsPrs,
    fcs_issues: d.fcsIssues,
    caller_role: d.callerRole,
    skip_info: a.skip_reason && a.skipped_at ? { reason: a.skip_reason, skipped_at: a.skipped_at } : null,
    rubric_progress: a.rubric_progress,
    rubric_progress_updated_at: a.rubric_progress_updated_at,
    rubric_error_code: a.rubric_error_code,
    rubric_retry_count: a.rubric_retry_count,
    rubric_error_retryable: a.rubric_error_retryable,
    created_at: a.created_at,
  };
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Load full assessment detail for the given user, querying Supabase directly.
 * Returns null if the assessment does not exist or is not accessible via RLS.
 */
export async function loadAssessmentDetail(
  supabase: UserClient,
  adminSupabase: AdminClient,
  userId: string,
  assessmentId: string,
): Promise<AssessmentDetailResponse | null> {
  const assessment = await fetchAssessmentRow(supabase, assessmentId);
  if (!assessment) return null;
  const data = await fetchParallelData(supabase, adminSupabase, assessmentId, userId, assessment.org_id, assessment.type);
  return buildResponse(assessment, data);
}
