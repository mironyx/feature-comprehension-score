// Tests for LLM logging in FCS service layer.
// Verifies artefact summary is logged before rubric generation.
// Enhanced logging tests added for issue #282 (E19.3).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    child: vi.fn(() => ({
      info: mockLoggerInfo,
      error: mockLoggerError,
    })),
  },
}));

vi.mock('@/lib/api/errors', () => ({
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, message: string) {
      super(message);
    }
  },
}));

vi.mock('@/lib/github/client', () => ({
  createGithubClient: vi.fn(),
}));

// Shared mocks — overridden per test scenario via mockResolvedValue.
const mockExtractFromPRs = vi.fn();
const mockDiscoverLinkedPRs = vi.fn();
const mockFetchIssueContent = vi.fn();

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    extractFromPRs = mockExtractFromPRs;
    discoverLinkedPRs = mockDiscoverLinkedPRs;
    fetchIssueContent = mockFetchIssueContent;
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn().mockResolvedValue({
    status: 'success',
    rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
  }),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';

// We need to call the internal triggerRubricGeneration, which is private.
// Instead, we'll import the service and call createFcs which triggers it.
import { createFcs, type FcsCreateBody } from '@/app/api/fcs/service';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Baseline artefact returned by the mock GitHub source (2 files, 1 test file, no linked issues). */
const BASE_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  pr_diff: 'diff --git a/f.ts b/f.ts',
  file_listing: [{ path: 'f.ts', additions: 10, deletions: 2, status: 'modified' }],
  file_contents: [
    { path: 'f.ts', content: 'export const x = 1;' },
    { path: 'g.ts', content: 'export const y = 2;' },
  ],
  test_files: [{ path: 'f.test.ts', content: 'test("x", () => {});' }],
};

/** Build a file_contents array of length n with synthetic paths. */
function makeFileContents(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    path: `src/file-${i}.ts`,
    content: `export const v${i} = ${i};`,
  }));
}

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

const mockOctokit = {
  rest: {
    pulls: {
      get: vi.fn().mockResolvedValue({
        data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' },
      }),
    },
    users: {
      getByUsername: vi.fn().mockResolvedValue({
        data: { id: 99001, login: 'alice' },
      }),
    },
    issues: {
      get: vi.fn().mockResolvedValue({
        data: { number: 101, title: 'Epic issue', body: 'body', pull_request: undefined },
      }),
    },
  },
};

function makeMockUserClient() {
  return {
    from: vi.fn(() =>
      makeChain(() => ({ data: [{ github_role: 'admin' }], error: null })),
    ),
  };
}

function makeMockAdminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'repositories') {
        return makeChain(() => ({
          data: {
            github_repo_name: 'test-repo',
            org_id: ORG_ID,
            organisations: { github_org_name: 'test-org', installation_id: 42 },
          },
          error: null,
        }));
      }
      if (table === 'org_config') {
        return makeChain(() => ({
          data: {
            enforcement_mode: 'soft',
            score_threshold: 70,
            fcs_question_count: 5,
            min_pr_size: 20,
          },
          error: null,
        }));
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// ---------------------------------------------------------------------------
// Helper: invoke createFcs end-to-end and wait for the async pipeline tick
// ---------------------------------------------------------------------------

async function runCreateFcs(bodyOverrides: Partial<FcsCreateBody> = {}) {
  const ctx: ApiContext = {
    supabase: makeMockUserClient() as never,
    adminSupabase: makeMockAdminClient() as never,
    user: { id: USER_ID, email: 'admin@example.com' },
  };
  const body: FcsCreateBody = {
    org_id: ORG_ID,
    repository_id: REPO_ID,
    feature_name: 'Test Feature',
    merged_pr_numbers: [42],
    participants: [{ github_username: 'alice' }],
    ...bodyOverrides,
  };
  await createFcs(ctx, body);
  // triggerRubricGeneration runs async — give it a tick to complete
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Returns the payload object from the artefact-summary log call, or undefined. */
function getArtefactSummaryLogPayload(): Record<string, unknown> | undefined {
  for (const call of mockLoggerInfo.mock.calls) {
    if (call[1] === 'Rubric generation: artefact summary') {
      return call[0] as Record<string, unknown>;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FCS service LLM logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    // Default: 2 files, 1 test file, no linked_issues
    mockExtractFromPRs.mockResolvedValue(BASE_ARTEFACT);
    // Default: no discovered PRs and no explicit issue content — preserves
    // backward-compat tests that pass only merged_pr_numbers.
    mockDiscoverLinkedPRs.mockResolvedValue([]);
    mockFetchIssueContent.mockResolvedValue([]);
  });

  describe('Given a valid assessment creation request', () => {
    it('then it logs the artefact summary before rubric generation', async () => {
      await runCreateFcs();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          fileCount: 2,
          testFileCount: 1,
          artefactQuality: 'code_and_tests',
          questionCount: 5,
          tokenBudgetApplied: false,
        }),
        'Rubric generation: artefact summary',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Issue #282 — E19.3: Enhanced artefact extraction logging
  // -------------------------------------------------------------------------

  describe('logArtefactSummary — enhanced logging', () => {
    it('includes filePaths array in log entry', async () => {
      // [req §19.3] filePaths sourced from file_contents.map(f => f.path)
      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload).toBeDefined();
      expect(payload).toHaveProperty('filePaths');
    });

    it('filePaths values match the file_contents paths sent to the LLM', async () => {
      // [req §19.3] exact path values, not just presence of the array
      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload?.filePaths).toEqual(['f.ts', 'g.ts']);
    });

    it('truncates filePaths at 50 entries with filePaths_truncated flag', async () => {
      // [req §19.3] > 50 files triggers truncation to exactly 50 paths
      const sixtyFiles = makeFileContents(60);
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        file_listing: sixtyFiles.map((f) => ({
          path: f.path,
          additions: 1,
          deletions: 0,
          status: 'added',
        })),
        file_contents: sixtyFiles,
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(Array.isArray(payload?.filePaths)).toBe(true);
      expect((payload?.filePaths as unknown[]).length).toBe(50);
    });

    it('sets filePaths_truncated: true when file_contents exceeds 50 entries', async () => {
      // [req §19.3] truncation flag must accompany the truncated list
      const sixtyFiles = makeFileContents(60);
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        file_listing: sixtyFiles.map((f) => ({
          path: f.path,
          additions: 1,
          deletions: 0,
          status: 'added',
        })),
        file_contents: sixtyFiles,
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload?.filePaths_truncated).toBe(true);
    });

    it('does not set filePaths_truncated when file_contents has exactly 50 entries', async () => {
      // [issue AC] boundary: exactly 50 files — no truncation flag
      const fiftyFiles = makeFileContents(50);
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        file_listing: fiftyFiles.map((f) => ({
          path: f.path,
          additions: 1,
          deletions: 0,
          status: 'added',
        })),
        file_contents: fiftyFiles,
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload?.filePaths_truncated).toBeFalsy();
    });

    it('includes issueCount when linked_issues are present', async () => {
      // [issue AC] issueCount = linked_issues.length when linked_issues is non-empty
      // NOTE: req §19.3 specifies `issueNumbers` but the implementation uses `issueCount`
      // because LinkedIssue has no `number` field — see issue #282 contradiction flag.
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        linked_issues: [
          { title: 'Fix the thing', body: 'Body A' },
          { title: 'Add the feature', body: 'Body B' },
        ],
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload).toHaveProperty('issueCount');
    });

    it('issueCount equals the number of linked_issues', async () => {
      // [issue AC] exact value check
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        linked_issues: [
          { title: 'Fix the thing', body: 'Body A' },
          { title: 'Add the feature', body: 'Body B' },
        ],
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload?.issueCount).toBe(2);
    });

    it('omits issueCount when no linked_issues', async () => {
      // [issue AC] field must be absent (not 0) when linked_issues is absent
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        // no linked_issues field
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload).not.toHaveProperty('issueCount');
    });

    it('omits issueCount when linked_issues is an empty array', async () => {
      // [issue AC] boundary: explicitly empty array — no issues present, field omitted
      mockExtractFromPRs.mockResolvedValue({
        ...BASE_ARTEFACT,
        linked_issues: [],
      });

      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload).not.toHaveProperty('issueCount');
    });

    it('preserves all existing log fields unchanged', async () => {
      // [req §19.3] fileCount, testFileCount, artefactQuality, questionCount, tokenBudgetApplied
      await runCreateFcs();

      const payload = getArtefactSummaryLogPayload();
      expect(payload).toMatchObject({
        fileCount: 2,
        testFileCount: 1,
        artefactQuality: 'code_and_tests',
        questionCount: 5,
        tokenBudgetApplied: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Story 19.2 (#288) — extractArtefacts wires discoverLinkedPRs into the
  // PR extraction call and merges the discovered set with explicit PR numbers.
  // -------------------------------------------------------------------------

  describe('extractArtefacts with issue numbers — Story 19.2 (#288)', () => {
    it('passes the union of explicit and discovered PR numbers to extractFromPRs', async () => {
      // [req §Story 19.2] discovered PRs are merged with explicit merged_pr_numbers
      mockDiscoverLinkedPRs.mockResolvedValue([99]);

      await runCreateFcs({ merged_pr_numbers: [42], issue_numbers: [101] });

      expect(mockExtractFromPRs).toHaveBeenCalledWith(
        expect.objectContaining({ prNumbers: expect.arrayContaining([42, 99]) }),
      );
    });

    it('deduplicates a discovered PR that is already in the explicit list', async () => {
      // [req §Story 19.2] overlapping explicit+discovered sets → no duplicates
      mockDiscoverLinkedPRs.mockResolvedValue([42]);

      await runCreateFcs({ merged_pr_numbers: [42], issue_numbers: [101] });

      const call = mockExtractFromPRs.mock.calls[0]?.[0] as { prNumbers: number[] };
      expect(call.prNumbers).toEqual([42]);
    });

    it('invokes extractFromPRs with the discovered PR set when only issue_numbers are supplied', async () => {
      // [req §Story 19.2] issue-only request → discovered PRs feed extractFromPRs
      mockDiscoverLinkedPRs.mockResolvedValue([77]);

      await runCreateFcs({ merged_pr_numbers: undefined, issue_numbers: [101] });

      expect(mockExtractFromPRs).toHaveBeenCalledWith(
        expect.objectContaining({ prNumbers: [77] }),
      );
    });

    it('does not call discoverLinkedPRs when no issue_numbers are provided', async () => {
      // [req §Story 19.2] PR-only request → no GraphQL discovery call
      await runCreateFcs({ merged_pr_numbers: [42] });

      expect(mockDiscoverLinkedPRs).not.toHaveBeenCalled();
    });

    it('logs discovered, explicit, and merged PR numbers at info', async () => {
      // [issue AC] "Discovery results logged: discovered vs explicit vs merged set"
      mockDiscoverLinkedPRs.mockResolvedValue([99, 100]);

      await runCreateFcs({ merged_pr_numbers: [42], issue_numbers: [101] });

      const discoveryLog = mockLoggerInfo.mock.calls.find(
        (c) => c[1] === 'extractArtefacts: linked PR discovery',
      );
      expect(discoveryLog).toBeDefined();
      expect(discoveryLog?.[0]).toMatchObject({
        explicitPrs: [42],
        discoveredPrs: [99, 100],
        mergedPrs: expect.arrayContaining([42, 99, 100]),
      });
    });

    it('combines issue content with PR artefacts in linked_issues', async () => {
      // [req §Story 19.2] explicit issue content merges into the artefact set's linked_issues
      mockDiscoverLinkedPRs.mockResolvedValue([99]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Epic: checkout', body: 'Design rationale.' },
      ]);

      await runCreateFcs({ merged_pr_numbers: [42], issue_numbers: [101] });

      const payload = getArtefactSummaryLogPayload();
      expect(payload?.issueCount).toBe(1);
    });
  });
});
