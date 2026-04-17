import { Octokit } from '@octokit/rest';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeReadFileTool } from '@/lib/github/tools/read-file';
import type { RepoRef } from '@/lib/github/tools/read-file';
import { mockRepoContents } from '../../../mocks/github';
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
// readFile tool
// ---------------------------------------------------------------------------

describe('makeReadFileTool', () => {
  // -------------------------------------------------------------------------
  // Tool metadata
  // -------------------------------------------------------------------------

  describe('Given the tool definition', () => {
    it("then name is 'readFile'", () => {
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      expect(tool.name).toBe('readFile');
    });

    it('then description is non-empty', () => {
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      expect(tool.description.trim().length).toBeGreaterThan(0);
    });

    it('then inputSchema parses an object with a string path field', () => {
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const result = tool.inputSchema.safeParse({ path: 'docs/adr/0014.md' });
      expect(result.success).toBe(true);
    });

    it('then inputSchema rejects an object without a path field', () => {
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const result = tool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('Given a valid repo-relative path to an existing file', () => {
    it("then returns { kind: 'ok', content, bytes } with content matching the file", async () => {
      const fileContent = '# ADR-0014\n\nAPI route contracts.';
      server.use(mockRepoContents(OWNER, REPO, 'docs/adr/0014.md', fileContent));

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/adr/0014.md' }, controller.signal);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.content).toBe(fileContent);
        expect(result.bytes).toBe(fileContent.length);
      }
    });

    it('then bytes equals content.length', async () => {
      const fileContent = 'hello world';
      server.use(mockRepoContents(OWNER, REPO, 'README.md', fileContent));

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'README.md' }, controller.signal);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.bytes).toBe(result.content.length);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Forbidden path
  // -------------------------------------------------------------------------

  describe("Given an unsafe path (e.g. '../etc/passwd')", () => {
    it("then returns { kind: 'forbidden_path', reason, bytes: 0 } without calling GitHub", async () => {
      // No server handler registered — if GitHub is called the test will fail with unhandled request
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: '../etc/passwd' }, controller.signal);

      expect(result.kind).toBe('forbidden_path');
      if (result.kind === 'forbidden_path') {
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
        expect(result.bytes).toBe(0);
      }
    });

    it("then returns bytes: 0 on forbidden_path", async () => {
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: '/etc/passwd' }, controller.signal);

      expect(result.kind).toBe('forbidden_path');
      expect(result.bytes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  describe('Given a path that does not exist in the repository', () => {
    it("then returns { kind: 'not_found', similar_paths, bytes: 0 } on a 404 response", async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/nonexistent.md`,
          () => new HttpResponse(null, { status: 404 }),
        ),
        // Parent directory listing — empty so similar_paths stays empty
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () => HttpResponse.json([]),
        ),
      );

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/nonexistent.md' }, controller.signal);

      expect(result.kind).toBe('not_found');
      if (result.kind === 'not_found') {
        expect(Array.isArray(result.similar_paths)).toBe(true);
        expect(result.bytes).toBe(0);
      }
    });

    it('then similar_paths contains at most 5 entries', async () => {
      // Parent directory returns 10 entries — similar_paths must be capped at 5
      const dirEntries = Array.from({ length: 10 }, (_, i) => ({
        name: `file-${i}.md`,
        path: `docs/file-${i}.md`,
        type: 'file',
        sha: `sha${i}`,
        size: 100,
      }));

      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/missing.md`,
          () => new HttpResponse(null, { status: 404 }),
        ),
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () => HttpResponse.json(dirEntries),
        ),
      );

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/missing.md' }, controller.signal);

      expect(result.kind).toBe('not_found');
      if (result.kind === 'not_found') {
        expect(result.similar_paths.length).toBeLessThanOrEqual(5);
        for (const entry of result.similar_paths) {
          expect(typeof entry).toBe('string');
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // API error (non-404)
  // -------------------------------------------------------------------------

  describe('Given a 500 server error from GitHub', () => {
    it("then returns { kind: 'error', message, bytes: 0 }", async () => {
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/adr/0014.md`,
          () => new HttpResponse(null, { status: 500 }),
        ),
      );

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs/adr/0014.md' }, controller.signal);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(typeof result.message).toBe('string');
        expect(result.bytes).toBe(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Path resolves to a directory
  // -------------------------------------------------------------------------

  describe('Given a path that resolves to a directory (GitHub returns an array)', () => {
    it("then returns { kind: 'error', message, bytes: 0 }", async () => {
      const dirEntries = [
        { name: 'adr', path: 'docs/adr', type: 'dir', sha: 'sha1', size: 0 },
        { name: 'design', path: 'docs/design', type: 'dir', sha: 'sha2', size: 0 },
      ];

      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`,
          () => HttpResponse.json(dirEntries),
        ),
      );

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();
      const result = await tool.handler({ path: 'docs' }, controller.signal);

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
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/slow.md`,
          async ({ request }) => {
            resolveRequest();
            // Hold until the client aborts the request
            await new Promise<void>((_resolve, reject) => {
              request.signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
            return HttpResponse.json({});
          },
        ),
      );

      const controller = new AbortController();
      const tool = makeReadFileTool(makeOctokit(), REPO_REF);

      const promise = tool.handler({ path: 'docs/slow.md' }, controller.signal);

      // Wait until the MSW handler has started, then abort
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

  describe('Given an Octokit that throws an unexpected non-HTTP exception', () => {
    it('then handler resolves to { kind: error } rather than propagating the exception', async () => {
      // Return a malformed body (plain text with status 200) to force a parsing failure
      server.use(
        http.get(
          `${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/boom.md`,
          () => HttpResponse.text('not json at all', { status: 200 }),
        ),
      );

      const tool = makeReadFileTool(makeOctokit(), REPO_REF);
      const controller = new AbortController();

      // Must not throw
      const result = await tool.handler({ path: 'docs/boom.md' }, controller.signal);
      expect(result.kind).toBe('error');
      expect(result.bytes).toBe(0);
    });
  });
});
