import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { makeListDirectoryTool } from '@/lib/github/tools/list-directory';
import { server } from '../../../mocks/server';

const OWNER = 'acme';
const REPO = 'payments';
const REPO_REF = { owner: OWNER, repo: REPO };
const GITHUB_API = 'https://api.github.com';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeOctokit() {
  return new Octokit({ auth: 'mock-token' });
}

// ---------------------------------------------------------------------------
// listDirectory tool — §17.1b BDD spec
// ---------------------------------------------------------------------------

describe('listDirectory tool', () => {
  it('returns entries as { name, kind } pairs', async () => {
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src`, () =>
        HttpResponse.json([
          { name: 'pay.ts', path: 'src/pay.ts', type: 'file', sha: 'sha1', size: 100 },
          { name: 'utils', path: 'src/utils', type: 'dir', sha: 'sha2', size: 0 },
        ]),
      ),
    );

    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src' }, new AbortController().signal);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected ok');

    const entries = JSON.parse(result.content) as { name: string; kind: string }[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: 'pay.ts', kind: 'file' });
    expect(entries[1]).toMatchObject({ name: 'utils', kind: 'dir' });
  });

  it('returns kind values from the set { file, dir }', async () => {
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src`, () =>
        HttpResponse.json([
          { name: 'pay.ts', path: 'src/pay.ts', type: 'file', sha: 'sha1', size: 100 },
          { name: 'helpers', path: 'src/helpers', type: 'dir', sha: 'sha2', size: 0 },
        ]),
      ),
    );

    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src' }, new AbortController().signal);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected ok');

    const entries = JSON.parse(result.content) as { name: string; kind: string }[];
    for (const entry of entries) {
      expect(['file', 'dir']).toContain(entry.kind);
    }
  });

  it('returns kind=forbidden_path for unsafe paths', async () => {
    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: '../etc' }, new AbortController().signal);

    expect(result.kind).toBe('forbidden_path');
  });

  it('returns kind=not_found for missing directories', async () => {
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/docs/missing`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );

    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'docs/missing' }, new AbortController().signal);

    expect(result.kind).toBe('not_found');
  });

  it('returns kind=error when the path resolves to a file', async () => {
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src/pay.ts`, () =>
        HttpResponse.json({
          type: 'file',
          name: 'pay.ts',
          path: 'src/pay.ts',
          sha: 'sha1',
          size: 100,
          encoding: 'base64',
          content: Buffer.from('code').toString('base64'),
        }),
      ),
    );

    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src/pay.ts' }, new AbortController().signal);

    expect(result.kind).toBe('error');
  });

  it('never throws — handler that always throws internally returns kind=error', async () => {
    // Fake octokit whose request always rejects
    const fakeOctokit = {
      request: vi.fn(() => Promise.reject(new Error('network meltdown'))),
    } as unknown as Octokit;

    const tool = makeListDirectoryTool(fakeOctokit, REPO_REF);
    const result = await tool.handler({ path: 'src' }, new AbortController().signal);

    expect(result.kind).toBe('error');
  });

  // Tool definition shape [lld §17.1b]

  it('tool has name listDirectory', () => {
    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    expect(tool.name).toBe('listDirectory');
  });

  it('tool inputSchema accepts { path: string }', () => {
    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const parsed = tool.inputSchema.safeParse({ path: 'src' });
    expect(parsed.success).toBe(true);
  });

  it('content is valid JSON on kind=ok', async () => {
    server.use(
      http.get(`${GITHUB_API}/repos/${OWNER}/${REPO}/contents/src`, () =>
        HttpResponse.json([
          { name: 'pay.ts', path: 'src/pay.ts', type: 'file', sha: 'sha1', size: 100 },
        ]),
      ),
    );

    const tool = makeListDirectoryTool(makeOctokit(), REPO_REF);
    const result = await tool.handler({ path: 'src' }, new AbortController().signal);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected ok');
    expect(() => JSON.parse(result.content)).not.toThrow();
  });
});
