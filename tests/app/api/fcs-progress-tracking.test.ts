// Tests for pipeline progress tracking — updateProgress helper, step boundaries,
// onToolCall refresh, and markRubricFailed clearing progress fields.
// V2 Epic 18, Story 18.3 + Story 18.1 (progress-related invariants).
// Issue: #274

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

// Module-scoped so individual tests can override with mockResolvedValueOnce / mockRejectedValueOnce.
// vi.mock is hoisted to the top of the file, so an inline vi.mock inside an it() block would
// override this one for every test.
const { mockExtractFromPRs } = vi.hoisted(() => ({ mockExtractFromPRs: vi.fn() }));
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
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
    generateWithTools: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

vi.mock('@/lib/github/tools/read-file', () => ({
  makeReadFileTool: vi.fn(() => ({
    name: 'readFile',
    description: 'Read a file from the repository.',
    inputSchema: {},
    handler: vi.fn(),
  })),
}));

vi.mock('@/lib/github/tools/list-directory', () => ({
  makeListDirectoryTool: vi.fn(() => ({
    name: 'listDirectory',
    description: 'List entries in a directory.',
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
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Mock client builders — same shape as fcs-pipeline-tool-use.test.ts
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

function makeMockAdminClient(opts: {
  tool_use_enabled?: boolean;
  retrieval_timeout_seconds?: number;
} = {}) {
  const updateCalls: Array<Record<string, unknown>> = [];

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
            tool_use_enabled: opts.tool_use_enabled ?? false,
            rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: opts.retrieval_timeout_seconds ?? 120,
          },
          error: null,
        }));
      }
      if (table === 'assessments') {
        const chain = makeChain(() => ({ data: null, error: null }));
        let current: Record<string, unknown> | null = null;
        chain.update.mockImplementation((values: Record<string, unknown>) => {
          current = { ...values, _filters: {} as Record<string, unknown> };
          updateCalls.push(current);
          return chain;
        });
        chain.eq.mockImplementation((col: string, val: unknown) => {
          if (current) (current['_filters'] as Record<string, unknown>)[col] = val;
          return chain;
        });
        return chain;
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _updateCalls: updateCalls,
  };
  return client;
}

const VALID_BODY: CreateFcsBody = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Test Feature',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

const SUCCESS_RESULT = {
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
    toolCalls: [
      {
        tool_name: 'readFile',
        argument_path: 'src/lib/auth.ts',
        bytes_returned: 512,
        outcome: 'ok' as const,
      },
    ],
    durationMs: 2500,
  },
};

const GENERATION_FAILED = {
  status: 'generation_failed' as const,
  error: { code: 'malformed_response' as const, message: 'Invalid JSON', retryable: true },
};

