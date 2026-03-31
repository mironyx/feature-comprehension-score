// POST /api/assessments/[id]/retry-rubric — admin retry for failed rubric generation.
// Design reference: docs/plans/2026-03-29-mvp-phase2-plan.md item 8, ADR-0014

import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';
import { assertOrgAdmin, retriggerRubricForAssessment } from '@/app/api/fcs/service';

export async function retryRubricGeneration(
  ctx: ApiContext,
  assessmentId: string,
): Promise<{ assessment_id: string; status: 'rubric_generation' }> {
  const { data: assessment, error } = await ctx.adminSupabase
    .from('assessments')
    .select('id, org_id, repository_id, status, config_question_count')
    .eq('id', assessmentId)
    .single();
  if (error ?? !assessment) throw new ApiError(404, 'Assessment not found');
  await assertOrgAdmin(ctx.supabase, ctx.user.id, assessment.org_id);
  if (assessment.status !== 'rubric_failed') throw new ApiError(400, 'Assessment must be in rubric_failed status to retry');
  await retriggerRubricForAssessment(ctx.adminSupabase, ctx.user.id, assessment);
  return { assessment_id: assessmentId, status: 'rubric_generation' };
}
