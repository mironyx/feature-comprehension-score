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
import type { RepoCoords } from '@/lib/engine/ports/artefact-source';
import { generateRubric, type RubricObservability } from '@/lib/engine/pipeline';
import { buildLlmClient } from '@/lib/api/llm';
import type { Database, Json } from '@/lib/supabase/types';
import type { AssembledArtefactSet, LinkedIssue, RawArtefactSet } from '@/lib/engine/prompts/artefact-types';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { loadOrgRetrievalSettings } from '@/lib/supabase/org-retrieval-settings';
import { truncateArtefacts, buildTruncationOptions, estimateArtefactSetTokens } from '@/lib/engine/prompts/truncate';
import { getModelContextLimit, getConfiguredModelId } from '@/lib/openrouter/model-limits';
import { makeReadFileTool } from '@/lib/github/tools/read-file';
import { makeListDirectoryTool } from '@/lib/github/tools/list-directory';
import type { ToolCallEvent, ToolDefinition } from '@/lib/engine/llm/tools';
import type { LLMError, LLMErrorCode } from '@/lib/engine/llm/types';

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

// Story 19.1 (#287): merged_pr_numbers becomes optional; issue_numbers is added as optional.
// At least one of the two must be provided — enforced by `.refine()` so the 422 message is explicit.
export const FcsCreateBodySchema = z.object({
  org_id: z.uuid(),
  repository_id: z.uuid(),
  feature_name: z.string().min(1),
  feature_description: z.string().optional(),
  merged_pr_numbers: z.array(z.number().int().positive()).optional(),
  issue_numbers: z.array(z.number().int().positive()).optional(),
  participants: z.array(z.object({ github_username: z.string().min(1) })).min(1),
  comprehension_depth: z.enum(['conceptual', 'detailed']).default('conceptual'),
}).refine(
  (body) => (body.merged_pr_numbers?.length ?? 0) > 0 || (body.issue_numbers?.length ?? 0) > 0,
  { message: 'At least one of merged_pr_numbers or issue_numbers is required' },
);

export type FcsCreateBody = z.infer<typeof FcsCreateBodySchema>;
// FcsCreateInput is the subset of fields passed to createAssessmentRecord (LLD §2.4 constraint).
// Narrowed to only the fields the DB write needs, enforcing the design boundary.
export type FcsCreateInput = Pick<FcsCreateBody, 'org_id' | 'repository_id' | 'feature_name' | 'feature_description' | 'comprehension_depth'>;

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
  repoInfo: RepoInfo;
  prNumbers: number[];
  issueNumbers: number[];
  comprehensionDepth?: 'conceptual' | 'detailed';
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

// Story 19.1 (#287): validate each issue number exists and is not actually a PR.
// The GitHub REST `GET /issues/{n}` endpoint returns a `pull_request` field when
// the number refers to a PR — we reject that case with a guidance message.
// Issue #291: capture the issue title so it can be persisted in fcs_issue_sources.
async function validateIssues(octokit: Octokit, owner: string, repo: string, issueNumbers: number[]): Promise<ValidatedIssue[]> {
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
  validatedIssues: ValidatedIssue[];
  participants: ResolvedParticipant[];
}

async function createAssessmentWithParticipants(
  adminSupabase: ServiceClient,
  params: CreateAssessmentParams,
): Promise<AssessmentId> {
  const { body, repoInfo, validatedPRs, validatedIssues, participants } = params;
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
    p_config_comprehension_depth: body.comprehension_depth ?? 'conceptual',
    p_issue_sources: validatedIssues as unknown as Json,
  });
  if (error) {
    logger.error({ err: error }, 'createAssessmentWithParticipants: rpc failed');
    throw new ApiError(500, 'Failed to create assessment');
  }
  return assessmentId;
}

// Justification: logArtefactSummary extracted from finaliseRubric to log artefact metadata
// before the LLM call (#136). Not in LLD §2.4 — added for observability.
// E19.3 (#282): logs filePaths (capped to keep entries small) and issueCount for debuggability.
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

// Pipeline step names persisted to `assessments.rubric_progress`. Each value
// maps to a human-readable label on the client (see getProgressLabel).
// V2 Epic 18, Story 18.3. See docs/design/lld-e18.md §18.3.
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

