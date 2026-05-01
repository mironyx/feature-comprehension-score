// Tests for pipeline error capture & structured logging — Story 18.1.
// Design reference: docs/design/lld-e18.md §18.1
// Requirements: docs/requirements/v2-requirements.md §Epic 18 Story 18.1
// Issue: #272

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    child: vi.fn(() => ({
      info: mockLoggerInfo,
      warn: mockLoggerWarn,
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

// mockExtractFromPRs is used by the GitHubArtefactSource mock below.
// Individual tests may call .mockRejectedValueOnce() on it to simulate non-LLM failures.
const mockExtractFromPRs = vi.fn().mockResolvedValue({
  artefact_type: 'pull_request',
  pr_diff: 'diff --git a/f.ts b/f.ts',
  file_listing: [{ path: 'f.ts', additions: 10, deletions: 2, status: 'modified' }],
  file_contents: [
    { path: 'f.ts', content: 'export const x = 1;' },
    { path: 'g.ts', content: 'export const y = 2;' },
  ],
  test_files: [{ path: 'f.test.ts', content: 'test("x", () => {});' }],
});

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    extractFromPRs = mockExtractFromPRs;
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
    description: 'Read a file.',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

vi.mock('@/lib/github/tools/list-directory', () => ({
  makeListDirectoryTool: vi.fn(() => ({
    name: 'listDirectory',
    description: 'List a directory.',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
import { RubricGenerationError } from '@/lib/api/fcs-pipeline';
import { createFcsForProject } from '@/app/api/projects/[id]/assessments/service';
import { type CreateFcsBody } from '@/app/api/projects/[id]/assessments/validation';
import type { ApiContext } from '@/lib/api/context';
import { generateRubric } from '@/lib/engine/pipeline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';
const ASSESSMENT_ID = 'b0000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Observability payloads
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mock client builders — copied verbatim from fcs-pipeline-tool-use.test.ts
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

interface UpdateCall {
  values: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown }>;
}

/**
 * Builds a mock admin client that captures update payloads for 'assessments' along
 * with the chained .eq() filters (defence-in-depth org scoping — ADR-0025).
 */
function makeMockAdminClientWithUpdateCapture(updateCalls: UpdateCall[]) {
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
            tool_use_enabled: false,
            rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: 120,
          },
          error: null,
        }));
      }
      if (table === 'assessments') {
        const chain = makeChain(() => ({ data: null, error: null }));
        let current: UpdateCall | null = null;
        chain.update.mockImplementation((values: Record<string, unknown>) => {
          current = { values, filters: [] };
          updateCalls.push(current);
          return chain;
        });
        chain.eq.mockImplementation((column: string, value: unknown) => {
          current?.filters.push({ column, value });
          return chain;
        });
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: vi.fn((name: string) => {
      if (name === 'create_fcs_assessment') {
        return Promise.resolve({ data: ASSESSMENT_ID, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };
  return client;
}

function makeMockAdminClientSuccess() {
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

describe('Story 18.1: Pipeline Error Capture & Structured Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  // =========================================================================
  // A. markRubricFailed failure-path persistence (driven via createFcs)
  // =========================================================================

  describe('markRubricFailed — LLM failure-path persistence', () => {
    it('A1: Given malformed_response LLMError, when rubric generation fails, then rubric_error_code is persisted as malformed_response', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: 'Invalid JSON', retryable: false },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate!.values['rubric_error_code']).toBe('malformed_response');
    });

    it('A2: Given malformed_response LLMError with message "Invalid JSON", when rubric generation fails, then rubric_error_message is persisted as "Invalid JSON"', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: 'Invalid JSON', retryable: false },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_error_message']).toBe('Invalid JSON');
    });

    it('A3: Given malformed_response LLMError with retryable=false, when rubric generation fails, then rubric_error_retryable is persisted as false', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: 'Invalid JSON', retryable: false },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_error_retryable']).toBe(false);
    });

    it('A4: Given an error message of 1500 chars, when rubric generation fails, then the persisted rubric_error_message is truncated to exactly 1000 chars', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);
      const longMessage = 'a'.repeat(1500);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: longMessage, retryable: false },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(typeof failureUpdate!.values['rubric_error_message']).toBe('string');
      expect((failureUpdate!.values['rubric_error_message'] as string).length).toBe(1000);
    });

    it('A5a: Given partialObservability with inputTokens=500, when rubric generation fails, then rubric_input_tokens=500 is persisted', async () => {
      // partialObservability is attached by throwing a RubricGenerationError directly —
      // we simulate this by making generateRubric throw (not return generation_failed)
      // so the catch block in triggerRubricGeneration receives a RubricGenerationError.
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockRejectedValue(
        new RubricGenerationError(
          { code: 'malformed_response', message: 'bad', retryable: false },
          { inputTokens: 500, outputTokens: 200, toolCalls: [{ tool_name: 'readFile', argument_path: 'a.md', bytes_returned: 10, outcome: 'ok' }], durationMs: 3000 },
        ),
      );

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_input_tokens']).toBe(500);
    });

    it('A5b: Given partialObservability with outputTokens=200, when rubric generation fails, then rubric_output_tokens=200 is persisted', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockRejectedValue(
        new RubricGenerationError(
          { code: 'malformed_response', message: 'bad', retryable: false },
          { inputTokens: 500, outputTokens: 200, toolCalls: [], durationMs: 3000 },
        ),
      );

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_output_tokens']).toBe(200);
    });

    it('A5c: Given partialObservability with durationMs=3000, when rubric generation fails, then rubric_duration_ms=3000 is persisted', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockRejectedValue(
        new RubricGenerationError(
          { code: 'malformed_response', message: 'bad', retryable: false },
          { inputTokens: 500, outputTokens: 200, toolCalls: [], durationMs: 3000 },
        ),
      );

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_duration_ms']).toBe(3000);
    });

    it('A5e: Given partialObservability with one tool call entry, when rubric generation fails, then rubric_tool_calls is persisted as an array containing that entry', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);
      const toolCallEntry = { tool_name: 'readFile', argument_path: 'a.md', bytes_returned: 10, outcome: 'ok' as const };

      vi.mocked(generateRubric).mockRejectedValue(
        new RubricGenerationError(
          { code: 'malformed_response', message: 'bad', retryable: false },
          { inputTokens: 500, outputTokens: 200, toolCalls: [toolCallEntry], durationMs: 3000 },
        ),
      );

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_tool_calls']).toEqual([toolCallEntry]);
    });

    it('A5d: Given partialObservability with toolCalls of length 1, when rubric generation fails, then rubric_tool_call_count=1 is persisted', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockRejectedValue(
        new RubricGenerationError(
          { code: 'malformed_response', message: 'bad', retryable: false },
          { inputTokens: 500, outputTokens: 200, toolCalls: [{ tool_name: 'readFile', argument_path: 'a.md', bytes_returned: 10, outcome: 'ok' }], durationMs: 3000 },
        ),
      );

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate!.values['rubric_tool_call_count']).toBe(1);
    });

    it('A6: Given a non-LLM failure (plain Error from extractFromPRs), when rubric generation fails, then rubric_error_code is NOT set in the update payload', async () => {
      // Make extractFromPRs reject with a plain Error (not a RubricGenerationError).
      // This simulates a GitHub API failure before the LLM is ever called.
      mockExtractFromPRs.mockRejectedValueOnce(new Error('GitHub API timeout'));

      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate).toBeDefined();
      // rubric_error_code must not appear in the update payload for non-LLM failures
      expect('rubric_error_code' in (failureUpdate?.values ?? {})).toBe(false);
    });

    it('A7: Given any rubric generation failure, when markRubricFailed is called, then the update always includes status: "rubric_failed"', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'server_error', message: 'LLM unreachable', retryable: true },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate!.values['status']).toBe('rubric_failed');
    });

    it('A8: Given a rubric generation failure, when markRubricFailed runs with the service-role client, then the update is scoped by both id and org_id (ADR-0025 defence-in-depth)', async () => {
      const updateCalls: UpdateCall[] = [];
      const adminClient = makeMockAdminClientWithUpdateCapture(updateCalls);

      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'server_error', message: 'LLM unreachable', retryable: true },
      });

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = updateCalls.find((u) => u.values['status'] === 'rubric_failed');
      expect(failureUpdate).toBeDefined();
      const filters = failureUpdate!.filters;
      // createAssessmentWithParticipants generates its own UUID via randomUUID(), so we
      // assert the filter shape (both id and org_id are filtered) rather than the exact id.
      expect(filters.map((f) => f.column).sort()).toEqual(['id', 'org_id']);
      expect(filters.find((f) => f.column === 'org_id')?.value).toBe(ORG_ID);
    });
  });

  // =========================================================================
  // B. Structured logging (driven via createFcs with generateRubric → success)
  // =========================================================================

  describe('Structured step logging — happy path', () => {
    it('B1: Given a valid assessment creation request, when the pipeline runs, then logger.info is called with step: "artefact_extraction" and assessmentId + orgId', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'artefact_extraction', orgId: ORG_ID }),
        expect.any(String),
      );
    });

    it('B2: Given a valid assessment creation request, when the pipeline runs, then logger.info is called with step: "llm_request_sent" and assessmentId + orgId', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'llm_request_sent', orgId: ORG_ID }),
        expect.any(String),
      );
    });

    it('B3: Given a successful LLM response, when the pipeline logs llm_response_received, then logger.info includes inputTokens, outputTokens, toolCallCount, and durationMs', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'llm_response_received',
          inputTokens: SUCCESS_NO_TOOLS.observability.inputTokens,
          outputTokens: SUCCESS_NO_TOOLS.observability.outputTokens,
          toolCallCount: 0,
          durationMs: SUCCESS_NO_TOOLS.observability.durationMs,
        }),
        expect.any(String),
      );
    });

    it('B4: Given a successful LLM response, when the pipeline parses the rubric, then logger.info is called with step: "rubric_parsing"', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'rubric_parsing', orgId: ORG_ID }),
        expect.any(String),
      );
    });

    it('B5: Given a successful rubric persistence, when the pipeline completes, then logger.info is called with step: "rubric_persisted"', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({ step: 'rubric_persisted', orgId: ORG_ID }),
        expect.any(String),
      );
    });
  });

  describe('Structured step logging — failure path', () => {
    it('B6: Given a malformed_response failure, when the pipeline logs the failure, then logger.warn (not logger.error) is called with errorCode: "malformed_response"', async () => {
      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: 'Bad JSON', retryable: false },
      });

      const adminClient = makeMockAdminClientSuccess();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'malformed_response', orgId: ORG_ID }),
        expect.any(String),
      );
    });

    it('B6b: Given a malformed_response failure, when the pipeline logs the failure, then logger.info is NOT used for the failure log', async () => {
      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'malformed_response', message: 'Bad JSON', retryable: false },
      });

      const adminClient = makeMockAdminClientSuccess();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      // info must not have been called with errorCode
      const infoCallsWithErrorCode = mockLoggerInfo.mock.calls.filter(
        ([obj]: [Record<string, unknown>]) => obj?.['errorCode'] !== undefined,
      );
      expect(infoCallsWithErrorCode).toHaveLength(0);
    });

    it('B7: Given a non-malformed pipeline failure (server_error), when the pipeline logs the failure, then logger.error is called with assessmentId and orgId', async () => {
      vi.mocked(generateRubric).mockResolvedValue({
        status: 'generation_failed',
        error: { code: 'server_error', message: 'LLM unreachable', retryable: true },
      });

      const adminClient = makeMockAdminClientSuccess();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      // logger.error is called by triggerRubricGeneration catch block
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: ORG_ID }),
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // D. Service ↔ engine wiring: createFcs → generateRubric request
  // =========================================================================

  describe('Service wiring — onToolCall callback injected into generateRubric request', () => {
    it('D1: Given a valid assessment creation, when generateRubric is called, then the request includes an onToolCall field of type function', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(vi.mocked(generateRubric)).toHaveBeenCalledWith(
        expect.objectContaining({ onToolCall: expect.any(Function) }),
      );
    });

    it('D2: Given the onToolCall callback is invoked by the engine, when it fires with a ToolCallEvent, then logger.info is called with step: "tool_call" and all event fields', async () => {
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_NO_TOOLS);
      const adminClient = makeMockAdminClientSuccess();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      // Capture the onToolCall that was passed to generateRubric
      const callArgs = vi.mocked(generateRubric).mock.calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(typeof callArgs!.onToolCall).toBe('function');

      // Simulate the engine invoking it synchronously
      const event = {
        toolName: 'readFile',
        argumentPath: 'docs/adr/0023.md',
        bytesReturned: 42,
        outcome: 'ok' as const,
        toolCallCount: 1,
      };
      callArgs!.onToolCall!(event);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'tool_call',
          toolName: 'readFile',
          argumentPath: 'docs/adr/0023.md',
          bytesReturned: 42,
          outcome: 'ok',
          toolCallCount: 1,
          orgId: ORG_ID,
        }),
        expect.any(String),
      );
    });
  });
});
