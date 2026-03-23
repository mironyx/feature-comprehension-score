// Org membership sync — called during auth callback after session is established.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type UserOrganisation = Database['public']['Tables']['user_organisations']['Row'];

const GITHUB_API = 'https://api.github.com';

interface GitHubUser {
  id: number;
  login: string;
}

interface GitHubOrg {
  id: number;
  login: string;
}

interface GitHubMembership {
  role: 'admin' | 'member';
}

/** Fetches a GitHub API endpoint and throws on non-2xx responses. */
async function githubFetch<T>(url: string, headers: Record<string, string>): Promise<T> {
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status} for ${url}`);
  }
  return resp.json() as Promise<T>;
}

/**
 * Syncs the user's GitHub org memberships into `user_organisations`.
 *
 * - Fetches the user's orgs via the provider token.
 * - Matches against installed orgs in the `organisations` table.
 * - Upserts matching memberships (including updated roles).
 * - Removes stale memberships for orgs the user is no longer in (or that have
 *   no app installation).
 *
 * @param serviceClient Secret Supabase client — bypasses RLS.
 * @param userId        Supabase auth user ID.
 * @param providerToken GitHub OAuth provider token from the session.
 */
export async function syncOrgMembership(
  serviceClient: SupabaseClient<Database>,
  userId: string,
  providerToken: string,
): Promise<UserOrganisation[]> {
  const headers = {
    Authorization: `token ${providerToken}`,
    Accept: 'application/vnd.github+json',
  };

  // 1. Fetch user identity and org list in parallel — both are independent.
  const [githubUser, githubOrgs] = await Promise.all([
    githubFetch<GitHubUser>(`${GITHUB_API}/user`, headers),
    githubFetch<GitHubOrg[]>(`${GITHUB_API}/user/orgs`, headers),
  ]);

  // 2. Find which of the user's orgs have our app installed.
  const githubOrgIds = githubOrgs.map((o) => o.id);
  const { data: installedOrgs } = githubOrgIds.length > 0
    ? await serviceClient
        .from('organisations')
        .select('id, github_org_id, github_org_name')
        .in('github_org_id', githubOrgIds)
        .eq('status', 'active')
    : { data: [] };

  if (!installedOrgs || installedOrgs.length === 0) {
    await serviceClient.from('user_organisations').delete().eq('user_id', userId);
    return [];
  }

  // 3. Fetch membership role for all installed orgs concurrently.
  //    Distinguish 404 (confirmed non-member) from other errors (transient
  //    failures). On any transient error, abort and preserve existing rows
  //    rather than incorrectly deleting valid memberships.
  const membershipResults = await Promise.all(
    installedOrgs
      .map((org) => ({ org, githubOrg: githubOrgs.find((o) => o.id === org.github_org_id) }))
      .filter((e): e is { org: (typeof installedOrgs)[number]; githubOrg: GitHubOrg } =>
        e.githubOrg !== undefined,
      )
      .map(async ({ org, githubOrg }) => {
        const resp = await fetch(
          `${GITHUB_API}/orgs/${githubOrg.login}/memberships/${githubUser.login}`,
          { headers },
        );
        if (resp.status === 404) return { org, membership: null, error: false };
        if (!resp.ok) return { org, membership: null, error: true };
        const membership = (await resp.json()) as GitHubMembership;
        return { org, membership, error: false };
      }),
  );

  // On any transient error, preserve existing rows — don't risk a false removal.
  if (membershipResults.some((r) => r.error)) {
    console.error('syncOrgMembership: transient GitHub API error — preserving existing memberships');
    const { data: existing } = await serviceClient
      .from('user_organisations')
      .select('*')
      .eq('user_id', userId);
    return existing ?? [];
  }

  const upsertRows: Database['public']['Tables']['user_organisations']['Insert'][] =
    membershipResults
      .filter((r) => r.membership !== null)
      .map(({ org, membership }) => ({
        user_id: userId,
        org_id: org.id,
        github_user_id: githubUser.id,
        github_username: githubUser.login,
        github_role: membership!.role,
      }));

  // 4. Upsert confirmed memberships.
  if (upsertRows.length > 0) {
    await serviceClient
      .from('user_organisations')
      .upsert(upsertRows, { onConflict: 'user_id,org_id' });
  }

  // 5. Remove stale rows — orgs the user is no longer a member of or whose
  //    app installation was removed.
  const currentOrgIds = upsertRows.map((r) => r.org_id);
  const deleteQuery = serviceClient.from('user_organisations').delete().eq('user_id', userId);

  if (currentOrgIds.length > 0) {
    await deleteQuery.not('org_id', 'in', `(${currentOrgIds.join(',')})`);
  } else {
    await deleteQuery;
  }

  // 6. Return the up-to-date membership list.
  const { data: updated } = await serviceClient
    .from('user_organisations')
    .select('*')
    .eq('user_id', userId);

  return updated ?? [];
}
