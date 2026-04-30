// Service layer for GET/PATCH/DELETE /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin, assertOrgAdmin } from '@/lib/api/repo-admin-gate';
import type { UpdateProjectInput } from '@/app/api/projects/validation';
import type { ProjectResponse } from '@/types/projects';
import type { Json } from '@/lib/supabase/types';

type ProjectPatch = { name?: string; description?: string };
type ContextPatch = { glob_patterns?: string[]; domain_notes?: string; question_count?: number };

function partitionPatch(patch: UpdateProjectInput): [ProjectPatch, ContextPatch] {
  const { name, description, glob_patterns, domain_notes, question_count } = patch;
  const pf: ProjectPatch = {};
  const cf: ContextPatch = {};
  if (name !== undefined) pf.name = name;
  if (description !== undefined) pf.description = description;
  if (glob_patterns !== undefined) cf.glob_patterns = glob_patterns;
  if (domain_notes !== undefined) cf.domain_notes = domain_notes;
  if (question_count !== undefined) cf.question_count = question_count;
  return [pf, cf];
}

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

async function applyProjectFields(
  ctx: ApiContext,
  projectId: string,
  fields: ProjectPatch,
): Promise<ProjectResponse> {
  const { data, error } = await ctx.adminSupabase
    .from('projects')
    .update(fields)
    .eq('id', projectId)
    .select()
    .single();
  if (error?.code === '23505') throw new ApiError(409, 'name_taken');
  if (error) throw new ApiError(500, `Failed to update project: ${error.message}`);
  return data as ProjectResponse;
}

async function mergeContext(
  ctx: ApiContext,
  orgId: string,
  projectId: string,
  cf: ContextPatch,
): Promise<void> {
  const { data: existing, error: selectError } = await ctx.supabase
    .from('organisation_contexts')
    .select('context')
    .eq('org_id', orgId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (selectError) throw new ApiError(500, `Failed to read context: ${selectError.message}`);
  const existingCtx = (existing as { context?: Record<string, unknown> } | null)?.context ?? {};
  const merged = { ...existingCtx, ...cf } as Json;
  const { error } = await ctx.adminSupabase
    .from('organisation_contexts')
    .upsert({ org_id: orgId, project_id: projectId, context: merged });
  if (error) throw new ApiError(500, `Failed to upsert context: ${error.message}`);
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
  const project = await resolveProject(ctx, projectId);
  await assertOrgAdminOrRepoAdmin(ctx, project.org_id);
  const [pf, cf] = partitionPatch(patch);
  let result = project;
  if (Object.keys(pf).length > 0) result = await applyProjectFields(ctx, projectId, pf);
  if (Object.keys(cf).length > 0) await mergeContext(ctx, project.org_id, projectId, cf);
  return result;
}

export async function deleteProject(ctx: ApiContext, projectId: string): Promise<void> {
  const project = await resolveProject(ctx, projectId);
  await assertOrgAdmin(ctx, project.org_id);
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
    .select();
  if (error) throw new ApiError(500, `Failed to delete project: ${error.message}`);
  if (!deleted || (deleted as unknown[]).length === 0) throw new ApiError(404, 'project_not_found');
}
