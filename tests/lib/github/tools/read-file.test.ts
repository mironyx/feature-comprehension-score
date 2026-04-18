import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { makeReadFileTool } from '@/lib/github/tools/read-file';
import { mockRepoContents } from '../../../mocks/github';
import { server } from '../../../mocks/server';

const OWNER = 'acme';
const REPO = 'payments';
const REPO_REF = { owner: OWNER, repo: REPO };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeOctokit() {
  return new Octokit({ auth: 'mock-token' });
}

// ---------------------------------------------------------------------------
// readFile tool — §17.1b BDD spec
// ---------------------------------------------------------------------------

describe('readFile tool', () => {
  it('returns kind=ok with content + bytes on valid path', async () => {
    const fileContent = 'export function pay() {}';
    server.use(mockRepoContents(OWNER, REPO, 'src/pay.ts', fileContent));

    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src/pay.ts' }, new AbortController().signal);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected ok');
    expect(result.content).toBe(fileContent);
  });

  it('returns bytes equal to content length on kind=ok', async () => {
    const fileContent = 'export function pay() {}';
    server.use(mockRepoContents(OWNER, REPO, 'src/pay.ts', fileContent));

    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src/pay.ts' }, new AbortController().signal);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected ok');
    expect(result.bytes).toBe(fileContent.length);
  });

  it('returns kind=forbidden_path when path-safety rejects', async () => {
    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: '../secrets' }, new AbortController().signal);

    expect(result.kind).toBe('forbidden_path');
  });

  it('returns reason on kind=forbidden_path', async () => {
    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: '/etc/passwd' }, new AbortController().signal);

    expect(result.kind).toBe('forbidden_path');
    if (result.kind !== 'forbidden_path') throw new Error('Expected forbidden_path');
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('returns kind=not_found with up to 5 similar paths on 404', async () => {
    const GITHUB_API = 'https://api.github.com';

    // The missing file itself — 404
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/missing.md`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
      // Parent directory listing for similar-path suggestions
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs`, () =>
        HttpResponse.json([
          { name: 'adr.md', path: 'docs/adr.md', type: 'file', sha: 'sha1', size: 100, encoding: 'base64', content: '' },
          { name: 'design.md', path: 'docs/design.md', type: 'file', sha: 'sha2', size: 100, encoding: 'base64', content: '' },
          { name: 'api.md', path: 'docs/api.md', type: 'file', sha: 'sha3', size: 100, encoding: 'base64', content: '' },
          { name: 'readme.md', path: 'docs/readme.md', type: 'file', sha: 'sha4', size: 100, encoding: 'base64', content: '' },
          { name: 'changelog.md', path: 'docs/changelog.md', type: 'file', sha: 'sha5', size: 100, encoding: 'base64', content: '' },
          { name: 'extra.md', path: 'docs/extra.md', type: 'file', sha: 'sha6', size: 100, encoding: 'base64', content: '' },
        ]),
      ),
    );

    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'docs/missing.md' }, new AbortController().signal);

    expect(result.kind).toBe('not_found');
    if (result.kind !== 'not_found') throw new Error('Expected not_found');
    expect(result.similar_paths.length).toBeLessThanOrEqual(5);
  });

  it('returns kind=error when the API call fails', async () => {
    const GITHUB_API = 'https://api.github.com';
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src/broken.ts`, () =>
        HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 }),
      ),
    );

    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src/broken.ts' }, new AbortController().signal);

    expect(result.kind).toBe('error');
  });

  it('returns kind=error when the path resolves to a directory', async () => {
    const GITHUB_API = 'https://api.github.com';
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src`, () =>
        HttpResponse.json([
          { name: 'pay.ts', path: 'src/pay.ts', type: 'file', sha: 'sha1', size: 100 },
        ]),
      ),
    );

    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src' }, new AbortController().signal);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') throw new Error('Expected error');
    expect(result.message).toMatch(/not a file/i);
  });

  it('propagates AbortSignal to the Octokit request', async () => {
    const controller = new AbortController();
    const capturedSignals: AbortSignal[] = [];

    // Spy octokit: capture the signal passed to the underlying request() call.
    // The handler uses octokit.request with manual path-segment encoding (the
    // repo-wide pattern) to preserve `/` separators, which Octokit's typed
    // helpers would URL-encode to %2F.
    const fakeOctokit = {
      request: vi.fn((_url: string, opts: { request?: { signal?: AbortSignal } }) => {
        if (opts.request?.signal) capturedSignals.push(opts.request.signal);
        return Promise.resolve({
          data: {
            type: 'file',
            name: 'pay.ts',
            path: 'src/pay.ts',
            sha: 'abc',
            size: 10,
            encoding: 'base64',
            content: Buffer.from('hello').toString('base64'),
          },
        });
      }),
    } as unknown as Octokit;

    const tool = makeReadFileTool(fakeOctokit, REPO_REF);
    await tool.handler({ path: 'src/pay.ts' }, controller.signal);

    expect(capturedSignals.length).toBeGreaterThan(0);
    // The signal passed is either the exact controller signal or a composite that wraps it
    // We assert the handler received *a* signal (not undefined) — invariant #8
    expect(capturedSignals[0]).toBeInstanceOf(AbortSignal);
  });

  it('never throws — handler that always throws internally returns kind=error', async () => {
    // Fake octokit whose request always rejects
    const fakeOctokit = {
      request: vi.fn(() => Promise.reject(new Error('network meltdown'))),
    } as unknown as Octokit;

    const tool = makeReadFileTool(fakeOctokit, REPO_REF);
    // Must resolve (not reject) and return kind=error
    const result = await tool.handler({ path: 'src/pay.ts' }, new AbortController().signal);

    expect(result.kind).toBe('error');
  });

  // Tool definition shape [lld §17.1b]

  it('tool has name readFile', () => {
    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    expect(tool.name).toBe('readFile');
  });

  it('tool inputSchema accepts { path: string }', () => {
    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const parsed = tool.inputSchema.safeParse({ path: 'src/pay.ts' });
    expect(parsed.success).toBe(true);
  });

  it('tool inputSchema rejects input without path', () => {
    const tool = makeReadFileTool(makeOctokit(), REPO_REF);
    const parsed = tool.inputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
