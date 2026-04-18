import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { resolveRepoPath } from './path-safety';
import type { ToolDefinition, ToolResult } from './types';

const MAX_SIMILAR_PATHS = 5;

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

const inputSchema = z.object({ path: z.string() });

export function makeReadFileTool(octokit: Octokit, repo: RepoRef): ToolDefinition<typeof inputSchema> {
  return {
    name: 'readFile',
    description: 'Read a file from the assessment repository by repo-relative path.',
    inputSchema,
    handler: async ({ path }, signal) => {
      const safe = resolveRepoPath(path);
      if (!safe.ok) return { kind: 'forbidden_path', reason: safe.reason, bytes: 0 };
      try {
        const data = await fetchContents(octokit, repo, safe.normalised, signal);
        if (Array.isArray(data) || data.type !== 'file') {
          return { kind: 'error', message: 'path is not a file', bytes: 0 };
        }
        const content = Buffer.from(String(data.content).replaceAll('\n', ''), 'base64').toString('utf-8');
        return { kind: 'ok', content, bytes: content.length };
      } catch (err) {
        if (isNotFound(err)) {
          const similar = await suggestSimilarPaths(octokit, repo, safe.normalised, signal);
          return { kind: 'not_found', similar_paths: similar, bytes: 0 };
        }
        return { kind: 'error', message: toMessage(err), bytes: 0 };
      }
    },
  };
}

// Encode each segment individually to preserve `/` as URL separator — Octokit's
// {path} parameter encodes slashes to %2F, which mis-routes both MSW and GitHub.
function encodeRepoPath(normalised: string): string {
  return normalised.split('/').map(encodeURIComponent).join('/');
}

async function fetchContents(
  octokit: Octokit,
  repo: RepoRef,
  normalised: string,
  signal: AbortSignal,
): Promise<{ type?: string; content?: string } | unknown[]> {
  const response = await octokit.request(
    `GET /repos/{owner}/{repo}/contents/${encodeRepoPath(normalised)}`,
    {
      owner: repo.owner,
      repo: repo.repo,
      ...(repo.ref !== undefined ? { ref: repo.ref } : {}),
      request: { signal },
    },
  );
  return response.data as { type?: string; content?: string } | unknown[];
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && (err as { status: unknown }).status === 404;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function suggestSimilarPaths(
  octokit: Octokit,
  repo: RepoRef,
  normalised: string,
  signal: AbortSignal,
): Promise<string[]> {
  const slash = normalised.lastIndexOf('/');
  const parent = slash === -1 ? '' : normalised.slice(0, slash);
  try {
    const data = await fetchContents(octokit, repo, parent, signal);
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_SIMILAR_PATHS).map(entry => (entry as { path: string }).path);
  } catch {
    // Similar-path suggestion is best-effort — a failed parent listing must not
    // override the primary not_found result with an error. Swallow intentionally.
    return [];
  }
}

export type { ToolResult };
