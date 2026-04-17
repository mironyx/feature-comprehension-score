// Tests for persist additional_context_suggestions — Issue #241.
// Covers analytics persistence: service passes suggestions to finalise_rubric_v2
// and handles the undefined/empty-array edge cases correctly.
//
// Mocking pattern copied from service-quality.test.ts — do not introduce a new
// Supabase chain mock; reuse makeChain / makeMockAdminClient.

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

const mockGenerateRubric = vi.fn();
vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: (...args: unknown[]) => mockGenerateRubric(...args),
}));

const mockEvaluateArtefactQuality = vi.fn();
vi.mock('@/lib/engine/quality', () => ({
  evaluateArtefactQuality: (...args: unknown[]) => mockEvaluateArtefactQuality(...args),
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
import { createFcs, type FcsCreateBody } from '@/app/api/fcs/service';
import type { ApiContext } from '@/lib/api/context';
import type { AdditionalContextSuggestion } from '@/lib/engine/llm/schemas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';
const ASSESSMENT_ID = 'b0000000-0000-4000-8000-000000000099';

const SAMPLE_SUGGESTIONS: AdditionalContextSuggestion[] = [
  {
    artefact_type: 'adr',
    description: 'ADR documenting the caching strategy',
    expected_benefit: 'Would clarify the trade-off rationale',
  },
  {
    artefact_type: 'design_doc',
    description: 'High-level design document for the feature',
    expected_benefit: 'Context on architectural constraints',
  },
];

// Rubric result with suggestions present
const RUBRIC_WITH_SUGGESTIONS = {
  status: 'success' as const,
  rubric: {
    questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }],
    additional_context_suggestions: SAMPLE_SUGGESTIONS,
  },
};

// Rubric result where LLM omitted the optional field entirely
const RUBRIC_WITHOUT_SUGGESTIONS_FIELD = {
  status: 'success' as const,
  rubric: {
    questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }],
    // additional_context_suggestions absent — field not present
  },
};

// Rubric result where LLM explicitly returned an empty array
const RUBRIC_WITH_EMPTY_SUGGESTIONS = {
  status: 'success' as const,
  rubric: {
    questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }],
    additional_context_suggestions: [] as AdditionalContextSuggestion[],
  },
};

const SUCCESSFUL_QUALITY_RESULT = {
  status: 'success' as const,
  aggregate: 77,
  dimensions: [
    { key: 'pr_description', sub_score: 80, category: 'detailed', rationale: 'Good' },
    { key: 'linked_issues', sub_score: 90, category: 'detailed', rationale: 'Issues linked' },
    { key: 'design_documents', sub_score: 70, category: 'adequate', rationale: 'Has doc' },
    { key: 'commit_messages', sub_score: 75, category: 'adequate', rationale: 'Clear' },
    { key: 'test_coverage', sub_score: 85, category: 'detailed', rationale: 'Tests present' },
    { key: 'adr_references', sub_score: 60, category: 'minimal', rationale: 'One ADR' },
  ],
};

const FAILED_RUBRIC_RESULT = {
  status: 'generation_failed' as const,
  error: { code: 'unknown_error' as const, message: 'Generation error' },
};

const BODY: FcsCreateBody = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Test Feature',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// Mock client helpers — copied from service-quality.test.ts pattern
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
        return makeChain(() => ({ data: null, error: null }));
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
}

function makeCtx(adminClient: ReturnType<typeof makeMockAdminClient>): ApiContext {
  return {
    supabase: makeMockUserClient() as never,
    adminSupabase: adminClient as never,
    user: { id: USER_ID, email: 'admin@example.com' },
  };
}

