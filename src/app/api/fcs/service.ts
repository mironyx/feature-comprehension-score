// POST /api/fcs — FCS assessment creation service.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 POST /api/fcs

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import type { ApiContext } from '@/lib/api/context';
import { createGithubClient } from '@/lib/github/client';
import { GitHubArtefactSource } from '@/lib/github';
import { generateRubric } from '@/lib/engine/pipeline';
import { buildLlmClient } from '@/lib/api/llm';
import type { Database, Json } from '@/lib/supabase/types';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { classifyArtefactQuality } from '@/lib/engine/prompts/classify-quality';

type UserClient = ApiContext['supabase'];
type ServiceClient = SupabaseClient<Database>;

// Branded ID types — prevents accidental swaps between look-alike string arguments.
type OrgId = string & { readonly _brand: 'OrgId' };
type UserId = string & { readonly _brand: 'UserId' };
type RepositoryId = string & { readonly _brand: 'RepositoryId' };
type AssessmentId = string & { readonly _brand: 'AssessmentId' };

// ---------------------------------------------------------------------------
// Request / response contracts
// ---------------------------------------------------------------------------

export const FcsCreateBodySchema = z.object({
  org_id: z.uuid(),
  repository_id: z.uuid(),
  feature_name: z.string().min(1),
  feature_description: z.string().optional(),
  merged_pr_numbers: z.array(z.number().int().positive()).min(1),
  participants: z.array(z.object({ github_username: z.string().min(1) })).min(1),
});

export type FcsCreateBody = z.infer<typeof FcsCreateBodySchema>;
// FcsCreateInput is the subset of fields passed to createAssessmentRecord (LLD §2.4 constraint).
// Narrowed to only the fields the DB write needs, enforcing the design boundary.
export type FcsCreateInput = Pick<FcsCreateBody, 'org_id' | 'repository_id' | 'feature_name' | 'feature_description'>;

