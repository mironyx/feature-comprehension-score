// Tests for rubric generation failure handling — sets rubric_failed status.
// Issue: #132

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
    extractFromPRs = vi.fn().mockRejectedValue(new Error('LLM timeout'));
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
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
    single: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
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

let updateStatusCalls: { status: string; assessmentId: string }[];

function makeMockUserClient() {
  return {
    from: vi.fn(() =>
      makeChain(() => ({ data: [{ github_role: 'admin' }], error: null })),
    ),
  };
}

function makeMockAdminClient() {
  const client = {
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
      if (table === 'assessments') {
        const chain = makeChain(() => ({ data: null, error: null }));
        chain.update.mockImplementation((values: Record<string, unknown>) => {
          updateStatusCalls.push({
            status: values['status'] as string,
            assessmentId: 'captured-later',
          });
          return chain;
        });
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rubric generation failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    updateStatusCalls = [];
  });

  it('sets status to rubric_failed when generation throws', async () => {
    const adminClient = makeMockAdminClient();
    const ctx: ApiContext = {
      supabase: makeMockUserClient() as never,
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

    // triggerRubricGeneration runs async — give it time to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The service should update the assessment status to rubric_failed
    expect(adminClient.from).toHaveBeenCalledWith('assessments');
    expect(updateStatusCalls).toContainEqual(
      expect.objectContaining({ status: 'rubric_failed' }),
    );
  });

  it('preserves existing PR records on failure', async () => {
    const adminClient = makeMockAdminClient();
    const ctx: ApiContext = {
      supabase: makeMockUserClient() as never,
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
    await new Promise((resolve) => setTimeout(resolve, 200));

    // The RPC to create_fcs_assessment should have been called (PRs stored)
    expect(adminClient.rpc).toHaveBeenCalledWith(
      'create_fcs_assessment',
      expect.objectContaining({
        p_merged_prs: expect.arrayContaining([
          expect.objectContaining({ pr_number: 42 }),
        ]),
      }),
    );
    // No delete calls should have been made to fcs_merged_prs
    const fromCalls = adminClient.from.mock.calls.map(c => c[0]);
    expect(fromCalls).not.toContain('fcs_merged_prs');
  });
});