// Justification: buildRubricTools and persistRubricFinalisation are extracted from
// finaliseRubric to keep it under the 20-line budget while adding tool-use + observability
// (§17.1e). Tools attach only when the org has opted in via `tool_use_enabled`; the loop
// degenerates to a single-shot call when the tool set is empty.
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

// Justification: helpers below (makeOnToolCall, logResponseReceived, failGeneration,
// runGeneration, buildFailureUpdate, toFailureDetails) are extracted from finaliseRubric +
// triggerRubricGeneration to keep both functions within CLAUDE.md's 20-line body budget.
// The LLD §18.1 shows the wiring inline (and names the err→LLMError converter `extractLlmError`);
// see PR #275 "Design deviations" for the reconciliation note picked up by /lld-sync.
// makeOnToolCall also drives the E18.3 llm_tool_call progress write (pushed into pendingWrites
// and drained by runGeneration before any branching).
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
  // Drain before any branching — otherwise a late-resolving `llm_tool_call` progress write
  // can overwrite the `null` progress that markRubricFailed sets on the failure path,
  // or the `rubric_parsing` progress on the success path. See lld-e18.md §18.3.
  await Promise.allSettled(pendingWrites);
  if (result.status === 'generation_failed') failGeneration(assessmentId, orgId, result.error);
  return result;
}

// Justification: finaliseRubric absorbs storeRubricQuestions (LLD §2.4) and the status
// transition into a single finalise_rubric RPC call as part of the #118 transactional refactor.
// Tool-use + observability wiring added for §17.1e (#246). Structured step logging + onToolCall
// wiring added for E18.1 (#272). Progress tracking via updateProgress added for E18.3 (#274).
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
  });
  logger.info({ assessmentId, orgId, step: 'rubric_persisted' }, 'pipeline: rubric persisted');
}

// Carries the LLMError + partial observability from finaliseRubric out to the
// triggerRubricGeneration catch block, so failure-path persistence can record
// what was learned before the failure. See lld-e18.md §18.1.
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

// Defence-in-depth: service-role client bypasses RLS, so every write must be scoped
// by `org_id` in addition to the primary key. See ADR-0025.
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

// Justification: extractArtefacts is not in the LLD §18.3 decomposition — extracted
// from triggerRubricGeneration's body to keep it under the 20-line budget. Collects PRs,
// explicit issue content, and org prompt context in parallel, then assembles the artefact
// set for rubric generation. Story 19.1 (#287): issue content from explicit issue_numbers
// is merged into `linked_issues`, deduplicated by title against issues discovered from
// PR bodies.
interface ExtractArtefactsParams {
  adminSupabase: ServiceClient;
  octokit: Octokit;
  repoInfo: RepoInfo;
  prNumbers: number[];
  issueNumbers: number[];
  comprehensionDepth: 'conceptual' | 'detailed';
}

async function extractArtefacts(params: ExtractArtefactsParams): Promise<{ assembled: AssembledArtefactSet; contextLimit: number; tokenBudget: number; rawTokens: number }> {
  const { adminSupabase, octokit, repoInfo, prNumbers, issueNumbers, comprehensionDepth } = params;
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
    loadOrgPromptContext(adminSupabase, repoInfo.orgId),
    loadOrgRetrievalSettings(adminSupabase, repoInfo.orgId),
  ]);
  const merged = mergeIssueContent(raw, issueContent);
  const contextLimit = await getModelContextLimit(getConfiguredModelId());
  const opts = buildTruncationOptions(contextLimit, repoInfo.questionCount, settings.tool_use_enabled);
  const rawTokens = estimateArtefactSetTokens(merged);
  const assembled = truncateArtefacts(merged, opts);
  return { assembled: { ...assembled, organisation_context, comprehension_depth: comprehensionDepth }, contextLimit, tokenBudget: opts.tokenBudget!, rawTokens };
}

// Story 19.2 (#288) + Epic 2 (#322): unions explicit PRs, PRs discovered from
// the provided issues, and PRs discovered from their child issues. The
// `providedIssueNumbers` argument is deliberately scoped to the originally-
// provided issues — child-issue PRs are already resolved by discoverChildIssues,
// so calling discoverLinkedPRs for them again would duplicate work.
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

