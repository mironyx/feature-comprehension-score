// Rubric generation pipeline — orchestration layer shared by FCS create + retry-rubric.
// Lives in src/lib/api/ (not engine/) because it depends on supabase and github adapters.

import { randomUUID } from 'node:crypto';
import type { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { createGithubClient } from '@/lib/github/client';
import { GitHubArtefactSource } from '@/lib/github';
import type { RepoCoords } from '@/lib/engine/ports/artefact-source';
import { generateRubric, type RubricObservability } from '@/lib/engine/pipeline';
import { buildLlmClient } from '@/lib/api/llm';
import type { Database, Json } from '@/lib/supabase/types';
import type { AssembledArtefactSet, LinkedIssue, RawArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { loadProjectPromptContext } from '@/lib/supabase/project-prompt-context';
import { loadOrgRetrievalSettings } from '@/lib/supabase/org-retrieval-settings';
import { truncateArtefacts, buildTruncationOptions, estimateArtefactSetTokens } from '@/lib/engine/prompts/truncate';
import { getModelContextLimit, getConfiguredModelId } from '@/lib/openrouter/model-limits';
import { makeReadFileTool } from '@/lib/github/tools/read-file';
import { makeListDirectoryTool } from '@/lib/github/tools/list-directory';
import type { ToolCallEvent, ToolDefinition } from '@/lib/engine/llm/tools';
import type { LLMError, LLMErrorCode } from '@/lib/engine/llm/types';

type ServiceClient = SupabaseClient<Database>;

// Branded ID types — prevents accidental swaps between look-alike string arguments.
type OrgId = string & { readonly _brand: 'OrgId' };
type RepositoryId = string & { readonly _brand: 'RepositoryId' };
type AssessmentId = string & { readonly _brand: 'AssessmentId' };

// ---------------------------------------------------------------------------
// Public response contract
// ---------------------------------------------------------------------------

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

interface ValidatedIssue {
  issue_number: number;
  issue_title: string;
}

interface ResolvedParticipant {
  github_username: string;
  github_user_id: number;
}

interface RubricTriggerParams {
  adminSupabase: ServiceClient;
  assessmentId: AssessmentId;
  projectId: string;
  repoInfo: RepoInfo;
  prNumbers: number[];
  issueNumbers: number[];
  comprehensionDepth?: 'conceptual' | 'detailed';
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

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

export async function fetchRepoInfo(adminSupabase: ServiceClient, repositoryId: string, orgId: string): Promise<RepoInfo> {
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
  return toRepoInfo(validateRepo(repoResult, orgId as OrgId), validateCfg(cfgResult), orgId as OrgId);
}

export async function validateMergedPRs(octokit: Octokit, owner: string, repo: string, prNumbers: number[]): Promise<ValidatedPR[]> {
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

export async function validateIssues(octokit: Octokit, owner: string, repo: string, issueNumbers: number[]): Promise<ValidatedIssue[]> {
  return Promise.all(issueNumbers.map(async (issueNumber) => {
    try {
      const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
      if (data.pull_request) {
        throw new ApiError(422, `#${issueNumber} is a pull request, not an issue. Use merged_pr_numbers for PRs.`);
      }
      return { issue_number: issueNumber, issue_title: data.title };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.error({ err, issueNumber }, 'validateIssues: GitHub API error');
      throw new ApiError(422, `Issue #${issueNumber} not found`);
    }
  }));
}

export async function resolveParticipants(octokit: Octokit, usernames: string[]): Promise<ResolvedParticipant[]> {
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

interface AssessmentBody {
  repository_id: string;
  feature_name: string;
  feature_description?: string;
  comprehension_depth?: 'conceptual' | 'detailed';
}

interface CreateAssessmentParams {
  body: AssessmentBody;
  orgId: string;
  projectId: string;
  repoInfo: RepoInfo;
  validatedPRs: ValidatedPR[];
  validatedIssues: ValidatedIssue[];
  participants: ResolvedParticipant[];
}

export async function createAssessmentWithParticipants(
  adminSupabase: ServiceClient,
  params: CreateAssessmentParams,
): Promise<AssessmentId> {
  const { body, orgId, projectId, repoInfo, validatedPRs, validatedIssues, participants } = params;
  const assessmentId = randomUUID() as AssessmentId;
  const { error } = await adminSupabase.rpc('create_fcs_assessment', {
    p_id: assessmentId,
    p_org_id: orgId,
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
    p_config_comprehension_depth: body.comprehension_depth ?? 'conceptual',
    p_issue_sources: validatedIssues as unknown as Json,
    p_project_id: projectId,
  });
  if (error) {
    logger.error({ err: error }, 'createAssessmentWithParticipants: rpc failed');
    throw new ApiError(500, 'Failed to create assessment');
  }
  return assessmentId;
}

const FILE_PATHS_LOG_LIMIT = 50;

function logArtefactSummary(artefacts: AssembledArtefactSet, contextLimit: number, tokenBudget: number, rawTokens: number): void {
  const allPaths = artefacts.file_contents.map((f) => f.path);
  const truncated = allPaths.length > FILE_PATHS_LOG_LIMIT;
  const filePaths = truncated ? allPaths.slice(0, FILE_PATHS_LOG_LIMIT) : allPaths;
  const issueCount = artefacts.linked_issues?.length ?? 0;
  logger.info({
    fileCount: artefacts.file_contents.length,
    testFileCount: artefacts.test_files?.length ?? 0,
    artefactQuality: artefacts.artefact_quality,
    questionCount: artefacts.question_count,
    tokenBudgetApplied: artefacts.token_budget_applied,
    tokenBudget,
    contextLimit,
    rawTokens,
    assembledTokens: estimateArtefactSetTokens(artefacts),
    filePaths,
    ...(truncated && { filePaths_truncated: true }),
    ...(issueCount > 0 && { issueCount }),
    ...(artefacts.truncation_notes && { truncationNotes: artefacts.truncation_notes }),
  }, 'Rubric generation: artefact summary');
}

export type PipelineStep = 'artefact_extraction' | 'llm_request' | 'llm_tool_call' | 'rubric_parsing' | 'persisting';

export async function updateProgress(
  adminSupabase: ServiceClient,
  assessmentId: AssessmentId,
  orgId: OrgId,
  step: PipelineStep,
): Promise<void> {
  const { error } = await adminSupabase
    .from('assessments')
    .update({ rubric_progress: step, rubric_progress_updated_at: new Date().toISOString() })
    .eq('id', assessmentId)
    .eq('org_id', orgId);
  if (error) logger.warn({ err: error, assessmentId, step }, 'updateProgress: failed');
}

function buildRubricTools(
  octokit: Octokit,
  repoRef: { owner: string; repo: string },
  toolUseEnabled: boolean,
): readonly ToolDefinition[] {
  if (!toolUseEnabled) return [];
  return [makeReadFileTool(octokit, repoRef), makeListDirectoryTool(octokit, repoRef)];
}

interface RubricPersistParams {
  assessmentId: AssessmentId;
  orgId: OrgId;
  questions: unknown;
  observability: RubricObservability;
  tokenBudgetApplied: boolean;
  truncationNotes: string[] | undefined;
}

async function persistRubricFinalisation(
  adminSupabase: ServiceClient,
  params: RubricPersistParams,
): Promise<void> {
  const { error } = await adminSupabase.rpc('finalise_rubric', {
    p_assessment_id: params.assessmentId,
    p_org_id: params.orgId,
    p_questions: params.questions as Json,
    p_rubric_input_tokens: params.observability.inputTokens,
    p_rubric_output_tokens: params.observability.outputTokens,
    p_rubric_tool_call_count: params.observability.toolCalls.length,
    p_rubric_tool_calls: params.observability.toolCalls as unknown as Json,
    p_rubric_duration_ms: params.observability.durationMs,
    p_token_budget_applied: params.tokenBudgetApplied,
    p_truncation_notes: params.truncationNotes ? (params.truncationNotes as unknown as Json) : null,
  });
  if (error) throw new Error('Failed to finalise rubric');
}

interface FinaliseRubricParams {
  adminSupabase: ServiceClient;
  assessmentId: AssessmentId;
  orgId: OrgId;
  artefacts: AssembledArtefactSet;
  octokit: Octokit;
  repoRef: { owner: string; repo: string };
  contextLimit: number;
  tokenBudget: number;
  rawTokens: number;
}

function makeOnToolCall(
  adminSupabase: ServiceClient,
  assessmentId: AssessmentId,
  orgId: OrgId,
  toolUseEnabled: boolean,
  pendingWrites: Promise<void>[],
): (event: ToolCallEvent) => void {
  return (event) => {
    logger.info({ assessmentId, orgId, step: 'tool_call', ...event }, 'pipeline: tool call completed');
    if (toolUseEnabled) {
      pendingWrites.push(updateProgress(adminSupabase, assessmentId, orgId, 'llm_tool_call'));
    }
  };
}

function logResponseReceived(
  assessmentId: AssessmentId,
  orgId: OrgId,
  observability: RubricObservability,
): void {
  logger.info(
    {
      assessmentId,
      orgId,
      step: 'llm_response_received',
      inputTokens: observability.inputTokens,
      outputTokens: observability.outputTokens,
      toolCallCount: observability.toolCalls.length,
      durationMs: observability.durationMs,
    },
    'pipeline: llm response received',
  );
}

function failGeneration(assessmentId: AssessmentId, orgId: OrgId, error: LLMError): never {
  const level = error.code === 'malformed_response' ? 'warn' : 'error';
  const payload = { assessmentId, orgId, step: 'llm_request_sent', errorCode: error.code, errorMessage: error.message };
  if (level === 'warn') {
    logger.warn(payload, 'pipeline: malformed LLM response');
  } else {
    logger.error(payload, 'pipeline: rubric generation failed');
  }
  throw new RubricGenerationError(error);
}

async function runGeneration(
  params: FinaliseRubricParams,
  pendingWrites: Promise<void>[],
): Promise<Extract<Awaited<ReturnType<typeof generateRubric>>, { status: 'success' }>> {
  const { assessmentId, orgId } = params;
  const settings = await loadOrgRetrievalSettings(params.adminSupabase, orgId);
  const tools = buildRubricTools(params.octokit, params.repoRef, settings.tool_use_enabled);
  const bounds = { timeoutMs: settings.retrieval_timeout_seconds * 1000 };
  await updateProgress(params.adminSupabase, assessmentId, orgId, 'llm_request');
  logger.info({ assessmentId, orgId, step: 'llm_request_sent' }, 'pipeline: llm request sent');
  const result = await generateRubric({
    artefacts: params.artefacts,
    llmClient: buildLlmClient(logger),
    tools,
    bounds,
    onToolCall: makeOnToolCall(params.adminSupabase, assessmentId, orgId, settings.tool_use_enabled, pendingWrites),
  });
  await Promise.allSettled(pendingWrites);
  if (result.status === 'generation_failed') failGeneration(assessmentId, orgId, result.error);
  return result;
}

async function finaliseRubric(params: FinaliseRubricParams): Promise<void> {
  logArtefactSummary(params.artefacts, params.contextLimit, params.tokenBudget, params.rawTokens);
  const { assessmentId, orgId } = params;
  const pendingWrites: Promise<void>[] = [];
  const result = await runGeneration(params, pendingWrites);
  logResponseReceived(assessmentId, orgId, result.observability);
  await updateProgress(params.adminSupabase, assessmentId, orgId, 'rubric_parsing');
  logger.info({ assessmentId, orgId, step: 'rubric_parsing' }, 'pipeline: parsing rubric');
  await updateProgress(params.adminSupabase, assessmentId, orgId, 'persisting');
  await persistRubricFinalisation(params.adminSupabase, {
    assessmentId, orgId, questions: result.rubric.questions, observability: result.observability,
    tokenBudgetApplied: params.artefacts.token_budget_applied,
    truncationNotes: params.artefacts.truncation_notes,
  });
  logger.info({ assessmentId, orgId, step: 'rubric_persisted' }, 'pipeline: rubric persisted');
}

export class RubricGenerationError extends Error {
  constructor(
    readonly llmError: LLMError,
    readonly partialObservability?: Partial<RubricObservability>,
  ) {
    super(`Rubric generation failed: ${llmError.code}`);
    this.name = 'RubricGenerationError';
  }
}

interface RubricFailureDetails {
  errorCode: LLMErrorCode;
  errorMessage: string;
  errorRetryable: boolean;
  partialObservability?: Partial<RubricObservability>;
}

const ERROR_MESSAGE_MAX_CHARS = 1000;

function buildFailureUpdate(details?: RubricFailureDetails): Database['public']['Tables']['assessments']['Update'] {
  const update: Database['public']['Tables']['assessments']['Update'] = {
    status: 'rubric_failed',
    rubric_progress: null,
    rubric_progress_updated_at: null,
  };
  if (!details) return update;
  update.rubric_error_code = details.errorCode;
  update.rubric_error_message = details.errorMessage.slice(0, ERROR_MESSAGE_MAX_CHARS);
  update.rubric_error_retryable = details.errorRetryable;
  const obs = details.partialObservability;
  if (!obs) return update;
  if (obs.inputTokens !== undefined) update.rubric_input_tokens = obs.inputTokens;
  if (obs.outputTokens !== undefined) update.rubric_output_tokens = obs.outputTokens;
  if (obs.toolCalls !== undefined) {
    update.rubric_tool_call_count = obs.toolCalls.length;
    update.rubric_tool_calls = obs.toolCalls as unknown as Json;
  }
  if (obs.durationMs !== undefined) update.rubric_duration_ms = obs.durationMs;
  return update;
}

async function markRubricFailed(
  adminSupabase: ServiceClient,
  assessmentId: AssessmentId,
  orgId: OrgId,
  details?: RubricFailureDetails,
): Promise<void> {
  const { error } = await adminSupabase
    .from('assessments')
    .update(buildFailureUpdate(details))
    .eq('id', assessmentId)
    .eq('org_id', orgId);
  if (error) logger.error({ err: error, assessmentId, orgId }, 'markRubricFailed: update failed');
}

function toFailureDetails(err: unknown): RubricFailureDetails | undefined {
  if (!(err instanceof RubricGenerationError)) return undefined;
  return {
    errorCode: err.llmError.code,
    errorMessage: err.llmError.message,
    errorRetryable: err.llmError.retryable,
    partialObservability: err.partialObservability,
  };
}

interface ExtractArtefactsParams {
  adminSupabase: ServiceClient;
  octokit: Octokit;
  projectId: string;
  repoInfo: RepoInfo;
  prNumbers: number[];
  issueNumbers: number[];
  comprehensionDepth: 'conceptual' | 'detailed';
}

async function extractArtefacts(params: ExtractArtefactsParams): Promise<{ assembled: AssembledArtefactSet; contextLimit: number; tokenBudget: number; rawTokens: number }> {
  const { adminSupabase, octokit, projectId, repoInfo, prNumbers, issueNumbers, comprehensionDepth } = params;
  const coords: RepoCoords = { owner: repoInfo.orgName, repo: repoInfo.repoName };
  const source = new GitHubArtefactSource(octokit);
  const { childIssueNumbers, childIssuePrs } = issueNumbers.length > 0
    ? await source.discoverChildIssues({ ...coords, issueNumbers })
    : { childIssueNumbers: [], childIssuePrs: [] };
  const allIssueNumbers = Array.from(new Set([...issueNumbers, ...childIssueNumbers]));
  const mergedPrNumbers = await resolveMergedPrSet(source, coords, prNumbers, issueNumbers, childIssuePrs);
  const [raw, issueContent, organisation_context, settings] = await Promise.all([
    mergedPrNumbers.length > 0
      ? source.extractFromPRs({ ...coords, prNumbers: mergedPrNumbers })
      : emptyRawArtefactSet(),
    allIssueNumbers.length > 0
      ? source.fetchIssueContent({ ...coords, issueNumbers: allIssueNumbers })
      : Promise.resolve([] as LinkedIssue[]),
    loadProjectPromptContext(adminSupabase, projectId),
    loadOrgRetrievalSettings(adminSupabase, repoInfo.orgId),
  ]);
  const merged = mergeIssueContent(raw, issueContent);
  const contextLimit = await getModelContextLimit(getConfiguredModelId());
  const effectiveQuestionCount = organisation_context?.question_count ?? repoInfo.questionCount;
  const opts = buildTruncationOptions(contextLimit, effectiveQuestionCount, settings.tool_use_enabled);
  const rawTokens = estimateArtefactSetTokens(merged);
  const assembled = truncateArtefacts(merged, opts);
  return { assembled: { ...assembled, organisation_context, comprehension_depth: comprehensionDepth }, contextLimit, tokenBudget: opts.tokenBudget!, rawTokens };
}

async function resolveMergedPrSet(
  source: GitHubArtefactSource,
  coords: RepoCoords,
  explicitPrs: number[],
  providedIssueNumbers: number[],
  childIssuePrs: number[],
): Promise<number[]> {
  const discoveredPrs = providedIssueNumbers.length > 0
    ? await source.discoverLinkedPRs({ ...coords, issueNumbers: providedIssueNumbers })
    : [];
  const merged = Array.from(new Set([...explicitPrs, ...discoveredPrs, ...childIssuePrs]));
  if (discoveredPrs.length > 0 || childIssuePrs.length > 0) {
    logger.info({ explicitPrs, discoveredPrs, childIssuePrs, mergedPrs: merged }, 'extractArtefacts: linked PR discovery');
  }
  return merged;
}

function emptyRawArtefactSet(): RawArtefactSet {
  return {
    artefact_type: 'feature',
    pr_diff: '(no PRs provided)',
    file_listing: [{ path: '(none)', additions: 0, deletions: 0, status: 'none' }],
    file_contents: [],
  };
}

function mergeIssueContent(raw: RawArtefactSet, issues: LinkedIssue[]): RawArtefactSet {
  const rawIssues = raw.linked_issues ?? [];
  if (issues.length === 0 && rawIssues.length === 0) return raw;
  const keyOf = (issue: LinkedIssue): string =>
    issue.number !== undefined ? `#${issue.number}` : issue.title;
  const byKey = new Map<string, LinkedIssue>();
  for (const issue of rawIssues) byKey.set(keyOf(issue), issue);
  for (const issue of issues) byKey.set(keyOf(issue), issue);
  return { ...raw, linked_issues: Array.from(byKey.values()) };
}

export async function triggerRubricGeneration(params: RubricTriggerParams): Promise<void> {
  const { assessmentId } = params;
  const orgId = params.repoInfo.orgId;
  try {
    await updateProgress(params.adminSupabase, assessmentId, orgId, 'artefact_extraction');
    logger.info({ assessmentId, orgId, step: 'artefact_extraction' }, 'pipeline: extracting artefacts');
    const octokit = await createGithubClient(params.repoInfo.installationId);
    const { assembled: artefacts, contextLimit, tokenBudget, rawTokens } = await extractArtefacts({
      adminSupabase: params.adminSupabase,
      octokit,
      projectId: params.projectId,
      repoInfo: params.repoInfo,
      prNumbers: params.prNumbers,
      issueNumbers: params.issueNumbers,
      comprehensionDepth: params.comprehensionDepth ?? 'conceptual',
    });
    await finaliseRubric({
      adminSupabase: params.adminSupabase, assessmentId, orgId,
      artefacts, octokit, repoRef: { owner: params.repoInfo.orgName, repo: params.repoInfo.repoName }, contextLimit, tokenBudget, rawTokens,
    });
  } catch (err) {
    logger.error({ err, assessmentId, orgId }, 'triggerRubricGeneration: failed');
    await markRubricFailed(params.adminSupabase, assessmentId, orgId, toFailureDetails(err));
  }
}

interface AssessmentRetryRow {
  id: string;
  org_id: string;
  project_id: string;
  repository_id: string;
  status: string;
  config_question_count: number;
  config_comprehension_depth?: 'conceptual' | 'detailed' | null;
  rubric_retry_count: number;
  rubric_error_retryable?: boolean | null;
}

export const MAX_RUBRIC_RETRIES = 3;

function buildRetryResetUpdate(retryCount: number): Database['public']['Tables']['assessments']['Update'] {
  return {
    status: 'rubric_generation',
    rubric_retry_count: retryCount + 1,
    rubric_error_code: null,
    rubric_error_message: null,
    rubric_error_retryable: null,
    rubric_input_tokens: null,
    rubric_output_tokens: null,
    rubric_tool_call_count: null,
    rubric_tool_calls: null,
    rubric_duration_ms: null,
    rubric_progress: null,
    rubric_progress_updated_at: null,
  };
}

export async function retriggerRubricForAssessment(
  adminSupabase: ServiceClient,
  assessment: AssessmentRetryRow,
): Promise<void> {
  const assessmentId = assessment.id as AssessmentId;
  const orgId = assessment.org_id as OrgId;
  const repositoryId = assessment.repository_id as RepositoryId;
  const { error } = await adminSupabase
    .from('assessments')
    .update(buildRetryResetUpdate(assessment.rubric_retry_count))
    .eq('id', assessmentId)
    .eq('org_id', orgId);
  if (error) throw new ApiError(500, 'Failed to reset assessment status');
  const repoInfo = await fetchRepoInfo(adminSupabase, repositoryId, orgId);
  const [{ data: prs }, { data: issues }] = await Promise.all([
    adminSupabase.from('fcs_merged_prs').select('pr_number').eq('assessment_id', assessmentId).eq('org_id', orgId),
    adminSupabase.from('fcs_issue_sources').select('issue_number').eq('assessment_id', assessmentId).eq('org_id', orgId),
  ]);
  const prNumbers = (prs ?? []).map((p: { pr_number: number }) => p.pr_number);
  const issueNumbers = (issues ?? []).map((i: { issue_number: number }) => i.issue_number);
  void triggerRubricGeneration({ adminSupabase, assessmentId, projectId: assessment.project_id, repoInfo, prNumbers, issueNumbers, comprehensionDepth: assessment.config_comprehension_depth ?? 'conceptual' });
}

