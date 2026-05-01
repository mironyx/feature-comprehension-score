// Shared membership types and helpers used by pages that check org admin status.
// Issue: #121, #398, #408, #417

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface MembershipRow {
  github_role: string;
}

export type OrgRole = 'admin' | 'repo_admin';

export interface MembershipSnapshot {
  githubRole: string;
  adminRepoGithubIds: number[];
}

export function isOrgAdmin(rows: MembershipRow[]): boolean {
  return rows.length > 0 && rows[0]?.github_role === 'admin';
}

/**
 * Shared core: queries user_organisations once and normalises the result.
 * Throws Error on DB failure. Both API and page surfaces delegate to this.
 */
export async function readMembershipSnapshot(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<MembershipSnapshot | null> {
  const { data, error } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as { github_role: string; admin_repo_github_ids: number[] };
  return { githubRole: r.github_role, adminRepoGithubIds: r.admin_repo_github_ids ?? [] };
}

/** Pure role derivation — the single place that encodes the admin-or-repo-admin rule. */
export function snapshotToOrgRole(snap: MembershipSnapshot): OrgRole | null {
  if (snap.githubRole === 'admin') return 'admin';
  if (snap.adminRepoGithubIds.length > 0) return 'repo_admin';
  return null;
}

/**
 * Returns the effective role for the user in the org, or null if not a member
 * or lacks admin/repo-admin privileges. Used by server-component page guards.
 * API route guards use repo-admin-gate.ts.
 */
export async function getOrgRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<OrgRole | null> {
  const snap = await readMembershipSnapshot(supabase, userId, orgId);
  return snap ? snapshotToOrgRole(snap) : null;
}

export async function isAdminOrRepoAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  return (await getOrgRole(supabase, userId, orgId)) !== null;
}
