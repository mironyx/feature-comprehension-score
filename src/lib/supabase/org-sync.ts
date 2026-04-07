// Org membership sync — called during auth callback after session is established.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { logger } from '@/lib/logger';

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
  return (await resp.json()) as unknown as T;
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
  //    Network failures or GitHub server errors here must not delete existing
  //    memberships — treat as transient and preserve the current state.
  let githubUser: GitHubUser;
  let githubOrgs: GitHubOrg[];
  try {
    [githubUser, githubOrgs] = await Promise.all([
      githubFetch<GitHubUser>(`${GITHUB_API}/user`, headers),
      githubFetch<GitHubOrg[]>(`${GITHUB_API}/user/orgs`, headers),
    ]);
    logger.info(
      {
        userId,
        githubLogin: githubUser.login,
        githubUserId: githubUser.id,
        githubOrgs: githubOrgs.map((o) => ({ id: o.id, login: o.login })),
        orgCount: githubOrgs.length,
      },
      'syncOrgMembership: fetched GitHub user/orgs',
    );
  } catch {
    logger.error('syncOrgMembership: failed to fetch GitHub user/orgs — preserving existing memberships');
    const { data: existing } = await serviceClient
      .from('user_organisations')
      .select('*')
      .eq('user_id', userId);
    return existing ?? [];
  }

  // 2. Find which of the user's accounts have our app installed.
  //    Include the user's own GitHub ID to catch personal account installations —
  //    /user/orgs only returns GitHub Organisations, never personal accounts.
  const githubAccountIds = [githubUser.id, ...githubOrgs.map((o) => o.id)];
  const installedOrgsResult = await serviceClient
    .from('organisations')
    .select('id, github_org_id, github_org_name')
    .in('github_org_id', githubAccountIds)
    .eq('status', 'active');

  // A DB error here must not trigger deletion — preserve existing rows.
  if (installedOrgsResult.error) {
    logger.error({ err: installedOrgsResult.error }, 'syncOrgMembership: DB query failed — preserving existing memberships');
    const { data: existing } = await serviceClient
      .from('user_organisations')
      .select('*')
      .eq('user_id', userId);
    return existing ?? [];
  }

  const installedOrgs = installedOrgsResult.data;

  logger.info(
    {
      userId,
      githubAccountIds,
      installedOrgs: installedOrgs.map((o) => ({
        id: o.id,
        github_org_id: o.github_org_id,
        github_org_name: o.github_org_name,
      })),
      matchCount: installedOrgs.length,
    },
    'syncOrgMembership: matched installed orgs',
  );

  if (installedOrgs.length === 0) {
    await serviceClient.from('user_organisations').delete().eq('user_id', userId);
    return [];
  }

  // 3. Fetch membership role for all installed accounts concurrently.
  //    Personal accounts (github_org_id === githubUser.id) have no org
  //    membership API — assign 'admin' (the installer owns the account) and skip the call.
  //    Distinguish 404 (confirmed non-member) from other errors (transient
  //    failures). On any transient error, abort and preserve existing rows
  //    rather than incorrectly deleting valid memberships.
  const membershipResults = await Promise.all(
    installedOrgs.map(async (org) => {
      if (org.github_org_id === githubUser.id) {
        return { org, membership: { role: 'admin' as const }, error: false };
      }
      const githubOrg = githubOrgs.find((o) => o.id === org.github_org_id);
      if (!githubOrg) return { org, membership: null, error: false };
      const resp = await fetch(
        `${GITHUB_API}/orgs/${githubOrg.login}/memberships/${githubUser.login}`,
        { headers },
      );
      if (resp.status === 404) return { org, membership: null, error: false };
      if (!resp.ok) return { org, membership: null, error: true };
      const membership = (await resp.json()) as unknown as GitHubMembership;
      return { org, membership, error: false };
    }),
  );

  // On any transient error, preserve existing rows — don't risk a false removal.
  if (membershipResults.some((r) => r.error)) {
    logger.error('syncOrgMembership: transient GitHub API error — preserving existing memberships');
    const { data: existing } = await serviceClient
      .from('user_organisations')
      .select('*')
      .eq('user_id', userId);
    return existing ?? [];
  }

  const upsertRows: Database['public']['Tables']['user_organisations']['Insert'][] =
    membershipResults
      .filter((r): r is typeof r & { membership: GitHubMembership } => r.membership !== null)
      .map(({ org, membership }) => ({
        user_id: userId,
        org_id: org.id,
        github_user_id: githubUser.id,
        github_username: githubUser.login,
        github_role: membership.role,
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
  if (currentOrgIds.length > 0) {
    await serviceClient
      .from('user_organisations')
      .delete()
      .eq('user_id', userId)
      .not('org_id', 'in', `(${currentOrgIds.join(',')})`);
  } else {
    await serviceClient.from('user_organisations').delete().eq('user_id', userId);
  }

  // 6. Return the up-to-date membership list.
  const { data: updated } = await serviceClient
    .from('user_organisations')
    .select('*')
    .eq('user_id', userId);

  return updated ?? [];
}
