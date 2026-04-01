// Tests for LLM logging in FCS service layer.
// Verifies artefact summary is logged before rubric generation.

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

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    extractFromPRs = vi.fn().mockResolvedValue({
      artefact_type: 'pull_request',
      pr_diff: 'diff --git a/f.ts b/f.ts',
      file_listing: [{ path: 'f.ts', additions: 10, deletions: 2, status: 'modified' }],
      file_contents: [
        { path: 'f.ts', content: 'export const x = 1;' },
        { path: 'g.ts', content: 'export const y = 2;' },
      ],
      test_files: [{ path: 'f.test.ts', content: 'test("x", () => {});' }],
    });
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
            organisations: { github_org_name: 'test-org' },
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
// Tests
// ---------------------------------------------------------------------------

describe('FCS service LLM logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  describe('Given a valid assessment creation request', () => {
    it('then it logs the artefact summary before rubric generation', async () => {
      const userClient = makeMockUserClient();
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: userClient as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
      };
      const body: FcsCreateBody = {
        org_id: ORG_ID,
        repository_id: REPO_ID,
        feature_name: 'Test Feature',
        merged_pr_numbers: [42],
        participants: [{ github_username: 'alice' }],
      };

      await createFcs(ctx, body);

      // triggerRubricGeneration runs async — give it a tick to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          fileCount: 2,
          testFileCount: 1,
          artefactQuality: 'code_only',
          questionCount: 5,
          tokenBudgetApplied: false,
        }),
        'Rubric generation: artefact summary',
      );
    });
  });
});
