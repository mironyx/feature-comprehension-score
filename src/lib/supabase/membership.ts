// Shared membership types and helpers used by pages that check org admin status.
// Issue: #121, #398

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface MembershipRow {
  github_role: string;
}

export function isOrgAdmin(rows: MembershipRow[]): boolean {
  return rows.length > 0 && rows[0]?.github_role === 'admin';
}

/**
 * Returns true iff the user is an Org Admin (github_role = 'admin')
 * or a Repo Admin (admin_repo_github_ids non-empty) for the given org.
 * Used by server-component page guards. API route guards use repo-admin-gate.ts.
 */
export async function isAdminOrRepoAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return false;
  const r = data as { github_role: string; admin_repo_github_ids: number[] };
  return r.github_role === 'admin' || r.admin_repo_github_ids.length > 0;
}
