// Adversarial evaluation tests for §17.1e pipeline integration.
// Issue #246 — pipeline: rubric generation with tool-use + observability.
//
// Gap: the test-author verifies token + duration persistence only for the
// tool_use_enabled=true path (AC-4 uses SUCCESS_WITH_TOOLS). The spec requires
// "observability persisted whether tool-use enabled OR disabled." No existing test
// asserts p_rubric_input_tokens, p_rubric_output_tokens, and p_rubric_duration_ms
// are persisted on the disabled-tools path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
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
      file_contents: [{ path: 'f.ts', content: 'export const x = 1;' }],
      test_files: [],
    });
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn(),
    generateWithTools: vi.fn(),
  }),
}));

vi.mock('@/lib/github/tools/read-file', () => ({
  makeReadFileTool: vi.fn(() => ({
    name: 'readFile',
    description: 'Read a file',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

vi.mock('@/lib/github/tools/list-directory', () => ({
  makeListDirectoryTool: vi.fn(() => ({
    name: 'listDirectory',
    description: 'List directory',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
import { createFcs, type FcsCreateBody } from '@/lib/api/fcs-pipeline';
import type { ApiContext } from '@/lib/api/context';
import { generateRubric } from '@/lib/engine/pipeline';

// ---------------------------------------------------------------------------
// Reuse fixtures from fcs-pipeline-tool-use.test.ts
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

const SUCCESS_NO_TOOLS = {
  status: 'success' as const,
  rubric: {
    questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }],
    artefact_quality: 'code_only' as const,
    artefact_quality_note: 'Only code artefacts found.',
  },
  observability: {
    inputTokens: 800,
    outputTokens: 300,
    toolCalls: [],
    durationMs: 1100,
  },
};

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
            tool_use_enabled: false,
            rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: 120,
          },
          error: null,
        }));
      }
      if (table === 'assessments') {
        return makeChain(() => ({ data: null, error: null }));
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function makeMockUserClient() {
  return {
    from: vi.fn(() =>
      makeChain(() => ({ data: [{ github_role: 'admin' }], error: null })),
    ),
  };
}

const VALID_BODY: FcsCreateBody = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Test Feature',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ---------------------------------------------------------------------------
// Adversarial tests
// ---------------------------------------------------------------------------

describe('Pipeline integration — observability persistence when tool-use disabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  describe('Given tool_use_enabled is false and generation succeeds', () => {
    it('persists rubric_input_tokens on the disabled-tools path', async () => {
      // Gap: AC-4 / LLD §17.1e invariant #5 — "Observability fields populated on every
      // rubric generation, including disabled path." The primary test file only verifies
      // token persistence on the tool_use_enabled=true scenario.
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
      };

      await createFcs(ctx, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({ p_rubric_input_tokens: 800 }),
      );
    });

    it('persists rubric_output_tokens on the disabled-tools path', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
      };

      await createFcs(ctx, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({ p_rubric_output_tokens: 300 }),
      );
    });

    it('persists rubric_duration_ms on the disabled-tools path', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
      };

      await createFcs(ctx, VALID_BODY);
      await flushAsync();

      const callArgs = adminClient.rpc.mock.calls.find(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      const durationMs = (callArgs?.[1] as { p_rubric_duration_ms: number })?.p_rubric_duration_ms;
      expect(durationMs).toBe(1100);
    });
  });
});
