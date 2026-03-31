// Retry rubric generation service — resets failed assessment and re-triggers generation.
// Issue: #132

import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import type { ApiContext } from '@/lib/api/context';
import { createGithubClient } from '@/lib/github/client';
import { GitHubArtefactSource } from '@/lib/github';
import { generateRubric } from '@/lib/engine/pipeline';
import { buildLlmClient } from '@/lib/api/llm';
import type { Database } from '@/lib/supabase/types';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';

type ServiceClient = SupabaseClient<Database>;

interface AssessmentRow {
  id: string;
  org_id: string;
  repository_id: string;
  status: string;
  config_question_count: number;
}

interface RepoRow {
  github_repo_name: string;
  org_id: string;
  organisations: { github_org_name: string };
}

interface ConfigRow {
  enforcement_mode: string;
  score_threshold: number;
  fcs_question_count: number;
  min_pr_size: number;
}

async function fetchAssessment(adminSupabase: ServiceClient, id: string): Promise<AssessmentRow> {
  const { data, error } = await adminSupabase
    .from('assessments')
    .select('id, org_id, repository_id, status, config_question_count')
    .eq('id', id)
    .single();
  if (error || !data) throw new ApiError(404, 'Assessment not found');
  return data as AssessmentRow;
}

async function fetchRepoContext(adminSupabase: ServiceClient, assessment: AssessmentRow) {
  const [repoResult, cfgResult] = await Promise.all([
    adminSupabase
      .from('repositories')
      .select('github_repo_name, org_id, organisations!inner(github_org_name)')
      .eq('id', assessment.repository_id)
      .single() as unknown as Promise<{ data: RepoRow | null; error: unknown }>,
    adminSupabase
      .from('org_config')
      .select('enforcement_mode, score_threshold, fcs_question_count, min_pr_size')
      .eq('org_id', assessment.org_id)
      .single() as unknown as Promise<{ data: ConfigRow | null; error: unknown }>,
  ]);
  if (repoResult.error || !repoResult.data) throw new Error('Repository not found');
  if (cfgResult.error || !cfgResult.data) throw new Error('Config not found');
  return { repo: repoResult.data, config: cfgResult.data };
}

function stripOrgPrefix(repoName: string): string {
  return repoName.includes('/') ? repoName.split('/')[1]! : repoName;
}

async function fetchMergedPrNumbers(adminSupabase: ServiceClient, assessmentId: string): Promise<number[]> {
  const { data } = await adminSupabase
    .from('fcs_merged_prs')
    .select('pr_number')
    .eq('assessment_id', assessmentId);
  return (data ?? []).map(p => p.pr_number);
}

async function buildArtefacts(
  adminSupabase: ServiceClient,
  userId: string,
  repo: RepoRow,
  prNumbers: number[],
  questionCount: number,
): Promise<AssembledArtefactSet> {
  const octokit = await createGithubClient(adminSupabase, userId);
  const source = new GitHubArtefactSource(octokit);
  const raw = await source.extractFromPRs({
    owner: repo.organisations.github_org_name,
    repo: stripOrgPrefix(repo.github_repo_name),
    prNumbers,
  });
  return { ...raw, question_count: questionCount, artefact_quality: 'code_only', token_budget_applied: false };
}

async function generateAndFinalise(
  adminSupabase: ServiceClient,
  assessmentId: string,
  orgId: string,
  artefacts: AssembledArtefactSet,
): Promise<void> {
  const llmClient = buildLlmClient(logger);
  const result = await generateRubric({ artefacts, llmClient });
  if (result.status === 'generation_failed') throw new Error(`Rubric generation failed: ${result.error.code}`);
  await adminSupabase.rpc('finalise_rubric', {
    p_assessment_id: assessmentId,
    p_org_id: orgId,
    p_questions: result.rubric.questions,
  });
}

async function runRubricGeneration(adminSupabase: ServiceClient, userId: string, assessment: AssessmentRow): Promise<void> {
  try {
    const { repo } = await fetchRepoContext(adminSupabase, assessment);
    const prNumbers = await fetchMergedPrNumbers(adminSupabase, assessment.id);
    const artefacts = await buildArtefacts(adminSupabase, userId, repo, prNumbers, assessment.config_question_count);
    await generateAndFinalise(adminSupabase, assessment.id, assessment.org_id, artefacts);
  } catch (err) {
    logger.error({ err, assessmentId: assessment.id }, 'runRubricGeneration: retry failed');
    const { error } = await adminSupabase.from('assessments').update({ status: 'rubric_failed' }).eq('id', assessment.id);
    if (error) logger.error({ err: error }, 'Failed to set rubric_failed on retry');
  }
}

async function resetAndRetrigger(adminSupabase: ServiceClient, userId: string, assessment: AssessmentRow): Promise<void> {
  const { error } = await adminSupabase.from('assessments').update({ status: 'rubric_generation' }).eq('id', assessment.id);
  if (error) throw new ApiError(500, 'Failed to reset assessment status');
  void runRubricGeneration(adminSupabase, userId, assessment);
}

export async function retryRubricGeneration(
  ctx: ApiContext,
  assessmentId: string,
): Promise<{ assessment_id: string; status: 'rubric_generation' }> {
  const assessment = await fetchAssessment(ctx.adminSupabase, assessmentId);
  if (assessment.status !== 'rubric_failed') {
    throw new ApiError(400, 'Assessment must be in rubric_failed status to retry');
  }
  await resetAndRetrigger(ctx.adminSupabase, ctx.user.id, assessment);
  return { assessment_id: assessmentId, status: 'rubric_generation' };
}