// Triggers createFcs and waits for the fire-and-forget rubric generation to settle.
async function triggerAndWait(ctx: ApiContext) {
  await createFcs(ctx, BODY);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// Extracts the args object passed to the first finalise_rubric_v2 RPC call.
function getFinaliseRpcArgs(adminClient: ReturnType<typeof makeMockAdminClient>): Record<string, unknown> | undefined {
  const call = vi.mocked(adminClient.rpc).mock.calls.find(
    ([name]) => name === 'finalise_rubric_v2',
  );
  return call?.[1] as Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Persist additional_context_suggestions — Issue #241', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    mockEvaluateArtefactQuality.mockResolvedValue(SUCCESSFUL_QUALITY_RESULT);
  });

  // Property 1: When LLM returns suggestions, the RPC receives them verbatim.
  describe('Given the LLM returns a non-empty additional_context_suggestions array', () => {
    it('then finalise_rubric_v2 is called with p_additional_context_suggestions equal to that array', async () => {
      mockGenerateRubric.mockResolvedValue(RUBRIC_WITH_SUGGESTIONS);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      const args = getFinaliseRpcArgs(adminClient);
      expect(args).toBeDefined();
      expect(args!['p_additional_context_suggestions']).toEqual(SAMPLE_SUGGESTIONS);
    });
  });

  // Property 2: When LLM omits the optional field entirely, the RPC receives an empty array.
  describe('Given the LLM omits additional_context_suggestions (field absent from response)', () => {
    it('then finalise_rubric_v2 is called with p_additional_context_suggestions equal to []', async () => {
      mockGenerateRubric.mockResolvedValue(RUBRIC_WITHOUT_SUGGESTIONS_FIELD);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      const args = getFinaliseRpcArgs(adminClient);
      expect(args).toBeDefined();
      expect(args!['p_additional_context_suggestions']).toEqual([]);
    });
  });

  // Property 3: When LLM explicitly returns an empty array, the RPC receives an empty array.
  describe('Given the LLM returns an empty additional_context_suggestions array', () => {
    it('then finalise_rubric_v2 is called with p_additional_context_suggestions equal to []', async () => {
      mockGenerateRubric.mockResolvedValue(RUBRIC_WITH_EMPTY_SUGGESTIONS);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      const args = getFinaliseRpcArgs(adminClient);
      expect(args).toBeDefined();
      expect(args!['p_additional_context_suggestions']).toEqual([]);
    });
  });

  // Property 4: The RPC call never omits the p_additional_context_suggestions key on success.
  describe('Given a successful rubric generation', () => {
    it('then finalise_rubric_v2 args always include the p_additional_context_suggestions key', async () => {
      mockGenerateRubric.mockResolvedValue(RUBRIC_WITH_SUGGESTIONS);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      const args = getFinaliseRpcArgs(adminClient);
      expect(args).toBeDefined();
      // The key must be present — even if value is [] — to satisfy the RPC DEFAULT NULL semantic.
      expect(Object.prototype.hasOwnProperty.call(args, 'p_additional_context_suggestions')).toBe(true);
    });
  });

  // Property 5: When rubric generation fails, finalise_rubric_v2 is NOT called
  // (regression guard: suggestions persistence must not interfere with the failure path).
  describe('Given rubric generation fails', () => {
    it('then finalise_rubric_v2 is NOT called and p_additional_context_suggestions is never persisted', async () => {
      mockGenerateRubric.mockResolvedValue(FAILED_RUBRIC_RESULT);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      const call = vi.mocked(adminClient.rpc).mock.calls.find(
        ([name]) => name === 'finalise_rubric_v2',
      );
      expect(call).toBeUndefined();
    });
  });

  // Property 6: Existing quality fields are still passed alongside the new suggestions field
  // (backwards-compatibility / no regression on existing RPC args).
  describe('Given the LLM returns suggestions and the quality evaluator succeeds', () => {
    it('then finalise_rubric_v2 is called with both p_additional_context_suggestions and p_quality_status', async () => {
      mockGenerateRubric.mockResolvedValue(RUBRIC_WITH_SUGGESTIONS);
      const adminClient = makeMockAdminClient();

      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({
          p_additional_context_suggestions: SAMPLE_SUGGESTIONS,
          p_quality_status: 'success',
        }),
      );
    });
  });
});
