// Gate helper for project-write authorisation. Reads the admin-repo snapshot
// from user_organisations — zero GitHub calls per request. ADR-0029 §2.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { isAdminOrRepoAdmin, readMembershipSnapshot, snapshotToOrgRole } from '@/lib/supabase/membership';

export interface RepoAdminSnapshot {
  githubRole: 'admin' | 'member';
  adminRepoGithubIds: number[];
}

/** Reads the snapshot from user_organisations. Returns null if no membership row exists. */
export async function readSnapshot(
  ctx: ApiContext,
  orgId: string,
): Promise<RepoAdminSnapshot | null> {
  try {
    const snap = await readMembershipSnapshot(ctx.supabase, ctx.user.id, orgId);
    if (!snap) return null;
    return { githubRole: snap.githubRole, adminRepoGithubIds: snap.adminRepoGithubIds };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(500, `Failed to read membership snapshot: ${msg}`);
  }
}

/** Returns true iff github_role = 'admin' OR admin_repo_github_ids is non-empty. */
export async function isOrgAdminOrRepoAdmin(ctx: ApiContext, orgId: string): Promise<boolean> {
  try {
    return await isAdminOrRepoAdmin(ctx.supabase, ctx.user.id, orgId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError(500, `Failed to read membership: ${msg}`);
  }
}

/** Throws ApiError(401) if no membership, ApiError(403) if insufficient permissions. Returns snapshot for callers that need it. */
export async function assertOrgAdminOrRepoAdmin(ctx: ApiContext, orgId: string): Promise<RepoAdminSnapshot> {
  const snapshot = await readSnapshot(ctx, orgId);
  if (!snapshot) throw new ApiError(401, 'No membership for this organisation');
  if (!snapshotToOrgRole(snapshot)) throw new ApiError(403, 'Org Admin or Repo Admin role required');
  return snapshot;
}

/** Throws ApiError(401) if no membership, ApiError(403) unless github_role = 'admin'. */
export async function assertOrgAdmin(ctx: ApiContext, orgId: string): Promise<void> {
  const snapshot = await readSnapshot(ctx, orgId);
  if (!snapshot) throw new ApiError(401, 'No membership for this organisation');
  if (snapshot.githubRole !== 'admin') throw new ApiError(403, 'Org Admin role required');
}
