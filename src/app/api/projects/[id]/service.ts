// Service layer for GET/PATCH/DELETE /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin } from '@/lib/api/repo-admin-gate';
import type { UpdateProjectInput } from '@/app/api/projects/validation';
import type { ProjectResponse } from '@/types/projects';
import type { Json } from '@/lib/supabase/types';

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

async function requireOrgMembership(
  ctx: ApiContext,
  role: 'admin' | 'admin_or_repo_admin',
): Promise<string> {
  if (!ctx.orgId) throw new ApiError(403, 'no_org_selected');
  const { data, error } = await ctx.supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('user_id', ctx.user.id)
    .eq('org_id', ctx.orgId)
    .maybeSingle();
  if (error) throw new ApiError(500, `Failed to check membership: ${error.message}`);
  if (!data) throw new ApiError(403, 'forbidden');
  const isAdmin = data.github_role === 'admin';
  const isRepoAdmin = (data.admin_repo_github_ids as number[]).length > 0;
  if (role === 'admin' && !isAdmin) throw new ApiError(403, 'forbidden');
  if (role === 'admin_or_repo_admin' && !isAdmin && !isRepoAdmin) throw new ApiError(403, 'forbidden');
  return ctx.orgId;
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
  const orgId = await requireOrgMembership(ctx, 'admin_or_repo_admin');

  const pf = Object.fromEntries(
    [['name', name], ['description', description]].filter(([, v]) => v !== undefined),
  );
  const cf = Object.fromEntries(
    [['glob_patterns', glob_patterns], ['domain_notes', domain_notes], ['question_count', question_count]]
      .filter(([, v]) => v !== undefined),
  );

  const { data, error } = await ctx.adminSupabase.rpc('patch_project', {
    p_project_id: projectId,
    p_org_id: orgId,
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
  const orgId = await requireOrgMembership(ctx, 'admin');

  const { count, error } = await ctx.adminSupabase
    .from('projects')
    .delete({ count: 'exact' })
    .eq('id', projectId)
    .eq('org_id', orgId);
  if (error) throw new ApiError(500, `Failed to delete project: ${error.message}`);
  if (!count) throw new ApiError(404, 'project_not_found');
}
