// Check admin permission on repos registered in our product.
// Caller pre-filters the repo list from the repositories table — avoids
// querying all installation repos and over-granting on unregistered repos.
// ADR-0029 §1.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2

import { getInstallationToken as defaultGetInstallationToken } from '@/lib/github/app-auth';

const GITHUB_API = 'https://api.github.com';
const CONCURRENCY = 8;

// Justification: LLD §B.2 originally used orgGithubName + GET /installation/repositories.
// Amended to accept pre-filtered registered repos (PR #402) to scope permission checks to
// product-registered repos only and avoid over-granting. Reconciled via /lld-sync.
export interface RegisteredRepo {
  githubRepoId: number;
  repoFullName: string; // "owner/repo" as stored in repositories.github_repo_name
}

export interface ListAdminReposInput {
  installationId: number;
  githubLogin: string;
  repos: RegisteredRepo[];
}

export interface ListAdminReposDeps {
  getInstallationToken?: (id: number) => Promise<string>;
}

async function checkPermission(
  repo: RegisteredRepo,
  githubLogin: string,
  token: string,
): Promise<number | null> {
  const [owner, name] = repo.repoFullName.split('/');
  const resp = await fetch(
    `${GITHUB_API}/repos/${owner}/${name}/collaborators/${githubLogin}/permission`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Permission check failed: ${resp.status} for ${repo.repoFullName}`);
  const body = (await resp.json()) as { permission: 'admin' | 'write' | 'read' | 'none' };
  return body.permission === 'admin' ? repo.githubRepoId : null;
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

/** Returns github_repo_id list where githubLogin holds admin permission, scoped to registered repos. */
export async function listAdminReposForUser(
  input: ListAdminReposInput,
  deps: ListAdminReposDeps = {},
): Promise<number[]> {
  if (input.repos.length === 0) return [];
  const getToken = deps.getInstallationToken ?? defaultGetInstallationToken;
  const token = await getToken(input.installationId);
  const adminIds = await runBounded(
    input.repos,
    (repo) => checkPermission(repo, input.githubLogin, token),
    CONCURRENCY,
  );
  return adminIds.filter((id): id is number => id !== null);
}
