// GET /api/organisations/[id]/repositories — registered + accessible repos service.
// Design reference: docs/design/lld-v8-repository-management.md §T1
// Issue: #365

import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import { getInstallationToken as defaultGetInstallationToken } from '@/lib/github/app-auth';

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export interface RegisteredRepo {
  id: string;
  github_repo_id: number;
  github_repo_name: string;
  status: 'active';
  created_at: string;
}

export interface AccessibleRepo {
  github_repo_id: number;
  github_repo_name: string;
  is_registered: boolean;
}

export interface RepositoryListResponse {
  registered: RegisteredRepo[];
  accessible: AccessibleRepo[];
}

export interface ListRepositoriesDeps {
  getInstallationToken?: (installationId: number) => Promise<string>;
  fetchImpl?: typeof fetch;
}

export { ApiError };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type UserClient = ApiContext['supabase'];
type AdminClient = ApiContext['adminSupabase'];

async function assertOrgAdmin(supabase: UserClient, userId: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new ApiError(500, `assertOrgAdmin: ${error.message}`);
  if (data?.github_role !== 'admin') throw new ApiError(403, 'Forbidden');
}

async function loadRegistered(admin: AdminClient, orgId: string): Promise<RegisteredRepo[]> {
  const { data, error } = await admin
    .from('repositories')
    .select('id, github_repo_id, github_repo_name, status, created_at')
    .eq('org_id', orgId)
    .eq('status', 'active');
  if (error) throw new ApiError(500, `loadRegistered: ${error.message}`);
  return (data ?? []) as unknown as RegisteredRepo[];
}

async function loadInstallationId(admin: AdminClient, orgId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('organisations')
    .select('installation_id')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw new ApiError(500, `loadInstallationId: ${error.message}`);
  return (data as { installation_id: number | null } | null)?.installation_id ?? null;
}

async function fetchInstallationRepos(
  token: string,
  fetchImpl: typeof fetch,
): Promise<Array<{ id: number; name: string }>> {
  const resp = await fetchImpl(
    'https://api.github.com/installation/repositories?per_page=100',
    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' } },
  );
  if (!resp.ok) throw new Error(`GitHub repos list failed: ${resp.status}`);
  const body = (await resp.json()) as { repositories: Array<{ id: number; name: string }> };
  return body.repositories;
}

function annotateAccessible(
  ghRepos: Array<{ id: number; name: string }>,
  registered: ReadonlyArray<RegisteredRepo>,
): AccessibleRepo[] {
  const registeredIds = new Set(registered.map((r) => r.github_repo_id));
  return ghRepos.map((r) => ({
    github_repo_id: r.id,
    github_repo_name: r.name,
    is_registered: registeredIds.has(r.id),
  }));
}

export async function listRepositories(
  ctx: ApiContext,
  orgId: string,
  deps: ListRepositoriesDeps = {},
): Promise<RepositoryListResponse> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const [registered, installationId] = await Promise.all([
    loadRegistered(ctx.adminSupabase, orgId),
    loadInstallationId(ctx.adminSupabase, orgId),
  ]);

  if (installationId === null) return { registered, accessible: [] };

  const getToken = deps.getInstallationToken ?? defaultGetInstallationToken;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = await getToken(installationId);
  const ghRepos = await fetchInstallationRepos(token, fetchImpl);

  return { registered, accessible: annotateAccessible(ghRepos, registered) };
}
