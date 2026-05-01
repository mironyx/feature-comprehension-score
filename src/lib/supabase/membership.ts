// Shared membership types and helpers used by pages that check org admin status.
// Issue: #121, #398, #408

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface MembershipRow {
  github_role: string;
}

export type OrgRole = 'admin' | 'repo_admin';

export function isOrgAdmin(rows: MembershipRow[]): boolean {
  return rows.length > 0 && rows[0]?.github_role === 'admin';
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
  const { data } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { github_role: string; admin_repo_github_ids: number[] };
  if (r.github_role === 'admin') return 'admin';
  if (r.admin_repo_github_ids.length > 0) return 'repo_admin';
  return null;
}

export async function isAdminOrRepoAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  return (await getOrgRole(supabase, userId, orgId)) !== null;
}
