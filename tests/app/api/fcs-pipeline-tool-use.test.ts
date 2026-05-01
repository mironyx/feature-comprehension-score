// Tests for pipeline integration — rubric generation with tool-use + observability.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.1e
// Issue: #246

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
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
  generateRubric: vi.fn(),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
    generateWithTools: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

// ---------------------------------------------------------------------------
// Tool factories — mocked at module level so we can assert on tool names
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/tools/read-file', () => ({
  makeReadFileTool: vi.fn(() => ({
    name: 'readFile',
    description: 'Read a file from the assessment repository by repo-relative path.',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

vi.mock('@/lib/github/tools/list-directory', () => ({
  makeListDirectoryTool: vi.fn(() => ({
    name: 'listDirectory',
    description: 'List entries in a directory of the assessment repository by repo-relative path.',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
import { createFcsForProject } from '@/app/api/projects/[id]/assessments/service';
import { type CreateFcsBody } from '@/app/api/projects/[id]/assessments/validation';
import type { ApiContext } from '@/lib/api/context';
import { generateRubric } from '@/lib/engine/pipeline';

// ---------------------------------------------------------------------------
// Constants — reuse exactly the same fixtures as fcs-service-logging.test.ts
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Observability payloads — used across multiple tests
// ---------------------------------------------------------------------------

const TOOL_CALL_LOG_ENTRY = {
  tool_name: 'readFile',
  argument_path: 'docs/adr/0014.md',
  bytes_returned: 42,
  outcome: 'ok' as const,
};

const SUCCESS_WITH_TOOLS = {
  status: 'success' as const,
  rubric: {
    questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }],
    artefact_quality: 'code_only' as const,
    artefact_quality_note: 'Only code artefacts found.',
  },
  observability: {
    inputTokens: 1234,
    outputTokens: 567,
    toolCalls: [TOOL_CALL_LOG_ENTRY],
    durationMs: 2500,
  },
};

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

const GENERATION_FAILED = {
  status: 'generation_failed' as const,
  error: { code: 'server_error' as const, message: 'LLM unreachable', retryable: true },
};

// ---------------------------------------------------------------------------
// Mock client builders — copied verbatim from fcs-service-logging.test.ts
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
    from: vi.fn((table: string) => {
      if (table === 'user_organisations') return makeChain(() => ({ data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null }));
      if (table === 'projects') return makeChain(() => ({ data: { id: PROJECT_ID }, error: null }));
      return makeChain(() => ({ data: null, error: null }));
    }),
  };
}

/**
 * Build a mock admin client whose `org_config` table returns the supplied retrieval fields
 * alongside the standard enforcement/score/count/size fields.
 */
function makeMockAdminClient(orgConfigOverrides: {
  tool_use_enabled: boolean;
  retrieval_timeout_seconds: number;
}) {
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
            tool_use_enabled: orgConfigOverrides.tool_use_enabled,
            rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: orgConfigOverrides.retrieval_timeout_seconds,
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

// ---------------------------------------------------------------------------
// Shared valid body — matches fcs-service-logging.test.ts fixture
// ---------------------------------------------------------------------------

const VALID_BODY: CreateFcsBody = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Test Feature',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

/** Waits for all pending microtasks and a short macro-task queue flush. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pipeline integration — rubric generation — observability + tool-use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  // -------------------------------------------------------------------------
  // 1. Tool-set wiring — tool_use_enabled = false
  // -------------------------------------------------------------------------

  describe('Given tool_use_enabled is false', () => {
    it('passes empty tool set to generateRubric when tool_use_enabled is false', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: false,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(vi.mocked(generateRubric)).toHaveBeenCalledWith(
        expect.objectContaining({ tools: [] }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tool-set wiring — tool_use_enabled = true
  // -------------------------------------------------------------------------

  describe('Given tool_use_enabled is true', () => {
    it('passes readFile + listDirectory tools to generateRubric when tool_use_enabled is true', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_WITH_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: true,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(vi.mocked(generateRubric)).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'readFile' }),
            expect.objectContaining({ name: 'listDirectory' }),
          ]),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Bounds wiring — retrieval_timeout_seconds → bounds.timeoutMs
  // -------------------------------------------------------------------------

  describe('Given retrieval_timeout_seconds is set in org config', () => {
    it('reads retrieval_timeout_seconds from org config and passes bounds.timeoutMs in milliseconds', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: false,
        retrieval_timeout_seconds: 300,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(vi.mocked(generateRubric)).toHaveBeenCalledWith(
        expect.objectContaining({
          bounds: expect.objectContaining({ timeoutMs: 300 * 1000 }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Observability persistence — input + output tokens
  // -------------------------------------------------------------------------

  describe('Given a successful rubric generation', () => {
    it('persists rubric_input_tokens + rubric_output_tokens on successful generation', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_WITH_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: true,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({
          p_rubric_input_tokens: 1234,
          p_rubric_output_tokens: 567,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Observability persistence — tool_call_count = 0 when no tools called
  // -------------------------------------------------------------------------

  describe('Given no tool calls were made during generation', () => {
    it('persists rubric_tool_call_count equal to toolCalls.length (0 when no tools called)', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: false,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({ p_rubric_tool_call_count: 0 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Observability persistence — rubric_tool_calls jsonb array
  // -------------------------------------------------------------------------

  describe('Given tool calls were made during generation', () => {
    it('persists rubric_tool_calls as a jsonb array matching the log entries', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_WITH_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: true,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({
          p_rubric_tool_calls: [TOOL_CALL_LOG_ENTRY],
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. Observability persistence — rubric_duration_ms positive integer
  // -------------------------------------------------------------------------

  describe('Given a successful rubric generation', () => {
    it('persists rubric_duration_ms as a positive integer', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_WITH_TOOLS);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: true,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric',
        expect.objectContaining({
          p_rubric_duration_ms: expect.any(Number),
        }),
      );
      const callArgs = adminClient.rpc.mock.calls.find(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      const durationMs = (callArgs?.[1] as { p_rubric_duration_ms: number })?.p_rubric_duration_ms;
      expect(durationMs).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Failure path — finalise_rubric must NOT be called; status set to rubric_failed
  // -------------------------------------------------------------------------

  describe('Given rubric generation fails', () => {
    it('does not call finalise_rubric on generation failure — status set to rubric_failed instead', async () => {
      vi.mocked(generateRubric).mockResolvedValue(GENERATION_FAILED);
      const adminClient = makeMockAdminClient({
        tool_use_enabled: false,
        retrieval_timeout_seconds: 120,
      });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      // finalise_rubric must not have been called
      const finaliseRubricCalls = adminClient.rpc.mock.calls.filter(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      expect(finaliseRubricCalls).toHaveLength(0);

      // assessments.update({ status: 'rubric_failed' }) must have been called
      const updateChain = adminClient.from.mock.results.find(
        (result: { value: unknown }) => {
          const chain = result.value as { update?: ReturnType<typeof vi.fn> };
          return chain?.update?.mock?.calls?.some(
            ([patch]: [{ status: string }]) => patch?.status === 'rubric_failed',
          );
        },
      );
      expect(updateChain).toBeDefined();
    });
  });
});
