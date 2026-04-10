// resolveUserOrgsViaApp — resolve the signed-in user's org memberships via the
// GitHub App installation token, not the user's OAuth provider token.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §5.2

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getInstallationToken as defaultGetInstallationToken } from '@/lib/github/app-auth';

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
  fetchImpl?: typeof fetch;
}

interface MatchedOrg {
  org: OrganisationRow;
  role: 'admin' | 'member';
}

async function fetchMembershipRole(
  org: OrganisationRow,
  input: ResolveUserOrgsInput,
  getToken: (id: number) => Promise<string>,
  fetchImpl: typeof fetch,
): Promise<MatchedOrg | null> {
  if (org.github_org_id === input.githubUserId) {
    return { org, role: 'admin' };
  }
  const token = await getToken(org.installation_id);
  const resp = await fetchImpl(
    `${GITHUB_API}/orgs/${org.github_org_name}/memberships/${input.githubLogin}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`GitHub membership lookup failed: ${resp.status} for ${org.github_org_name}`);
  }
  const body = (await resp.json()) as { role: 'admin' | 'member' };
  return { org, role: body.role };
}

async function matchOrgsForUser(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  deps: Required<ResolveUserOrgsDeps>,
): Promise<MatchedOrg[]> {
  const { data, error } = await serviceClient
    .from('organisations')
    .select('id, github_org_id, github_org_name, installation_id')
    .eq('status', 'active');
  if (error) throw new Error(`Failed to load organisations: ${error.message}`);
  const results = await Promise.all(
    (data ?? []).map((org) => fetchMembershipRole(org, input, deps.getInstallationToken, deps.fetchImpl)),
  );
  return results.filter((r): r is MatchedOrg => r !== null);
}

function buildUpsertRows(input: ResolveUserOrgsInput, matches: MatchedOrg[]) {
  return matches.map(({ org, role }) => ({
    user_id: input.userId,
    org_id: org.id,
    github_user_id: input.githubUserId,
    github_username: input.githubLogin,
    github_role: role,
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

async function findFirstInstallAsInstaller(
  serviceClient: ServiceClient,
  githubUserId: number,
): Promise<MatchedOrg | null> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: orgs, error } = await serviceClient
    .from('organisations')
    .select('id, github_org_id, github_org_name, installation_id')
    .eq('installer_github_user_id', githubUserId)
    .gte('created_at', fiveMinutesAgo)
    .eq('status', 'active');
  // DB error is non-fatal here — the race fallback is best-effort; the caller
  // already persists empty memberships and emits no_access telemetry.
  if (error || !orgs || orgs.length === 0) return null;

  const org = orgs[0]!;
  const { count } = await serviceClient
    .from('user_organisations')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org.id);
  if (count && count > 0) return null;
  return { org, role: 'admin' };
}

/** Resolve and persist the signed-in user's org memberships via the App installation token. */
export async function resolveUserOrgsViaApp(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  deps: ResolveUserOrgsDeps = {},
  opts: { firstInstallFallback?: boolean } = {},
): Promise<UserOrganisation[]> {
  const resolved: Required<ResolveUserOrgsDeps> = {
    getInstallationToken: deps.getInstallationToken ?? defaultGetInstallationToken,
    fetchImpl: deps.fetchImpl ?? fetch,
  };
  let matches = await matchOrgsForUser(serviceClient, input, resolved);
  if (matches.length === 0 && opts.firstInstallFallback) {
    const fallback = await findFirstInstallAsInstaller(serviceClient, input.githubUserId);
    if (fallback) matches = [fallback];
  }
  return writeUserOrgs(serviceClient, input, matches);
}
