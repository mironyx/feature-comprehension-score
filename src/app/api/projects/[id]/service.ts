// Service layer for GET/PATCH/DELETE /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin, assertOrgAdmin } from '@/lib/api/repo-admin-gate';
import type { UpdateProjectInput } from '@/app/api/projects/validation';
import type { ProjectResponse } from '@/types/projects';
import type { Json } from '@/lib/supabase/types';

async function resolveProject(ctx: ApiContext, projectId: string): Promise<ProjectResponse> {
  const { data, error } = await ctx.supabase
    .from('projects')
    .select('*')
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
  const project = await resolveProject(ctx, projectId);
  await assertOrgAdminOrRepoAdmin(ctx, project.org_id);

  let result = project;
  const pf: { name?: string; description?: string } = {};
  if (name !== undefined) pf.name = name;
  if (description !== undefined) pf.description = description;
  if (Object.keys(pf).length > 0) {
    const { data, error } = await ctx.adminSupabase
      .from('projects').update(pf).eq('id', projectId).select().single();
    if (error?.code === '23505') throw new ApiError(409, 'name_taken');
    if (error) throw new ApiError(500, `Failed to update project: ${error.message}`);
    result = data as ProjectResponse;
  }

  const cf: Record<string, unknown> = {};
  if (glob_patterns !== undefined) cf.glob_patterns = glob_patterns;
  if (domain_notes !== undefined) cf.domain_notes = domain_notes;
  if (question_count !== undefined) cf.question_count = question_count;
  if (Object.keys(cf).length > 0) {
    // Read before write: Supabase upsert replaces the whole jsonb column; we must
    // merge manually to preserve keys not present in this patch (Invariant I7).
    const { data: existing, error: se } = await ctx.supabase
      .from('organisation_contexts').select('context')
      .eq('org_id', project.org_id).eq('project_id', projectId).maybeSingle();
    if (se) throw new ApiError(500, `Failed to read context: ${se.message}`);
    const merged = { ...(existing as { context?: Record<string, unknown> } | null)?.context, ...cf } as Json;
    const { error: ue } = await ctx.adminSupabase
      .from('organisation_contexts')
      .upsert({ org_id: project.org_id, project_id: projectId, context: merged });
    if (ue) throw new ApiError(500, `Failed to upsert context: ${ue.message}`);
  }
  return result;
}

export async function deleteProject(ctx: ApiContext, projectId: string): Promise<void> {
  const project = await resolveProject(ctx, projectId);
  await assertOrgAdmin(ctx, project.org_id);
  const { data: hit, error: hitError } = await ctx.supabase
    .from('assessments').select('id').eq('project_id', projectId).limit(1).maybeSingle();
  if (hitError) throw new ApiError(500, `Failed to check assessments: ${hitError.message}`);
  if (hit) throw new ApiError(409, 'project_not_empty');
  const { data: deleted, error } = await ctx.adminSupabase
    .from('projects').delete().eq('id', projectId).select();
  if (error) throw new ApiError(500, `Failed to delete project: ${error.message}`);
  if (!deleted?.length) throw new ApiError(404, 'project_not_found');
}
