// POST /api/assessments/[id]/retry-rubric — admin retry for failed rubric generation.
// Design reference: docs/design/lld-e18.md §18.2, ADR-0014

import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';
import { assertOrgAdmin } from '@/lib/api/repo-admin-gate';
import { retriggerRubricForAssessment, MAX_RUBRIC_RETRIES } from '@/lib/api/fcs-pipeline';

export async function retryRubricGeneration(
  ctx: ApiContext,
  assessmentId: string,
): Promise<{ assessment_id: string; status: 'rubric_generation' }> {
  // Use the user-scoped client so RLS filters by the caller's org memberships.
  // adminSupabase would bypass RLS and leak assessment existence across orgs.
  const { data: assessment, error } = await ctx.supabase
    .from('assessments')
    .select('id, org_id, project_id, repository_id, status, config_question_count, config_comprehension_depth, rubric_retry_count, rubric_error_retryable')
    .eq('id', assessmentId)
    .single();
  if (error ?? !assessment) throw new ApiError(404, 'Assessment not found');
  await assertOrgAdmin(ctx, assessment.org_id);
  if (assessment.status !== 'rubric_failed') throw new ApiError(400, 'Assessment must be in rubric_failed status to retry');
  if (assessment.rubric_retry_count >= MAX_RUBRIC_RETRIES) throw new ApiError(400, 'Maximum retry limit reached');
  if (assessment.rubric_error_retryable === false) throw new ApiError(400, 'Error is not retryable');
  // FCS rows have project_id NOT NULL by DB CHECK (V11 E11.2 T2.1); narrow for TS.
  if (assessment.project_id === null) throw new ApiError(500, 'Assessment missing project_id');
  await retriggerRubricForAssessment(ctx.adminSupabase, { ...assessment, project_id: assessment.project_id });
  return { assessment_id: assessmentId, status: 'rubric_generation' };
}
