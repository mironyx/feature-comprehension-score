// Regression guard for v2-requirements §Epic 17 Story 17.1 AC:
//   "all tool calls are scoped to only the repository associated with the assessment.
//    The GitHub App installation token provides repository-level isolation; tool
//    implementations must not accept repository identifiers as parameters or allow
//    cross-repository access."
//
// This test pins three invariants so a future refactor cannot silently widen the
// tool input schemas or let a tool accept owner/repo parameters from the LLM:
//
//  R1. readFile input schema accepts ONLY `path` (no owner/repo/id fields).
//  R2. listDirectory input schema accepts ONLY `path` (no owner/repo/id fields).
//  R3. Tool factories bind a single RepoRef via closure — the handler does not
//      consume owner/repo from the LLM-supplied input even if injected.
//
// See also ADR-0025 (service-role writes require org scoping) — this test covers
// the complementary GitHub-side invariant (tool calls require installation-token
// scoping + static RepoRef binding).

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { makeReadFileTool } from '@/lib/github/tools/read-file';
import { makeListDirectoryTool } from '@/lib/github/tools/list-directory';
import type { Octokit } from '@octokit/rest';

const BOUND_REPO = { owner: 'bound-owner', repo: 'bound-repo' };
const ATTACKER_REPO = { owner: 'attacker-owner', repo: 'attacker-repo' };

function makeMockOctokit(
  capturedRepo: { value: { owner: string; repo: string } | null },
  responseData: unknown,
): Octokit {
  return {
    request: vi.fn(async (_route: string, params: { owner: string; repo: string }) => {
      capturedRepo.value = { owner: params.owner, repo: params.repo };
      return { data: responseData };
    }),
  } as unknown as Octokit;
}

describe('Repo-scoping regression guard (v2-requirements §17.1)', () => {
  describe('R1: readFile input schema', () => {
    const tool = makeReadFileTool({} as Octokit, BOUND_REPO);

    it('accepts a bare { path } payload', () => {
      const result = tool.inputSchema.safeParse({ path: 'src/index.ts' });
      expect(result.success).toBe(true);
    });

    it('exposes ONLY the `path` key and no repo-identifier keys', () => {
      const shape = (tool.inputSchema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
      expect(Object.keys(shape)).toEqual(['path']);
      for (const forbidden of ['owner', 'repo', 'repository', 'repo_id', 'installation_id', 'org', 'org_id']) {
        expect(forbidden in shape).toBe(false);
      }
    });
  });

  describe('R2: listDirectory input schema', () => {
    const tool = makeListDirectoryTool({} as Octokit, BOUND_REPO);

    it('accepts a bare { path } payload', () => {
      const result = tool.inputSchema.safeParse({ path: 'src' });
      expect(result.success).toBe(true);
    });

    it('exposes ONLY the `path` key and no repo-identifier keys', () => {
      const shape = (tool.inputSchema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>).shape;
      expect(Object.keys(shape)).toEqual(['path']);
      for (const forbidden of ['owner', 'repo', 'repository', 'repo_id', 'installation_id', 'org', 'org_id']) {
        expect(forbidden in shape).toBe(false);
      }
    });
  });

  describe('R3: tool factories bind RepoRef via closure, not via LLM input', () => {
    it('readFile calls octokit with the bound owner/repo even when attacker fields are injected into the handler input', async () => {
      const captured = { value: null as { owner: string; repo: string } | null };
      const octokit = makeMockOctokit(captured, { type: 'file', content: Buffer.from('hello').toString('base64') });
      const tool = makeReadFileTool(octokit, BOUND_REPO);

      // Force-cast to bypass TypeScript — the point is to prove that even if a
      // malicious LLM response somehow slipped extra fields past zod, the handler
      // would not act on them because RepoRef is closed-over, not destructured.
      const handlerInput = { path: 'README.md', owner: ATTACKER_REPO.owner, repo: ATTACKER_REPO.repo } as unknown as { path: string };
      await tool.handler(handlerInput, new AbortController().signal);

      expect(captured.value).toEqual(BOUND_REPO);
      expect(captured.value).not.toEqual(ATTACKER_REPO);
    });

    it('listDirectory calls octokit with the bound owner/repo even when attacker fields are injected into the handler input', async () => {
      const captured = { value: null as { owner: string; repo: string } | null };
      const octokit = makeMockOctokit(captured, []);
      const tool = makeListDirectoryTool(octokit, BOUND_REPO);

      const handlerInput = { path: 'src', owner: ATTACKER_REPO.owner, repo: ATTACKER_REPO.repo } as unknown as { path: string };
      await tool.handler(handlerInput, new AbortController().signal);

      expect(captured.value).toEqual(BOUND_REPO);
      expect(captured.value).not.toEqual(ATTACKER_REPO);
    });
  });
});