export interface CreateFcsResponse {
  assessment_id: string;
  status: 'rubric_generation';
  participant_count: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RepoInfo {
  orgName: string;
  repoName: string;
  orgId: OrgId;
  installationId: number;
  questionCount: number;
  enforcementMode: string;
  scoreThreshold: number;
  minPrSize: number;
}

interface RepoRow {
  github_repo_name: string;
  org_id: string;
  organisations: { github_org_name: string; installation_id: number };
}

interface ConfigRow {
  enforcement_mode: string;
  score_threshold: number;
  fcs_question_count: number;
  min_pr_size: number;
}

interface ValidatedPR {
  pr_number: number;
  pr_title: string;
}

interface ResolvedParticipant {
  github_username: string;
  github_user_id: number;
}

interface RubricTriggerParams {
  adminSupabase: ServiceClient;
  assessmentId: AssessmentId;
  repoInfo: RepoInfo;
  prNumbers: number[];
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

// Justification: assertOrgAdmin is extracted from createFcs to keep the exported function
// under 20 lines. The LLD places the org-admin check in the controller; createApiContext does
// not yet include adminSupabase + role-check together, so the check lives here until §2.4
// controller refactor consolidates it into requireOrgAdmin().
export async function assertOrgAdmin(supabase: UserClient, userId: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  if (error) {
    logger.error({ err: error }, 'assertOrgAdmin: query failed');
    throw new ApiError(500, 'Internal server error');
  }
  const rows = (data ?? []) as { github_role: string }[];
  if (!rows.length || rows[0]?.github_role !== 'admin') throw new ApiError(403, 'Forbidden');
}

// Justification: toRepoInfo and fetchRepoInfo are not in the LLD §2.4 internal decomposition.
// They were extracted to keep fetchRepoInfo CC below 9 (CodeScene complex-method threshold).
// The LLD §2.4 Private helpers list omits the repo+config fetch step entirely; these helpers
// implement that implicit step. The LLD should be updated to include them.
function toRepoInfo(repo: RepoRow, cfg: ConfigRow, orgId: OrgId): RepoInfo {
  const storedName = repo.github_repo_name;
  const repoName = storedName.includes('/') ? storedName.split('/')[1]! : storedName;
  return {
    orgName: repo.organisations.github_org_name,
    repoName,
    orgId,
    installationId: repo.organisations.installation_id,
    questionCount: cfg.fcs_question_count,
    enforcementMode: cfg.enforcement_mode,
    scoreThreshold: cfg.score_threshold,
    minPrSize: cfg.min_pr_size,
  };
}

function validateRepo(result: { data: RepoRow | null; error: unknown }, orgId: OrgId): RepoRow {
  const { data, error } = result;
  if (error !== null || data === null) throw new ApiError(422, 'Repository not found');
  if (data.org_id !== orgId) throw new ApiError(422, 'Repository does not belong to this organisation');
  return data;
}

function validateCfg(result: { data: ConfigRow | null; error: unknown }): ConfigRow {
  const { data, error } = result;
  if (error !== null || data === null) throw new ApiError(500, 'Organisation config not found');
  return data;
}

async function fetchRepoInfo(adminSupabase: ServiceClient, repositoryId: RepositoryId, orgId: OrgId): Promise<RepoInfo> {
  const [repoResult, cfgResult] = await Promise.all([
    adminSupabase
      .from('repositories')
      .select('github_repo_name, org_id, organisations!inner(github_org_name, installation_id)')
      .eq('id', repositoryId)
      .single() as unknown as Promise<{ data: RepoRow | null; error: unknown }>,
    adminSupabase
      .from('org_config')
      .select('enforcement_mode, score_threshold, fcs_question_count, min_pr_size')
      .eq('org_id', orgId)
      .single() as unknown as Promise<{ data: ConfigRow | null; error: unknown }>,
  ]);
  return toRepoInfo(validateRepo(repoResult, orgId), validateCfg(cfgResult), orgId);
}

async function validateMergedPRs(octokit: Octokit, owner: string, repo: string, prNumbers: number[]): Promise<ValidatedPR[]> {
  return Promise.all(prNumbers.map(async (prNumber) => {
    try {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
      if (!data.merged_at) throw new ApiError(422, `PR #${prNumber} is not merged`);
      return { pr_number: prNumber, pr_title: data.title };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.error({ err, prNumber }, 'validateMergedPRs: GitHub API error');
      throw new ApiError(422, `PR #${prNumber} not found`);
    }
  }));
}

async function resolveParticipants(octokit: Octokit, usernames: string[]): Promise<ResolvedParticipant[]> {
  return Promise.all(usernames.map(async (username) => {
    try {
      const { data } = await octokit.rest.users.getByUsername({ username });
      return { github_username: data.login, github_user_id: data.id };
    } catch (err) {
      logger.error({ err, username }, 'resolveParticipants: GitHub API error');
      throw new ApiError(422, `Unknown GitHub username: ${username}`);
    }
  }));
}

// Justification: CreateAssessmentParams bundles 4 fields to keep createAssessmentWithParticipants
// under the CodeScene "Excess Number of Function Arguments" threshold (5). The LLD §2.4 specified
// separate createAssessmentRecord + enrollParticipants; these were merged into a single RPC call
// (create_fcs_assessment) as part of the #118 transactional refactor.
interface CreateAssessmentParams {
  body: FcsCreateInput;
  repoInfo: RepoInfo;
  validatedPRs: ValidatedPR[];
  participants: ResolvedParticipant[];
}

async function createAssessmentWithParticipants(
  adminSupabase: ServiceClient,
  params: CreateAssessmentParams,
): Promise<AssessmentId> {
  const { body, repoInfo, validatedPRs, participants } = params;
  const assessmentId = randomUUID() as AssessmentId;
  const { error } = await adminSupabase.rpc('create_fcs_assessment', {
    p_id: assessmentId,
    p_org_id: body.org_id,
    p_repository_id: body.repository_id,
    p_feature_name: body.feature_name,
    p_feature_description: body.feature_description ?? '',
    p_config_enforcement_mode: repoInfo.enforcementMode,
    p_config_score_threshold: repoInfo.scoreThreshold,
    p_config_question_count: repoInfo.questionCount,
    p_config_min_pr_size: repoInfo.minPrSize,
    p_merged_prs: validatedPRs as unknown as Json,
    p_participants: participants.map(p => ({
      github_user_id: p.github_user_id,
      github_username: p.github_username,
    })) as unknown as Json,
  });
  if (error) {
    logger.error({ err: error }, 'createAssessmentWithParticipants: rpc failed');
    throw new ApiError(500, 'Failed to create assessment');
  }
  return assessmentId;
}

// Justification: logArtefactSummary extracted from finaliseRubric to log artefact metadata
// before the LLM call (#136). Not in LLD §2.4 — added for observability.
function logArtefactSummary(artefacts: AssembledArtefactSet): void {
  logger.info({
    fileCount: artefacts.file_contents.length,
    testFileCount: artefacts.test_files?.length ?? 0,
    artefactQuality: artefacts.artefact_quality,
    questionCount: artefacts.question_count,
    tokenBudgetApplied: artefacts.token_budget_applied,
  }, 'Rubric generation: artefact summary');
}

// Justification: finaliseRubric absorbs storeRubricQuestions (LLD §2.4) and the status
// transition into a single finalise_rubric RPC call as part of the #118 transactional refactor.
async function finaliseRubric(
  adminSupabase: ServiceClient,
  assessmentId: AssessmentId,
  orgId: OrgId,
  artefacts: AssembledArtefactSet,
): Promise<void> {
  logArtefactSummary(artefacts);
  const llmClient = buildLlmClient(logger);
  const result = await generateRubric({ artefacts, llmClient });
  if (result.status === 'generation_failed') throw new Error(`Rubric generation failed: ${result.error.code}`);
  const { error } = await adminSupabase.rpc('finalise_rubric', {
    p_assessment_id: assessmentId,
    p_org_id: orgId,
    p_questions: result.rubric.questions,
  });
  if (error) throw new Error('Failed to finalise rubric');
}

async function markRubricFailed(adminSupabase: ServiceClient, assessmentId: AssessmentId): Promise<void> {
  const { error } = await adminSupabase
    .from('assessments')
    .update({ status: 'rubric_failed' })
    .eq('id', assessmentId);
  if (error) logger.error({ err: error, assessmentId }, 'markRubricFailed: update failed');
}

async function triggerRubricGeneration(params: RubricTriggerParams): Promise<void> {
  try {
    const octokit = await createGithubClient(params.repoInfo.installationId);
    const source = new GitHubArtefactSource(octokit);
    const [raw, organisation_context] = await Promise.all([
      source.extractFromPRs({ owner: params.repoInfo.orgName, repo: params.repoInfo.repoName, prNumbers: params.prNumbers }),
      loadOrgPromptContext(params.adminSupabase, params.repoInfo.orgId),
    ]);
    const artefacts: AssembledArtefactSet = { ...raw, question_count: params.repoInfo.questionCount, artefact_quality: classifyArtefactQuality(raw), token_budget_applied: false, organisation_context };
    await finaliseRubric(params.adminSupabase, params.assessmentId, params.repoInfo.orgId, artefacts);
  } catch (err) {
    logger.error({ err, assessmentId: params.assessmentId }, 'triggerRubricGeneration: failed');
    await markRubricFailed(params.adminSupabase, params.assessmentId);
  }
}

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

interface AssessmentRetryRow {
  id: string;
  org_id: string;
  repository_id: string;
  status: string;
  config_question_count: number;
}

// Resets a rubric_failed assessment to rubric_generation and re-runs generation
// against the already-stored PR records. Called by the retry-rubric route.
export async function retriggerRubricForAssessment(
  adminSupabase: ServiceClient,
  assessment: AssessmentRetryRow,
): Promise<void> {
  const assessmentId = assessment.id as AssessmentId;
  const orgId = assessment.org_id as OrgId;
  const repositoryId = assessment.repository_id as RepositoryId;
  const { error } = await adminSupabase.from('assessments').update({ status: 'rubric_generation' }).eq('id', assessmentId);
  if (error) throw new ApiError(500, 'Failed to reset assessment status');
  const repoInfo = await fetchRepoInfo(adminSupabase, repositoryId, orgId);
  const { data: prs } = await adminSupabase.from('fcs_merged_prs').select('pr_number').eq('assessment_id', assessmentId);
  const prNumbers = (prs ?? []).map((p: { pr_number: number }) => p.pr_number);
  void triggerRubricGeneration({ adminSupabase, assessmentId, repoInfo, prNumbers });
}

export async function createFcs(ctx: ApiContext, body: FcsCreateBody): Promise<CreateFcsResponse> {
  const { supabase, adminSupabase, user } = ctx;
  // Cast plain strings to branded types at the service boundary (Zod validates format upstream).
  const userId = user.id as UserId;
  const orgId = body.org_id as OrgId;
  const repositoryId = body.repository_id as RepositoryId;
  await assertOrgAdmin(supabase, userId, orgId);
  const repoInfo = await fetchRepoInfo(adminSupabase, repositoryId, orgId);
  const octokit = await createGithubClient(repoInfo.installationId);
  const [validatedPRs, participants] = await Promise.all([
    validateMergedPRs(octokit, repoInfo.orgName, repoInfo.repoName, body.merged_pr_numbers),
    resolveParticipants(octokit, body.participants.map((p) => p.github_username)),
  ]);
  const input: FcsCreateInput = body; // LLD §2.4 constraint: map body → FcsCreateInput before passing
  const assessmentId = await createAssessmentWithParticipants(adminSupabase, { body: input, repoInfo, validatedPRs, participants });
  void triggerRubricGeneration({ adminSupabase, assessmentId, repoInfo, prNumbers: body.merged_pr_numbers });
  return { assessment_id: assessmentId, status: 'rubric_generation', participant_count: participants.length };
}