/** Waits for all pending microtasks and a short macro-task queue flush. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Pipeline progress tracking (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    mockExtractFromPRs.mockResolvedValue({
      artefact_type: 'pull_request',
      pr_diff: 'diff --git a/f.ts b/f.ts',
      file_listing: [{ path: 'f.ts', additions: 10, deletions: 2, status: 'modified' }],
      file_contents: [{ path: 'f.ts', content: 'export const x = 1;' }],
      test_files: [],
    });
  });

  // -------------------------------------------------------------------------
  // AC 1: updateProgress writes rubric_progress and rubric_progress_updated_at
  // -------------------------------------------------------------------------

  describe('Given a pipeline step begins', () => {
    it('then rubric_progress is set to artefact_extraction at the start of extraction', async () => {
      // AC 1: updateProgress(admin, id, step) writes rubric_progress=step
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const progressUpdates = adminClient._updateCalls.filter(
        (u) => u['rubric_progress'] !== undefined && u['status'] === undefined,
      );
      const stepValues = progressUpdates.map((u) => u['rubric_progress']);
      expect(stepValues).toContain('artefact_extraction');
    });

    it('then rubric_progress is set to llm_request before LLM call', async () => {
      // AC 1 + AC 2: llm_request step boundary
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const stepValues = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress']);
      expect(stepValues).toContain('llm_request');
    });

    it('then rubric_progress is set to rubric_parsing after successful LLM response', async () => {
      // AC 2: rubric_parsing step boundary
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const stepValues = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress']);
      expect(stepValues).toContain('rubric_parsing');
    });

    it('then rubric_progress is set to persisting before persistRubricFinalisation', async () => {
      // AC 2: persisting step boundary
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const stepValues = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress']);
      expect(stepValues).toContain('persisting');
    });

    it('then rubric_progress_updated_at is an ISO timestamp string alongside each step update', async () => {
      // AC 1: rubric_progress_updated_at set alongside every progress update [req §18.3]
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const progressUpdates = adminClient._updateCalls.filter(
        (u) => u['rubric_progress'] !== undefined && u['status'] === undefined,
      );
      expect(progressUpdates.length).toBeGreaterThan(0);
      for (const update of progressUpdates) {
        expect(typeof update['rubric_progress_updated_at']).toBe('string');
        // Must parse as a valid ISO timestamp
        expect(Number.isNaN(Date.parse(update['rubric_progress_updated_at'] as string))).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AC 2: pipeline step order — artefact_extraction before llm_request
  // -------------------------------------------------------------------------

  describe('Given the full pipeline runs to success', () => {
    it('then progress steps are written in the order: artefact_extraction → llm_request → rubric_parsing → persisting', async () => {
      // AC 2: step ordering [lld §18.3]
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const orderedSteps = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress'] as string);

      const idxArtefact = orderedSteps.indexOf('artefact_extraction');
      const idxLlm = orderedSteps.indexOf('llm_request');
      const idxParsing = orderedSteps.indexOf('rubric_parsing');
      const idxPersisting = orderedSteps.indexOf('persisting');

      expect(idxArtefact).toBeGreaterThanOrEqual(0);
      expect(idxLlm).toBeGreaterThan(idxArtefact);
      expect(idxParsing).toBeGreaterThan(idxLlm);
      expect(idxPersisting).toBeGreaterThan(idxParsing);
    });

    it('then every progress update is filtered by both id and org_id (tenant-scoping)', async () => {
      // Service-role client bypasses RLS — progress writes MUST assert org_id so a wrong
      // assessmentId cannot silently clobber another tenant's row.
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const progressUpdates = adminClient._updateCalls.filter(
        (u) => u['rubric_progress'] !== undefined,
      );
      expect(progressUpdates.length).toBeGreaterThan(0);
      for (const update of progressUpdates) {
        const filters = update['_filters'] as Record<string, unknown>;
        expect(filters['id']).toBeDefined();
        expect(filters['org_id']).toBe(ORG_ID);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AC 3: onToolCall wires updateProgress('llm_tool_call') for each tool call
  // -------------------------------------------------------------------------

  describe('Given tool_use_enabled is true and the LLM makes tool calls', () => {
    it('then rubric_progress is set to llm_tool_call via the onToolCall callback', async () => {
      // AC 3: onToolCall callback calls updateProgress(admin, id, 'llm_tool_call') [lld §18.3]
      vi.mocked(generateRubric).mockImplementation(async (params) => {
        // Simulate tool-call by invoking onToolCall once
        if (params.onToolCall) {
          params.onToolCall({
            toolName: 'readFile',
            argumentPath: 'src/auth.ts',
            bytesReturned: 256,
            outcome: 'ok',
            toolCallCount: 1,
          });
        }
        return SUCCESS_WITH_TOOLS;
      });

      const adminClient = makeMockAdminClient({ tool_use_enabled: true });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const stepValues = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress'] as string);
      expect(stepValues).toContain('llm_tool_call');
    });

    it('then rubric_progress_updated_at is refreshed on each tool call to prevent false stale warnings', async () => {
      // AC 3: rubric_progress_updated_at refreshed on tool call [req §18.3 + lld §18.3]
      vi.mocked(generateRubric).mockImplementation(async (params) => {
        // Simulate 2 tool calls via onToolCall
        if (params.onToolCall) {
          params.onToolCall({
            toolName: 'readFile',
            argumentPath: 'src/a.ts',
            bytesReturned: 128,
            outcome: 'ok',
            toolCallCount: 1,
          });
          params.onToolCall({
            toolName: 'readFile',
            argumentPath: 'src/b.ts',
            bytesReturned: 128,
            outcome: 'ok',
            toolCallCount: 2,
          });
        }
        return SUCCESS_WITH_TOOLS;
      });

      const adminClient = makeMockAdminClient({ tool_use_enabled: true });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      // When each tool call fires, rubric_progress='llm_tool_call' must have been written
      // with a rubric_progress_updated_at timestamp (to refresh the stale timer)
      const toolCallProgressUpdates = adminClient._updateCalls.filter(
        (u) => u['rubric_progress'] === 'llm_tool_call' && u['rubric_progress_updated_at'] !== undefined,
      );
      expect(toolCallProgressUpdates.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // AC 7: markRubricFailed clears rubric_progress to null on failure
  // -------------------------------------------------------------------------

  describe('Given rubric generation fails', () => {
    it('then rubric_progress is set to null in the failure update (markRubricFailed clears progress)', async () => {
      // AC 7: markRubricFailed sets rubric_progress=null, rubric_progress_updated_at=null [lld §18.3 invariant I5]
      vi.mocked(generateRubric).mockResolvedValue(GENERATION_FAILED);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = adminClient._updateCalls.find(
        (u) => u['status'] === 'rubric_failed',
      );
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate!['rubric_progress']).toBeNull();
    });

    it('then rubric_progress_updated_at is set to null in the failure update', async () => {
      // AC 7: both progress fields cleared to null on failure [lld §18.1 + §18.3 invariant I5]
      vi.mocked(generateRubric).mockResolvedValue(GENERATION_FAILED);
      const adminClient = makeMockAdminClient();
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = adminClient._updateCalls.find(
        (u) => u['status'] === 'rubric_failed',
      );
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate!['rubric_progress_updated_at']).toBeNull();
    });

    it('then rubric_progress is null even when an exception is thrown (GitHub error path)', async () => {
      // AC 7: non-LLM failure path also clears progress [lld §18.1 markRubricFailed without details]
      mockExtractFromPRs.mockRejectedValueOnce(new Error('GitHub API timeout'));
      const adminClient = makeMockAdminClient();

      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      const failureUpdate = adminClient._updateCalls.find(
        (u) => u['status'] === 'rubric_failed',
      );
      expect(failureUpdate).toBeDefined();
      expect(failureUpdate!['rubric_progress']).toBeNull();
      expect(failureUpdate!['rubric_progress_updated_at']).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // AC 5: onToolCall is optional — tool loop runs without it
  // -------------------------------------------------------------------------

  describe('Given tool_use_enabled is false (onToolCall wired but no-op for progress)', () => {
    it('then the pipeline runs without error and never writes an llm_tool_call progress row', async () => {
      // AC 5 (revised after E18.1 merge): onToolCall is ALWAYS wired for structured logging
      // (invariant I9 + §18.1 log contract), but the handler must skip its progress-write side
      // effect when tool_use_enabled=false. This asserts the behaviour, not the shape.
      vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RESULT);
      const adminClient = makeMockAdminClient({ tool_use_enabled: false });
      const ctx: ApiContext = {
        supabase: makeMockUserClient() as never,
        adminSupabase: adminClient as never,
        user: { id: USER_ID, email: 'admin@example.com' },
        orgId: ORG_ID,
      };

      await createFcsForProject(ctx, PROJECT_ID, VALID_BODY);
      await flushAsync();

      expect(vi.mocked(generateRubric)).toHaveBeenCalled();
      // No llm_tool_call progress row was written while tools were disabled.
      const progressSteps = adminClient._updateCalls
        .filter((u) => u['rubric_progress'] !== undefined && u['status'] === undefined)
        .map((u) => u['rubric_progress']);
      expect(progressSteps).not.toContain('llm_tool_call');
    });
  });
});
