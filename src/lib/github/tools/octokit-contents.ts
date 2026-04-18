import type { Octokit } from '@octokit/rest';

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

// Encode each segment individually to preserve `/` as URL separator — Octokit's
// {path} parameter encodes slashes to %2F, which mis-routes both MSW and GitHub.
function encodeRepoPath(normalised: string): string {
  return normalised.split('/').map(encodeURIComponent).join('/');
}

export async function fetchContents(
  octokit: Octokit,
  repo: RepoRef,
  normalised: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await octokit.request(
    `GET /repos/{owner}/{repo}/contents/${encodeRepoPath(normalised)}`,
    {
      owner: repo.owner,
      repo: repo.repo,
      ...(repo.ref !== undefined ? { ref: repo.ref } : {}),
      request: { signal },
    },
  );
  return response.data;
}

export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && (err as { status: unknown }).status === 404;
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
