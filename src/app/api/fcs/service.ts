// POST /api/fcs — FCS assessment creation service.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 POST /api/fcs

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';
import { createGithubClient } from '@/lib/github/client';
import { GitHubArtefactSource } from '@/lib/github';
import { generateRubric } from '@/lib/engine/pipeline';
import { AnthropicClient } from '@/lib/engine/llm/client';
import type { Database } from '@/lib/supabase/types';
import type { AssembledArtefactSet } from '@/lib/engine/prompts/artefact-types';
import type { Question } from '@/lib/engine/llm/schemas';

type UserClient = ApiContext['supabase'];
type ServiceClient = SupabaseClient<Database>;

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
  orgId: string;
  questionCount: number;
  enforcementMode: string;
  scoreThreshold: number;
  minPrSize: number;
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
  userId: string;
  assessmentId: string;
  repoInfo: RepoInfo;
  prNumbers: number[];
}

// ---------------------------------------------------------------------------
// Private helpers
// CodeScene notes: file-level "Primitive Obsession" and "String Heavy Function
// Arguments" smells require branded UUID types to resolve fully. Deferred: adding
// branded types across service boundaries adds complexity without runtime benefit and
// conflicts with CLAUDE.md's simplicity guidelines. createAssessmentRecord 5-arg
// signature is exempt per CLAUDE.md ("No parameter structs for single-use internal
// functions").
// ---------------------------------------------------------------------------

async function assertOrgAdmin(supabase: UserClient, userId: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  if (error) {
    console.error('assertOrgAdmin: query failed:', error);
    throw new ApiError(500, 'Internal server error');
  }
  const rows = (data ?? []) as { github_role: string }[];
  if (!rows.length || rows[0]?.github_role !== 'admin') throw new ApiError(403, 'Forbidden');
}

function toRepoInfo(repo: RepoRow, cfg: ConfigRow, orgId: string): RepoInfo {
  return {
    orgName: repo.organisations.github_org_name,
    repoName: repo.github_repo_name,
    orgId,
    questionCount: cfg.fcs_question_count,
    enforcementMode: cfg.enforcement_mode,
    scoreThreshold: cfg.score_threshold,
    minPrSize: cfg.min_pr_size,
  };
}

async function fetchRepoInfo(adminSupabase: ServiceClient, repositoryId: string, orgId: string): Promise<RepoInfo> {
  const [repoResult, cfgResult] = await Promise.all([
    adminSupabase
      .from('repositories')
      .select('github_repo_name, org_id, organisations!inner(github_org_name)')
      .eq('id', repositoryId)
      .single() as unknown as Promise<{ data: RepoRow | null; error: unknown }>,
    adminSupabase
      .from('org_config')
      .select('enforcement_mode, score_threshold, fcs_question_count, min_pr_size')
      .eq('org_id', orgId)
      .single() as unknown as Promise<{ data: ConfigRow | null; error: unknown }>,
  ]);
  const { data: repo, error: repoError } = repoResult;
  if (repoError || !repo) throw new ApiError(422, 'Repository not found');
  if (repo.org_id !== orgId) throw new ApiError(422, 'Repository does not belong to this organisation');
  const { data: cfg, error: cfgError } = cfgResult;
  if (cfgError || !cfg) throw new ApiError(500, 'Organisation config not found');
  return toRepoInfo(repo, cfg, orgId);
}

async function validateMergedPRs(octokit: Octokit, owner: string, repo: string, prNumbers: number[]): Promise<ValidatedPR[]> {
  return Promise.all(prNumbers.map(async (prNumber) => {
    try {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
      if (!data.merged_at) throw new ApiError(422, `PR #${prNumber} is not merged`);
      return { pr_number: prNumber, pr_title: data.title };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(422, `PR #${prNumber} not found`);
    }
  }));
}

async function resolveParticipants(octokit: Octokit, usernames: string[]): Promise<ResolvedParticipant[]> {
  return Promise.all(usernames.map(async (username) => {
    try {
      const { data } = await octokit.rest.users.getByUsername({ username });
      return { github_username: data.login, github_user_id: data.id };
    } catch {
      throw new ApiError(422, `Unknown GitHub username: ${username}`);
    }
  }));
}

