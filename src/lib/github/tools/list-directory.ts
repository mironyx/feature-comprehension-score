import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { fetchContents, isNotFound, toErrorMessage } from './octokit-contents';
import { resolveRepoPath } from './path-safety';
import type { RepoRef } from './read-file';
import type { ToolDefinition } from './types';

interface DirectoryEntry {
  name: string;
  kind: 'file' | 'dir';
}

const inputSchema = z.object({ path: z.string() });

export function makeListDirectoryTool(octokit: Octokit, repo: RepoRef): ToolDefinition<typeof inputSchema> {
  return {
    name: 'listDirectory',
    description: 'List entries in a directory of the assessment repository by repo-relative path.',
    inputSchema,
    handler: async ({ path }, signal) => {
      const safe = resolveRepoPath(path);
      if (!safe.ok) return { kind: 'forbidden_path', reason: safe.reason, bytes: 0 };
      try {
        const data = await fetchContents(octokit, repo, safe.normalised, signal);
        if (!Array.isArray(data)) {
          return { kind: 'error', message: 'path is not a directory', bytes: 0 };
        }
        const entries = data.map(toEntry);
        const content = JSON.stringify(entries);
        return { kind: 'ok', content, bytes: content.length };
      } catch (err) {
        if (isNotFound(err)) return { kind: 'not_found', similar_paths: [], bytes: 0 };
        return { kind: 'error', message: toErrorMessage(err), bytes: 0 };
      }
    },
  };
}

function toEntry(raw: unknown): DirectoryEntry {
  const { name, type } = raw as { name: string; type: string };
  return { name, kind: type === 'dir' ? 'dir' : 'file' };
}
