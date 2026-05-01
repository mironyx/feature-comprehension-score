// resolveUserOrgsViaApp — resolve the signed-in user's org memberships via the
// GitHub App installation token, not the user's OAuth provider token.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §5.2

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getInstallationToken as defaultGetInstallationToken } from '@/lib/github/app-auth';
import { listAdminReposForUser, type RegisteredRepo } from '@/lib/github/repo-admin-list';

type ServiceClient = SupabaseClient<Database>;
type UserOrganisation = Database['public']['Tables']['user_organisations']['Row'];
type OrganisationRow = Pick<
  Database['public']['Tables']['organisations']['Row'],
  'id' | 'github_org_id' | 'github_org_name' | 'installation_id'
>;

const GITHUB_API = 'https://api.github.com';

export interface ResolveUserOrgsInput {
  userId: string;
  githubUserId: number;
  githubLogin: string;
}

export interface ResolveUserOrgsDeps {
  getInstallationToken?: (installationId: number) => Promise<string>;
}

interface MatchedOrg {
  org: OrganisationRow;
  role: 'admin' | 'member';
  adminRepoGithubIds: number[];
}

async function fetchRegisteredRepos(
  serviceClient: ServiceClient,
  orgId: string,
): Promise<RegisteredRepo[]> {
  const { data, error } = await serviceClient
    .from('repositories')
    .select('github_repo_id, github_repo_name')
    .eq('org_id', orgId)
    .eq('status', 'active');
  if (error) throw new Error(`Failed to load repositories: ${error.message}`);
  return (data ?? []).map((r) => ({
    githubRepoId: r.github_repo_id,
    repoFullName: r.github_repo_name,
  }));
}

async function checkMembershipRole(
  org: OrganisationRow,
  githubLogin: string,
  getToken: (id: number) => Promise<string>,
): Promise<'admin' | 'member' | null> {
  const token = await getToken(org.installation_id);
  const resp = await fetch(
    `${GITHUB_API}/orgs/${org.github_org_name}/memberships/${githubLogin}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(
      `GitHub membership lookup failed: ${resp.status} for ${org.github_org_name}`,
    );
  }
  const body = (await resp.json()) as { role: 'admin' | 'member' };
  return body.role;
}

async function fetchMembershipRole(
  org: OrganisationRow,
  input: ResolveUserOrgsInput,
  repos: RegisteredRepo[],
  getToken: (id: number) => Promise<string>,
): Promise<MatchedOrg | null> {
  // Personal-account install: owner is always admin; skip membership + repo checks.
  if (org.github_org_id === input.githubUserId) {
    return { org, role: 'admin', adminRepoGithubIds: [] };
  }

  const role = await checkMembershipRole(org, input.githubLogin, getToken);
  if (!role) return null;

  const adminRepoGithubIds = await listAdminReposForUser(
    { installationId: org.installation_id, githubLogin: input.githubLogin, repos },
    { getInstallationToken: getToken },
  );

  return { org, role, adminRepoGithubIds };
}

async function matchOrgsForUser(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  getToken: (id: number) => Promise<string>,
): Promise<MatchedOrg[]> {
  const { data, error } = await serviceClient
    .from('organisations')
    .select('id, github_org_id, github_org_name, installation_id')
    .eq('status', 'active');
  if (error) throw new Error(`Failed to load organisations: ${error.message}`);
  const results = await Promise.all(
    (data ?? []).map(async (org) => {
      // Skip DB lookup for personal accounts — fetchMembershipRole short-circuits immediately.
      const repos = org.github_org_id === input.githubUserId
        ? []
        : await fetchRegisteredRepos(serviceClient, org.id);
      return fetchMembershipRole(org, input, repos, getToken);
    }),
  );
  return results.filter((r): r is MatchedOrg => r !== null);
}

function buildUpsertRows(input: ResolveUserOrgsInput, matches: MatchedOrg[]) {
  return matches.map(({ org, role, adminRepoGithubIds }) => ({
    user_id: input.userId,
    org_id: org.id,
    github_user_id: input.githubUserId,
    github_username: input.githubLogin,
    github_role: role,
    admin_repo_github_ids: adminRepoGithubIds,
  }));
}

async function upsertMemberships(
  serviceClient: ServiceClient,
  rows: ReturnType<typeof buildUpsertRows>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await serviceClient
    .from('user_organisations')
    .upsert(rows, { onConflict: 'user_id,org_id' });
  if (error) throw new Error(`Failed to upsert user_organisations: ${error.message}`);
}

async function deleteStaleMemberships(
  serviceClient: ServiceClient,
  userId: string,
  keepIds: string[],
): Promise<void> {
  const base = serviceClient.from('user_organisations').delete().eq('user_id', userId);
  const query = keepIds.length > 0 ? base.not('org_id', 'in', `(${keepIds.join(',')})`) : base;
  const { error } = await query;
  if (error) throw new Error(`Failed to delete stale memberships: ${error.message}`);
}

async function reloadUserOrgs(
  serviceClient: ServiceClient,
  userId: string,
): Promise<UserOrganisation[]> {
  const { data, error } = await serviceClient
    .from('user_organisations')
    .select('*')
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to reload user_organisations: ${error.message}`);
  return data ?? [];
}

async function writeUserOrgs(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  matches: MatchedOrg[],
): Promise<UserOrganisation[]> {
  const rows = buildUpsertRows(input, matches);
  await upsertMemberships(serviceClient, rows);
  await deleteStaleMemberships(serviceClient, input.userId, rows.map((r) => r.org_id));
  return reloadUserOrgs(serviceClient, input.userId);
}

/** Resolve and persist the signed-in user's org memberships via the App installation token. */
export async function resolveUserOrgsViaApp(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  deps: ResolveUserOrgsDeps = {},
): Promise<UserOrganisation[]> {
  const getToken = deps.getInstallationToken ?? defaultGetInstallationToken;
  const matches = await matchOrgsForUser(serviceClient, input, getToken);
  return writeUserOrgs(serviceClient, input, matches);
}