async function createAssessmentRecord(
  adminSupabase: ServiceClient,
  body: FcsCreateBody,
  repoInfo: RepoInfo,
  validatedPRs: ValidatedPR[],
  assessmentId: string,
): Promise<void> {
  const { error: aErr } = await adminSupabase.from('assessments').insert({
    id: assessmentId,
    org_id: body.org_id,
    repository_id: body.repository_id,
    type: 'fcs',
    status: 'rubric_generation',
    feature_name: body.feature_name,
    feature_description: body.feature_description ?? null,
    config_enforcement_mode: repoInfo.enforcementMode,
    config_score_threshold: repoInfo.scoreThreshold,
    config_question_count: repoInfo.questionCount,
    config_min_pr_size: repoInfo.minPrSize,
  });
  if (aErr) { console.error('createAssessmentRecord: insert failed:', aErr); throw new ApiError(500, 'Failed to create assessment'); }
  const { error: pErr } = await adminSupabase.from('fcs_merged_prs').insert(
    validatedPRs.map(pr => ({ org_id: body.org_id, assessment_id: assessmentId, pr_number: pr.pr_number, pr_title: pr.pr_title })),
  );
  if (pErr) { console.error('createAssessmentRecord: pr insert failed:', pErr); throw new ApiError(500, 'Failed to store merged PRs'); }
}

async function enrollParticipants(
  adminSupabase: ServiceClient,
  assessmentId: string,
  orgId: string,
  participants: ResolvedParticipant[],
): Promise<void> {
  const { error } = await adminSupabase.from('assessment_participants').insert(
    participants.map(p => ({
      org_id: orgId,
      assessment_id: assessmentId,
      github_user_id: p.github_user_id,
      github_username: p.github_username,
      contextual_role: 'participant' as const,
    })),
  );
  if (error) { console.error('enrollParticipants: insert failed:', error); throw new ApiError(500, 'Failed to enrol participants'); }
}

async function storeRubricQuestions(
  adminSupabase: ServiceClient,
  assessmentId: string,
  orgId: string,
  questions: Question[],
): Promise<void> {
  const { error } = await adminSupabase.from('assessment_questions').insert(
    questions.map(q => ({
      org_id: orgId,
      assessment_id: assessmentId,
      question_number: q.question_number,
      question_text: q.question_text,
      naur_layer: q.naur_layer,
      weight: q.weight,
      reference_answer: q.reference_answer,
    })),
  );
  if (error) throw new Error('Failed to store assessment questions');
}

function buildLlmClient(): AnthropicClient {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new ApiError(500, 'LLM client not configured');
  return new AnthropicClient({ apiKey });
}

async function finaliseRubric(
  adminSupabase: ServiceClient,
  assessmentId: string,
  orgId: string,
  artefacts: AssembledArtefactSet,
): Promise<void> {
  const llmClient = buildLlmClient();
  const result = await generateRubric({ artefacts, llmClient });
  if (result.status === 'generation_failed') throw new Error(`Rubric generation failed: ${result.error.code}`);
  await storeRubricQuestions(adminSupabase, assessmentId, orgId, result.rubric.questions);
  const { error } = await adminSupabase.from('assessments').update({ status: 'awaiting_responses' }).eq('id', assessmentId);
  if (error) throw new Error('Failed to update assessment status to awaiting_responses');
}

async function triggerRubricGeneration(params: RubricTriggerParams): Promise<void> {
  try {
    const octokit = await createGithubClient(params.adminSupabase, params.userId);
    const source = new GitHubArtefactSource(octokit);
    const raw = await source.extractFromPRs({ owner: params.repoInfo.orgName, repo: params.repoInfo.repoName, prNumbers: params.prNumbers });
    const artefacts: AssembledArtefactSet = { ...raw, question_count: params.repoInfo.questionCount, artefact_quality: 'code_only', token_budget_applied: false };
    await finaliseRubric(params.adminSupabase, params.assessmentId, params.repoInfo.orgId, artefacts);
  } catch (err) {
    // Swallowed: rubric generation failure must not affect the assessment creation response.
    console.error('triggerRubricGeneration: failed for assessment', params.assessmentId, ':', err);
  }
}

// ---------------------------------------------------------------------------
// Exported service function
// ---------------------------------------------------------------------------

export async function createFcs(ctx: ApiContext, body: FcsCreateBody): Promise<CreateFcsResponse> {
  const { supabase, adminSupabase, user } = ctx;
  await assertOrgAdmin(supabase, user.id, body.org_id);
  const [repoInfo, octokit] = await Promise.all([
    fetchRepoInfo(adminSupabase, body.repository_id, body.org_id),
    createGithubClient(adminSupabase, user.id),
  ]);
  const [validatedPRs, participants] = await Promise.all([
    validateMergedPRs(octokit, repoInfo.orgName, repoInfo.repoName, body.merged_pr_numbers),
    resolveParticipants(octokit, body.participants.map(p => p.github_username)),
  ]);
  const assessmentId = randomUUID();
  await createAssessmentRecord(adminSupabase, body, repoInfo, validatedPRs, assessmentId);
  await enrollParticipants(adminSupabase, assessmentId, body.org_id, participants);
  void triggerRubricGeneration({ adminSupabase, userId: user.id, assessmentId, repoInfo, prNumbers: body.merged_pr_numbers });
  return { assessment_id: assessmentId, status: 'rubric_generation', participant_count: participants.length };
}
