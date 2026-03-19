import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GitHubArtefactSource } from '@/lib/github/artefact-source';
import { RawArtefactSetSchema } from '@/lib/engine/prompts/artefact-types';
import {
  mockPullRequestFull,
  mockPullRequestFiles,
  mockRepoContents,
  mockIssue,
  mockGitTree,
} from '../../mocks/github';
import { server } from '../../mocks/server';

const OWNER = 'acme';
const REPO = 'payments';
const PR_NUMBER = 42;
const HEAD_SHA = 'deadbeef1234';

const MINIMAL_FILES = [
  { filename: 'src/pay.ts', status: 'modified' as const, additions: 15, deletions: 3 },
];
const DIFF =
  'diff --git a/src/pay.ts b/src/pay.ts\n--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeOctokit() {
  return new Octokit({ auth: 'mock-token' });
}

// ---------------------------------------------------------------------------
// Basic extraction
// ---------------------------------------------------------------------------

describe('GitHubArtefactSource', () => {
  describe('Given a single PR with source files', () => {
    it('then extractFromPRs returns a RawArtefactSet matching the schema', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA, body: 'Adds payment logic' }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      const parsed = RawArtefactSetSchema.safeParse(result);
      expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    });

    it('then artefact_type is pull_request for a single PR', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.artefact_type).toBe('pull_request');
    });

    it('then pr_diff contains the diff text', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.pr_diff).toContain('src/pay.ts');
    });

    it('then file_listing includes all changed files with stats', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.file_listing).toHaveLength(1);
      expect(result.file_listing[0]).toMatchObject({
        path: 'src/pay.ts',
        additions: 15,
        deletions: 3,
        status: 'modified',
      });
    });

    it('then pr_description is populated from PR body', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA, body: 'Adds payment logic' }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.pr_description).toBe('Adds payment logic');
    });

    it('then file_contents includes decoded file content for changed files', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.file_contents).toHaveLength(1);
      expect(result.file_contents[0]).toMatchObject({
        path: 'src/pay.ts',
        content: 'export function pay() {}',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Test file separation
  // ---------------------------------------------------------------------------

  describe('Given a PR with test files', () => {
    it('then test files are separated into test_files array', async () => {
      const files = [
        { filename: 'src/pay.ts', status: 'modified' as const, additions: 10, deletions: 2 },
        { filename: 'tests/pay.test.ts', status: 'added' as const, additions: 30, deletions: 0 },
      ];

      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, files),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockRepoContents(OWNER, REPO, 'tests/pay.test.ts', 'it("pays", () => {})'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.test_files).toBeDefined();
      expect(result.test_files).toHaveLength(1);
      expect(result.test_files?.[0]?.path).toBe('tests/pay.test.ts');
      expect(result.file_contents.some(f => f.path === 'src/pay.ts')).toBe(true);
      expect(result.file_contents.some(f => f.path === 'tests/pay.test.ts')).toBe(false);
    });

    it('then spec files are also classified as test files', async () => {
      const files = [
        { filename: 'src/pay.spec.ts', status: 'added' as const, additions: 20, deletions: 0 },
      ];

      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, files),
        mockRepoContents(OWNER, REPO, 'src/pay.spec.ts', 'describe("pay", () => {})'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.test_files).toHaveLength(1);
      expect(result.file_contents).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Linked issues
  // ---------------------------------------------------------------------------

  describe('Given a PR with linked issues in the body', () => {
    it('then linked_issues contains the resolved issue title and body', async () => {
      const body = 'This PR closes #10 and fixes #11.';

      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA, body }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockIssue(OWNER, REPO, 10, 'Add payment flow', 'We need to support payments.'),
        mockIssue(OWNER, REPO, 11, 'Fix payment bug', 'Bug in payment logic.'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.linked_issues).toHaveLength(2);
      expect(result.linked_issues?.[0]).toMatchObject({
        title: 'Add payment flow',
        body: 'We need to support payments.',
      });
    });

    it('then a PR with no linked issues has undefined linked_issues', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA, body: 'No issue links here.' }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.linked_issues === undefined || result.linked_issues?.length === 0).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Context file patterns
  // ---------------------------------------------------------------------------

  describe('Given context_file_patterns are specified', () => {
    it('then matching repo files are included in context_files', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockGitTree(OWNER, REPO, HEAD_SHA, [
          { path: 'docs/design/payments.md', type: 'blob', sha: 'sha1' },
          { path: 'docs/design/auth.md', type: 'blob', sha: 'sha2' },
          { path: 'src/pay.ts', type: 'blob', sha: 'sha3' },
        ]),
        mockRepoContents(OWNER, REPO, 'docs/design/payments.md', '# Design: Payments'),
        mockRepoContents(OWNER, REPO, 'docs/design/auth.md', '# Design: Auth'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
        contextFilePatterns: ['docs/design/*.md'],
      });

      expect(result.context_files).toBeDefined();
      expect(result.context_files).toHaveLength(2);
      expect(result.context_files?.map(f => f.path)).toContain('docs/design/payments.md');
      expect(result.context_files?.map(f => f.path)).toContain('docs/design/auth.md');
    });

    it('then context_files is undefined when no patterns are specified', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER],
      });

      expect(result.context_files).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-PR (FCS) merge
  // ---------------------------------------------------------------------------

  describe('Given multiple PRs (FCS flow)', () => {
    const PR2 = 43;
    const FILES_PR2 = [
      { filename: 'src/refund.ts', status: 'added' as const, additions: 20, deletions: 0 },
    ];
    const DIFF2 =
      'diff --git a/src/refund.ts b/src/refund.ts\n--- /dev/null\n+++ b/src/refund.ts\n@@ -0,0 +1 @@\n+new';

    it('then artefact_type is feature for multiple PRs', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockPullRequestFull(OWNER, REPO, PR2, { sha: 'sha2', merged_at: '2026-01-02T00:00:00Z' }, DIFF2),
        mockPullRequestFiles(OWNER, REPO, PR2, FILES_PR2),
        mockRepoContents(OWNER, REPO, 'src/refund.ts', 'export function refund() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER, PR2],
      });

      expect(result.artefact_type).toBe('feature');
    });

    it('then diffs from multiple PRs are concatenated', async () => {
      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockPullRequestFull(OWNER, REPO, PR2, { sha: 'sha2' }, DIFF2),
        mockPullRequestFiles(OWNER, REPO, PR2, FILES_PR2),
        mockRepoContents(OWNER, REPO, 'src/refund.ts', 'export function refund() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER, PR2],
      });

      expect(result.pr_diff).toContain('src/pay.ts');
      expect(result.pr_diff).toContain('src/refund.ts');
    });

    it('then file_listing is merged without duplicates', async () => {
      const sharedFile = [
        { filename: 'src/pay.ts', status: 'modified' as const, additions: 5, deletions: 1 },
      ];

      server.use(
        mockPullRequestFull(OWNER, REPO, PR_NUMBER, { sha: HEAD_SHA }, DIFF),
        mockPullRequestFiles(OWNER, REPO, PR_NUMBER, MINIMAL_FILES),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
        mockPullRequestFull(OWNER, REPO, PR2, { sha: 'sha2' }, DIFF2),
        mockPullRequestFiles(OWNER, REPO, PR2, sharedFile),
        mockRepoContents(OWNER, REPO, 'src/pay.ts', 'export function pay() {}'),
      );

      const source = new GitHubArtefactSource(makeOctokit());
      const result = await source.extractFromPRs({
        owner: OWNER,
        repo: REPO,
        prNumbers: [PR_NUMBER, PR2],
      });

      const paths = result.file_listing.map(f => f.path);
      const unique = new Set(paths);
      expect(unique.size).toBe(paths.length);
    });
  });
});