// Justification: when only issue numbers are provided (no PRs), we still need a
// RawArtefactSet shape for downstream merging. Uses 'feature' artefact_type and a
// placeholder file listing so that the engine's RawArtefactSetSchema is respected.
function emptyRawArtefactSet(): RawArtefactSet {
  return {
    artefact_type: 'feature',
    pr_diff: '(no PRs provided)',
    file_listing: [{ path: '(none)', additions: 0, deletions: 0, status: 'none' }],
    file_contents: [],
  };
}

// Justification: not in §Story 19.1's call graph — extracted from extractArtefacts so the
// latter stays under the 20-line budget. Merges explicit issue content with whatever
// linked_issues were discovered from PR bodies, dedupes by title (matches mergeRawArtefacts).
function mergeIssueContent(raw: RawArtefactSet, issues: LinkedIssue[]): RawArtefactSet {
  const rawIssues = raw.linked_issues ?? [];
  if (issues.length === 0 && rawIssues.length === 0) return raw;
  // Key by #<number> when known; fall back to title for PR-body-discovered issues
  // that don't carry a number. Prevents distinct issues with the same title from
  // being merged (Epic 2, Invariant I6).
  const keyOf = (issue: LinkedIssue): string =>
    issue.number !== undefined ? `#${issue.number}` : issue.title;
  const byKey = new Map<string, LinkedIssue>();
  for (const issue of rawIssues) byKey.set(keyOf(issue), issue);
  for (const issue of issues) byKey.set(keyOf(issue), issue);
  return { ...raw, linked_issues: Array.from(byKey.values()) };
}

async function triggerRubricGeneration(params: RubricTriggerParams): Promise<void> {
  const { assessmentId } = params;
  const orgId = params.repoInfo.orgId;
  try {
    await updateProgress(params.adminSupabase, assessmentId, orgId, 'artefact_extraction');
    logger.info({ assessmentId, orgId, step: 'artefact_extraction' }, 'pipeline: extracting artefacts');
    const octokit = await createGithubClient(params.repoInfo.installationId);
    const { assembled: artefacts, contextLimit, tokenBudget, rawTokens } = await extractArtefacts({
      adminSupabase: params.adminSupabase,
      octokit,
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

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

interface AssessmentRetryRow {
  id: string;
  org_id: string;
  repository_id: string;
  status: string;
  config_question_count: number;
  config_comprehension_depth?: 'conceptual' | 'detailed' | null;
  rubric_retry_count: number;
  rubric_error_retryable?: boolean | null;
}

export const MAX_RUBRIC_RETRIES = 3;

// Justification: buildRetryResetUpdate is not in the LLD §18.2 internal decomposition —
// extracted from retriggerRubricForAssessment to keep that function under the 20-line
// budget (CLAUDE.md) and to isolate the pure payload construction from the I/O call.
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

// Resets a rubric_failed assessment to rubric_generation and re-runs generation
// against the already-stored PR and issue records. Called by the retry-rubric route.
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
  void triggerRubricGeneration({ adminSupabase, assessmentId, repoInfo, prNumbers, issueNumbers, comprehensionDepth: assessment.config_comprehension_depth ?? 'conceptual' });
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
  const prNumbers = body.merged_pr_numbers ?? [];
  const issueNumbers = body.issue_numbers ?? [];
  const [validatedPRs, participants, validatedIssues] = await Promise.all([
    prNumbers.length > 0 ? validateMergedPRs(octokit, repoInfo.orgName, repoInfo.repoName, prNumbers) : Promise.resolve([] as ValidatedPR[]),
    resolveParticipants(octokit, body.participants.map((p) => p.github_username)),
    issueNumbers.length > 0 ? validateIssues(octokit, repoInfo.orgName, repoInfo.repoName, issueNumbers) : Promise.resolve([] as ValidatedIssue[]),
  ]);
  const input: FcsCreateInput = body; // LLD §2.4 constraint: map body → FcsCreateInput before passing
  const assessmentId = await createAssessmentWithParticipants(adminSupabase, { body: input, repoInfo, validatedPRs, validatedIssues, participants });
  void triggerRubricGeneration({ adminSupabase, assessmentId, repoInfo, prNumbers, issueNumbers, comprehensionDepth: body.comprehension_depth });
  return { assessment_id: assessmentId, status: 'rubric_generation', participant_count: participants.length };
}
