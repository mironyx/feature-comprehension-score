// Service functions for POST + GET /api/projects.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3

import type { ApiContext } from '@/lib/api/context';
import type { CreateProjectInput } from './validation';
import type { ProjectResponse } from '@/types/projects';
import { ApiError } from '@/lib/api/errors';
import { assertOrgAdminOrRepoAdmin } from '@/lib/api/repo-admin-gate';

const UNIQUE_VIOLATION = '23505';

async function upsertContextFields(
  ctx: ApiContext,
  orgId: string,
  projectId: string,
  input: CreateProjectInput,
): Promise<void> {
  const context = {
    ...(input.glob_patterns !== undefined && { glob_patterns: input.glob_patterns }),
    ...(input.domain_notes !== undefined && { domain_notes: input.domain_notes }),
    ...(input.question_count !== undefined && { question_count: input.question_count }),
  };
  const { error } = await ctx.adminSupabase
    .from('organisation_contexts')
    .upsert({ org_id: orgId, project_id: projectId, context }, { onConflict: 'org_id,project_id' })
    .select('id')
    .single();
  if (error) throw new ApiError(500, `Failed to upsert organisation_contexts: ${error.message}`);
}

export async function createProject(
  ctx: ApiContext,
  input: CreateProjectInput,
): Promise<ProjectResponse> {
  await assertOrgAdminOrRepoAdmin(ctx, input.org_id);
  const { data, error } = await ctx.adminSupabase
    .from('projects')
    .insert({ org_id: input.org_id, name: input.name, description: input.description ?? null })
    .select('id, org_id, name, description, created_at, updated_at')
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) throw new ApiError(409, 'name_taken');
    throw new ApiError(500, `Failed to create project: ${error.message}`);
  }
  const project = data as ProjectResponse;
  const hasContext = input.glob_patterns !== undefined || input.domain_notes !== undefined || input.question_count !== undefined;
  if (hasContext) await upsertContextFields(ctx, input.org_id, project.id, input);
  return project;
}

export async function listProjects(
  ctx: ApiContext,
  orgId: string,
): Promise<ProjectResponse[]> {
  const { data: row, error: memberErr } = await ctx.supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (memberErr) throw new ApiError(500, `Failed to check membership: ${memberErr.message}`);
  if (!row) throw new ApiError(403, 'Not a member of this organisation');
  const r = row as { github_role: string; admin_repo_github_ids: number[] };
  if (r.github_role !== 'admin' && r.admin_repo_github_ids.length === 0)
    throw new ApiError(403, 'Org Admin or Repo Admin role required');
  const { data, error } = await ctx.supabase
    .from('projects')
    .select('id, org_id, name, description, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, `Failed to list projects: ${error.message}`);
  return (data ?? []) as ProjectResponse[];
}
