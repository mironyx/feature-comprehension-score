import { Octokit } from '@octokit/rest';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeListDirectoryTool } from '@/lib/github/tools/list-directory';
import type { DirectoryEntry } from '@/lib/github/tools/list-directory';
import type { RepoRef } from '@/lib/github/tools/read-file';
import { server } from '../../../mocks/server';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OWNER = 'acme';
const REPO = 'payments';
const GITHUB_API = 'https://api.github.com';

const REPO_REF: RepoRef = { owner: OWNER, repo: REPO };

function makeOctokit(): Octokit {
  return new Octokit({ auth: 'mock-token' });
}

// ---------------------------------------------------------------------------
// MSW lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// listDirectory tool
// ---------------------------------------------------------------------------

describe('makeListDirectoryTool', () => {
  // -------------------------------------------------------------------------
  // Tool metadata
  // -------------------------------------------------------------------------

  describe('Given the tool definition', () => {
    it("then name is 'listDirectory'", () => {
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      expect(tool.name).toBe('listDirectory');
    });

    it('then description is non-empty', () => {
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      expect(tool.description.trim().length).toBeGreaterThan(0);
    });

    it('then inputSchema parses an object with a string path field', () => {
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const result = tool.inputSchema.safeParse({ path: 'docs' });
      expect(result.success).toBe(true);
    });

    it('then inputSchema rejects an object without a path field', () => {
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const result = tool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Happy path — directory listing
  // -------------------------------------------------------------------------

  describe('Given a valid repo-relative path to an existing directory', () => {
    it("then returns { kind: 'ok', content, bytes } with content as JSON array of { name, kind } pairs", async () => {
      const githubEntries = [
        { name: 'adr', path: 'docs/adr', type: 'dir', sha: 'sha1', size: 0 },
        { name: 'design', path: 'docs/design', type: 'dir', sha: 'sha2', size: 0 },
        { name: 'README.md', path: 'docs/README.md', type: 'file', sha: 'sha3', size: 100 },
      ];

      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () => HttpResponse.json(githubEntries),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs' }, controller.signal);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // content must be valid JSON
        const parsed: DirectoryEntry[] = JSON.parse(result.content);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed).toHaveLength(3);

        // Each entry must have name and kind ('file' | 'dir')
        for (const entry of parsed) {
          expect(typeof entry.name).toBe('string');
          expect(['file', 'dir']).toContain(entry.kind);
        }

        // Specific entries
        const adr = parsed.find(e => e.name === 'adr');
        expect(adr?.kind).toBe('dir');
        const readme = parsed.find(e => e.name === 'README.md');
        expect(readme?.kind).toBe('file');
      }
    });

    it('then bytes matches content.length', async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src`,
          () =>
            HttpResponse.json([
              { name: 'index.ts', path: 'src/index.ts', type: 'file', sha: 'sha1', size: 50 },
            ]),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'src' }, controller.signal);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.bytes).toBe(result.content.length);
      }
    });

    it('then the content string is parseable JSON (wire-shape contract)', async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () =>
            HttpResponse.json([
              { name: 'CHANGELOG.md', path: 'docs/CHANGELOG.md', type: 'file', sha: 'sha1', size: 10 },
            ]),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs' }, controller.signal);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(() => JSON.parse(result.content)).not.toThrow();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Forbidden path
  // -------------------------------------------------------------------------

  describe("Given an unsafe path (e.g. '../secrets')", () => {
    it("then returns { kind: 'forbidden_path', reason, bytes: 0 } without calling GitHub", async () => {
      // No server handler — unhandled request would fail the test
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: '../secrets' }, controller.signal);

      expect(result.kind).toBe('forbidden_path');
      if (result.kind === 'forbidden_path') {
        expect(typeof result.reason).toBe('string');
        expect(result.bytes).toBe(0);
      }
    });

    it("then returns bytes: 0 on forbidden_path for an absolute path", async () => {
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: '/etc' }, controller.signal);

      expect(result.kind).toBe('forbidden_path');
      expect(result.bytes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  describe('Given a directory path that does not exist in the repository', () => {
    it("then returns { kind: 'not_found', bytes: 0 } on a 404 response", async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/nonexistent`,
          () => new HttpResponse(null, { status: 404 }),
        ),
        // Parent directory for similar-path lookup — may or may not be called
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () => HttpResponse.json([]),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/nonexistent' }, controller.signal);

      expect(result.kind).toBe('not_found');
      if (result.kind === 'not_found') {
        expect(result.bytes).toBe(0);
        // similar_paths may be empty or limited
        expect(Array.isArray(result.similar_paths)).toBe(true);
        expect(result.similar_paths.length).toBeLessThanOrEqual(5);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Path resolves to a file (not a directory)
  // -------------------------------------------------------------------------

  describe('Given a path that resolves to a single file (not an array)', () => {
    it("then returns { kind: 'error', bytes: 0 } when GitHub returns a single object instead of an array", async () => {
      // GitHub returns a single file object when the path points to a file
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/README.md`,
          () =>
            HttpResponse.json({
              type: 'file',
              name: 'README.md',
              path: 'docs/README.md',
              sha: 'sha1',
              size: 200,
              encoding: 'base64',
              content: Buffer.from('# Readme').toString('base64') + '\n',
            }),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/README.md' }, controller.signal);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.bytes).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AbortSignal propagation (Invariant row 8)
  // -------------------------------------------------------------------------

  describe('Given an AbortController that is aborted while the request is in flight', () => {
    it("then handler resolves to { kind: 'error' } rather than throwing", async () => {
      let resolveRequest!: () => void;
      const requestStarted = new Promise<void>(res => {
        resolveRequest = res;
      });

      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/slow`,
          async ({ request }) => {
            resolveRequest();
            // Hold until the client aborts
            await new Promise<void>((_resolve, reject) => {
              request.signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
            return HttpResponse.json([]);
          },
        ),
      );

      const controller = new AbortController();
      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);

      const promise = tool.handler({ path: 'docs/slow' }, controller.signal);

      await requestStarted;
      controller.abort();

      const result = await promise;
      expect(result.kind).toBe('error');
      expect(result.bytes).toBe(0);
    }, 10_000);
  });

  // -------------------------------------------------------------------------
  // Handler never throws (Invariant row 3)
  // -------------------------------------------------------------------------

  describe('Given a malformed response body from the GitHub API', () => {
    it('then handler resolves to { kind: error } without throwing', async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/corrupt`,
          () => HttpResponse.text('not json at all', { status: 200 }),
        ),
      );

      const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();

      // Must not throw
      const result = await tool.handler({ path: 'docs/corrupt' }, controller.signal);
      expect(result.kind).toBe('error');
      expect(result.bytes).toBe(0);
    });
  });
});
