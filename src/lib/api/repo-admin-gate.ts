// Gate helper for project-write authorisation. Reads the admin-repo snapshot
// from user_organisations — zero GitHub calls per request. ADR-0029 §2.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';

export interface RepoAdminSnapshot {
  githubRole: 'admin' | 'member';
  adminRepoGithubIds: number[];
}

/** Reads the snapshot from user_organisations. Returns null if no membership row exists. */
export async function readSnapshot(
  ctx: ApiContext,
  orgId: string,
): Promise<RepoAdminSnapshot | null> {
  const { data, error } = await ctx.supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error) throw new ApiError(500, `Failed to read membership snapshot: ${error.message}`);
  if (!data) return null;
  return {
    githubRole: data.github_role as 'admin' | 'member',
    adminRepoGithubIds: (data.admin_repo_github_ids ?? []) as number[],
  };
}

/** Returns true iff github_role = 'admin' OR admin_repo_github_ids is non-empty. */
export async function isOrgAdminOrRepoAdmin(ctx: ApiContext, orgId: string): Promise<boolean> {
  const snapshot = await readSnapshot(ctx, orgId);
  if (!snapshot) return false;
  return snapshot.githubRole === 'admin' || snapshot.adminRepoGithubIds.length > 0;
}

/** Throws ApiError(401) if no membership, ApiError(403) if insufficient permissions. */
export async function assertOrgAdminOrRepoAdmin(ctx: ApiContext, orgId: string): Promise<void> {
  const snapshot = await readSnapshot(ctx, orgId);
  if (!snapshot) throw new ApiError(401, 'No membership for this organisation');
  if (snapshot.githubRole !== 'admin' && snapshot.adminRepoGithubIds.length === 0) {
    throw new ApiError(403, 'Org Admin or Repo Admin role required');
  }
}

/** Throws ApiError(401) if no membership, ApiError(403) unless github_role = 'admin'. */
export async function assertOrgAdmin(ctx: ApiContext, orgId: string): Promise<void> {
  const snapshot = await readSnapshot(ctx, orgId);
  if (!snapshot) throw new ApiError(401, 'No membership for this organisation');
  if (snapshot.githubRole !== 'admin') throw new ApiError(403, 'Org Admin role required');
}
