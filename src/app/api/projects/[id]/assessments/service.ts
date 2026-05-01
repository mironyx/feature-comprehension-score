// POST /api/projects/[id]/assessments — FCS assessment creation service.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.2

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin, readSnapshot } from '@/lib/api/repo-admin-gate';
import { createGithubClient } from '@/lib/github/client';
import {
  fetchRepoInfo,
  validateMergedPRs,
  validateIssues,
  resolveParticipants,
  createAssessmentWithParticipants,
  triggerRubricGeneration,
  type CreateFcsResponse,
} from '@/lib/api/fcs-pipeline';
import type { CreateFcsBody } from './validation';

export type { CreateFcsResponse };

async function assertProjectInSelectedOrg(ctx: ApiContext, projectId: string): Promise<void> {
  const { data } = await ctx.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('org_id', ctx.orgId!)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Project not found');
}

async function enforcePerRepoAdmin(ctx: ApiContext, repositoryId: string): Promise<void> {
  const snapshot = await readSnapshot(ctx, ctx.orgId!);
  if (!snapshot) throw new ApiError(401, 'No membership for this organisation');
  if (snapshot.githubRole === 'admin') return;
  const { data: repo } = await ctx.adminSupabase
    .from('repositories')
    .select('github_repo_id')
    .eq('id', repositoryId)
    .eq('org_id', ctx.orgId!)
    .maybeSingle();
  if (!repo) throw new ApiError(422, 'repo_not_in_org');
  if (!snapshot.adminRepoGithubIds.includes(repo.github_repo_id)) {
    throw new ApiError(403, 'repo_admin_required');
  }
}

export async function createFcsForProject(
  ctx: ApiContext,
  projectId: string,
  body: CreateFcsBody,
): Promise<CreateFcsResponse> {
  if (!ctx.orgId) throw new ApiError(401, 'no_org_selected');
  await assertOrgAdminOrRepoAdmin(ctx, ctx.orgId);
  await assertProjectInSelectedOrg(ctx, projectId);
  await enforcePerRepoAdmin(ctx, body.repository_id);
  const repoInfo = await fetchRepoInfo(ctx.adminSupabase, body.repository_id, ctx.orgId);
  const octokit = await createGithubClient(repoInfo.installationId);
  const prNumbers = body.merged_pr_numbers ?? [];
  const issueNumbers = body.issue_numbers ?? [];
  const [validatedPRs, participants, validatedIssues] = await Promise.all([
    prNumbers.length > 0 ? validateMergedPRs(octokit, repoInfo.orgName, repoInfo.repoName, prNumbers) : Promise.resolve([]),
    resolveParticipants(octokit, body.participants.map((p) => p.github_username)),
    issueNumbers.length > 0 ? validateIssues(octokit, repoInfo.orgName, repoInfo.repoName, issueNumbers) : Promise.resolve([]),
  ]);
  const assessmentId = await createAssessmentWithParticipants(ctx.adminSupabase, {
    body, orgId: ctx.orgId, projectId, repoInfo, validatedPRs, validatedIssues, participants,
  });
  void triggerRubricGeneration({ adminSupabase: ctx.adminSupabase, assessmentId, repoInfo, prNumbers, issueNumbers, comprehensionDepth: body.comprehension_depth });
  return { assessment_id: assessmentId, status: 'rubric_generation', participant_count: participants.length };
}
