import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import type { ToolDefinition, ToolResult } from '@/lib/engine/llm/tools';
import { resolveRepoPath } from './path-safety';
import type { RepoRef } from './read-file';

export const ListDirectoryInputSchema = z.object({ path: z.string() });

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: 'file' | 'dir';
}

const MAX_SIMILAR_PATHS = 5;

export function makeListDirectoryTool(
  octokit: Octokit,
  repo: RepoRef,
): ToolDefinition<typeof ListDirectoryInputSchema> {
  return {
    name: 'listDirectory',
    description:
      'List entries of a directory in the assessment repository by repo-relative path.',
    inputSchema: ListDirectoryInputSchema,
    handler: async ({ path }, signal) => handleListDirectory(octokit, repo, path, signal),
  };
}

async function handleListDirectory(
  octokit: Octokit,
  repo: RepoRef,
  rawPath: string,
  signal: AbortSignal,
): Promise<ToolResult> {
  const safe = resolveRepoPath(rawPath);
  if (!safe.ok) return { kind: 'forbidden_path', reason: safe.reason, bytes: 0 };

  try {
    const data = await fetchContents(octokit, repo, safe.normalised, signal);
    if (!Array.isArray(data)) {
      return { kind: 'error', message: 'path is not a directory', bytes: 0 };
    }
    const entries: DirectoryEntry[] = data.map(toDirectoryEntry);
    const content = JSON.stringify(entries);
    return { kind: 'ok', content, bytes: content.length };
  } catch (err) {
    if (isNotFoundError(err)) {
      const similar = await loadSimilarPaths(octokit, repo, safe.normalised, signal);
      return { kind: 'not_found', similar_paths: similar, bytes: 0 };
    }
    return { kind: 'error', message: toErrorMessage(err), bytes: 0 };
  }
}

interface GitHubDirEntry {
  name?: string;
  path?: string;
  type?: string;
}

function toDirectoryEntry(entry: GitHubDirEntry): DirectoryEntry {
  return {
    name: typeof entry.name === 'string' ? entry.name : '',
    kind: entry.type === 'dir' ? 'dir' : 'file',
  };
}

async function fetchContents(
  octokit: Octokit,
  repo: RepoRef,
  normalisedPath: string,
  signal: AbortSignal,
): Promise<GitHubDirEntry | GitHubDirEntry[]> {
  const encoded = encodePathSegments(normalisedPath);
  const response = await octokit.request(
    `GET /repos/{owner}/{repo}/contents/${encoded}`,
    {
      owner: repo.owner,
      repo: repo.repo,
      ...(repo.ref ? { ref: repo.ref } : {}),
      request: { signal },
    },
  );
  return response.data as GitHubDirEntry | GitHubDirEntry[];
}

async function loadSimilarPaths(
  octokit: Octokit,
  repo: RepoRef,
  normalisedPath: string,
  signal: AbortSignal,
): Promise<string[]> {
  const parent = parentDir(normalisedPath);
  try {
    const data = await fetchContents(octokit, repo, parent, signal);
    if (!Array.isArray(data)) return [];
    return data
      .map(entry => (typeof entry.name === 'string' ? entry.name : ''))
      .filter(name => name.length > 0)
      .slice(0, MAX_SIMILAR_PATHS);
  } catch {
    // Similar-path suggestions are best-effort; a parent-dir lookup failure must not
    // turn a clean not_found into an error — swallow and return an empty list.
    return [];
  }
}

function parentDir(normalisedPath: string): string {
  const idx = normalisedPath.lastIndexOf('/');
  return idx === -1 ? '' : normalisedPath.slice(0, idx);
}

function encodePathSegments(path: string): string {
  return path.split('/').map(s => encodeURIComponent(s)).join('/');
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 404;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}
