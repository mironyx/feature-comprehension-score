// Service layer for GET/PATCH/DELETE /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin } from '@/lib/api/repo-admin-gate';
import type { UpdateProjectInput } from '@/app/api/projects/validation';
import type { ProjectResponse } from '@/types/projects';
import type { Json } from '@/lib/supabase/types';

type MembershipRow = { org_id: string; github_role: string; admin_repo_github_ids: number[] };

// Justification: shared by updateProject and deleteProject (2 callers) — extracted to keep both under cc limit.
async function fetchMemberships(ctx: ApiContext): Promise<MembershipRow[]> {
  const { data, error } = await ctx.supabase
    .from('user_organisations')
    .select('org_id, github_role, admin_repo_github_ids')
    .eq('user_id', ctx.user.id);
  if (error) throw new ApiError(500, `Failed to check memberships: ${error.message}`);
  if (!data?.length) throw new ApiError(401, 'no_membership');
  return data as MembershipRow[];
}

// Justification: used only by getProject — provides the project row + org_id for the gate check.
async function resolveProject(ctx: ApiContext, projectId: string): Promise<ProjectResponse> {
  const { data, error } = await ctx.supabase
    .from('projects')
    .select('id, org_id, name, description, created_at, updated_at')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new ApiError(500, `Failed to resolve project: ${error.message}`);
  if (!data) throw new ApiError(404, 'project_not_found');
  return data as ProjectResponse;
}

export async function getProject(ctx: ApiContext, projectId: string): Promise<ProjectResponse> {
  const project = await resolveProject(ctx, projectId);
  await assertOrgAdminOrRepoAdmin(ctx, project.org_id);
  return project;
}

export async function updateProject(
  ctx: ApiContext,
  projectId: string,
  patch: UpdateProjectInput,
): Promise<ProjectResponse> {
  const { name, description, glob_patterns, domain_notes, question_count } = patch;

  const memberships = await fetchMemberships(ctx);
  const authorisedOrgIds = memberships
    .filter(m => m.github_role === 'admin' || m.admin_repo_github_ids.length > 0)
    .map(m => m.org_id);
  if (!authorisedOrgIds.length) throw new ApiError(403, 'forbidden');

  const pf = Object.fromEntries(
    [['name', name], ['description', description]].filter(([, v]) => v !== undefined),
  );
  const cf = Object.fromEntries(
    [['glob_patterns', glob_patterns], ['domain_notes', domain_notes], ['question_count', question_count]]
      .filter(([, v]) => v !== undefined),
  );

  const { data, error } = await ctx.adminSupabase.rpc('patch_project', {
    p_project_id: projectId,
    p_org_ids: authorisedOrgIds,
    p_project_fields: Object.keys(pf).length ? (pf as Json) : null,
    p_context_fields: Object.keys(cf).length ? (cf as Json) : null,
  });
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'name_taken');
    if (error.message === 'project_not_found') throw new ApiError(404, 'project_not_found');
    throw new ApiError(500, `Failed to update project: ${error.message}`);
  }

  return data as ProjectResponse;
}

export async function deleteProject(ctx: ApiContext, projectId: string): Promise<void> {
  const memberships = await fetchMemberships(ctx);
  const adminOrgIds = memberships.filter(m => m.github_role === 'admin').map(m => m.org_id);
  if (!adminOrgIds.length) throw new ApiError(403, 'forbidden');

  const { data: hit, error: hitError } = await ctx.supabase
    .from('assessments')
    .select('id')
    .eq('project_id', projectId)
    .limit(1)
    .maybeSingle();
  if (hitError) throw new ApiError(500, `Failed to check assessments: ${hitError.message}`);
  if (hit) throw new ApiError(409, 'project_not_empty');

  const { data: deleted, error } = await ctx.adminSupabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .in('org_id', adminOrgIds)
    .select('id');
  if (error) throw new ApiError(500, `Failed to delete project: ${error.message}`);
  if (!deleted?.length) throw new ApiError(404, 'project_not_found');
}
