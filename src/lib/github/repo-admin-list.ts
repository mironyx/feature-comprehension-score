// List repos in an org where the authenticated GitHub user holds admin permission.
// Uses the installation token (already org-scoped). ADR-0029 §1.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2

import { getInstallationToken as defaultGetInstallationToken } from '@/lib/github/app-auth';

const GITHUB_API = 'https://api.github.com';
const CONCURRENCY = 8;

export interface ListAdminReposInput {
  installationId: number;
  orgGithubName: string;
  githubLogin: string;
}

export interface ListAdminReposDeps {
  getInstallationToken?: (id: number) => Promise<string>;
  fetchImpl?: typeof fetch;
}

interface InstallationRepo {
  id: number;
  name: string;
  owner: { login: string };
}

interface CollaboratorPermission {
  permission: 'admin' | 'write' | 'read' | 'none';
}

async function fetchInstallationRepos(
  orgName: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<InstallationRepo[]> {
  const repos: InstallationRepo[] = [];
  let page = 1;
  while (true) {
    const resp = await fetchImpl(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
    );
    if (!resp.ok) throw new Error(`Failed to list installation repos: ${resp.status}`);
    const body = (await resp.json()) as { repositories: InstallationRepo[]; total_count: number };
    repos.push(...body.repositories.filter((r) => r.owner.login.toLowerCase() === orgName.toLowerCase()));
    if (body.repositories.length < 100) break;
    page++;
  }
  return repos;
}

async function checkPermission(
  repo: InstallationRepo,
  githubLogin: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  const resp = await fetchImpl(
    `${GITHUB_API}/repos/${repo.owner.login}/${repo.name}/collaborators/${githubLogin}/permission`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Permission check failed: ${resp.status} for ${repo.name}`);
  const body = (await resp.json()) as CollaboratorPermission;
  return body.permission === 'admin' ? repo.id : null;
}

async function runBounded<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/** Returns github_repo_id list where githubLogin holds admin permission in the org. */
export async function listAdminReposForUser(
  input: ListAdminReposInput,
  deps: ListAdminReposDeps = {},
): Promise<number[]> {
  const getToken = deps.getInstallationToken ?? defaultGetInstallationToken;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token = await getToken(input.installationId);
  const repos = await fetchInstallationRepos(input.orgGithubName, token, fetchImpl);
  const adminIds = await runBounded(
    repos,
    (repo) => checkPermission(repo, input.githubLogin, token, fetchImpl),
    CONCURRENCY,
  );
  return adminIds.filter((id): id is number => id !== null);
}
