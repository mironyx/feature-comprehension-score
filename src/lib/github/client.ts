// GitHub client factory — builds an authenticated Octokit from the user's stored vault token.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 (implementation note, issue #59)

import { Octokit } from '@octokit/rest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ApiError } from '@/lib/api/errors';

type ServiceClient = SupabaseClient<Database>;

/** Build an authenticated Octokit instance from the user's GitHub token stored in Supabase Vault. */
export async function createGithubClient(adminSupabase: ServiceClient, userId: string): Promise<Octokit> {
  const { data: token, error } = await adminSupabase.rpc('get_github_token', { p_user_id: userId });
  if (error) {
    console.error('createGithubClient: get_github_token failed:', error);
    throw new ApiError(500, 'Internal server error');
  }
  if (!token) throw new ApiError(401, 'GitHub account not connected');
  return new Octokit({ auth: token });
}
