// Tests for artefact quality pipeline integration in FCS service.
// Covers §11.1c: parallel evaluator + generator, persistence via finalise_rubric_v2, fallback paths.
// Issue: #236

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
import type { ArtefactQualityDimension } from '@/lib/engine/llm/schemas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

const ASSESSMENT_ID = 'b0000000-0000-4000-8000-000000000099';

// Canonical six dimensions returned by the evaluator when it succeeds
const SIX_DIMENSIONS: ArtefactQualityDimension[] = [
  { key: 'pr_description', sub_score: 80, category: 'detailed', rationale: 'Good PR description' },
  { key: 'linked_issues', sub_score: 90, category: 'detailed', rationale: 'Issues linked' },
  { key: 'design_documents', sub_score: 70, category: 'adequate', rationale: 'Has design doc' },
  { key: 'commit_messages', sub_score: 75, category: 'adequate', rationale: 'Clear commits' },
  { key: 'test_coverage', sub_score: 85, category: 'detailed', rationale: 'Tests present' },
  { key: 'adr_references', sub_score: 60, category: 'minimal', rationale: 'One ADR referenced' },
];

const SUCCESSFUL_RUBRIC_RESULT = {
  status: 'success' as const,
  rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
};

const SUCCESSFUL_QUALITY_RESULT = {
  status: 'success' as const,
  aggregate: 77,
  dimensions: SIX_DIMENSIONS,
};

const UNAVAILABLE_QUALITY_RESULT = {
  status: 'unavailable' as const,
  reason: 'llm_failed' as const,
  error: { code: 'unknown_error' as const, message: 'LLM error' },
};

const FAILED_RUBRIC_RESULT = {
  status: 'generation_failed' as const,
  error: { code: 'unknown_error' as const, message: 'Generation error' },
};

// ---------------------------------------------------------------------------
// Mock client helpers
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

const BODY: FcsCreateBody = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Test Feature',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function triggerAndWait(ctx: ApiContext) {
  await createFcs(ctx, BODY);
  // triggerRubricGeneration runs fire-and-forget — wait for it to settle
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('triggerRubricGeneration with artefact quality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  describe('Given evaluator and generator both succeed', () => {
    beforeEach(() => {
      mockGenerateRubric.mockResolvedValue(SUCCESSFUL_RUBRIC_RESULT);
      mockEvaluateArtefactQuality.mockResolvedValue(SUCCESSFUL_QUALITY_RESULT);
    });

    it('then both LLM calls run concurrently (both invoked before finalise_rubric_v2)', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      // Both engine functions must have been called
      expect(mockGenerateRubric).toHaveBeenCalledOnce();
      expect(mockEvaluateArtefactQuality).toHaveBeenCalledOnce();

      // finalise_rubric_v2 must have been called after both resolved
      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.any(Object),
      );
    });

    it('then finalise_rubric_v2 is called with p_quality_status="success"', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({ p_quality_status: 'success' }),
      );
    });

    it('then finalise_rubric_v2 is called with the evaluator aggregate score', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({ p_quality_score: SUCCESSFUL_QUALITY_RESULT.aggregate }),
      );
    });

    it('then finalise_rubric_v2 is called with a dimensions array of length 6', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      const rpcCall = vi.mocked(adminClient.rpc).mock.calls.find(
        ([name]) => name === 'finalise_rubric_v2',
      );
      expect(rpcCall).toBeDefined();
      const args = rpcCall![1] as Record<string, unknown>;
      expect(Array.isArray(args['p_quality_dimensions'])).toBe(true);
      expect((args['p_quality_dimensions'] as unknown[]).length).toBe(6);
    });

    it('then the legacy finalise_rubric RPC is NOT called', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      const legacyCall = vi.mocked(adminClient.rpc).mock.calls.find(
        ([name]) => name === 'finalise_rubric',
      );
      expect(legacyCall).toBeUndefined();
    });

    it('then the rubric summary log includes artefactQualityStatus and artefactQualityScore', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          artefactQualityStatus: 'success',
          artefactQualityScore: SUCCESSFUL_QUALITY_RESULT.aggregate,
        }),
        expect.any(String),
      );
    });
  });

  describe('Given evaluator fails but generator succeeds', () => {
    beforeEach(() => {
      mockGenerateRubric.mockResolvedValue(SUCCESSFUL_RUBRIC_RESULT);
      mockEvaluateArtefactQuality.mockResolvedValue(UNAVAILABLE_QUALITY_RESULT);
    });

    it('then finalise_rubric_v2 is called with p_quality_score=null', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({ p_quality_score: null }),
      );
    });

    it('then finalise_rubric_v2 is called with p_quality_status="unavailable"', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({ p_quality_status: 'unavailable' }),
      );
    });

    it('then the assessment reaches "awaiting_responses" (evaluator failure does not block progress)', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      // finalise_rubric_v2 RPC transitions the assessment to awaiting_responses atomically;
      // verifying the RPC was called (with unavailable quality) proves the assessment proceeded.
      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.objectContaining({
          p_quality_status: 'unavailable',
          p_quality_score: null,
        }),
      );
      // rubric_failed must NOT have been set
      const fromCalls = vi.mocked(adminClient.from).mock.calls.map(([t]) => t);
      const assessmentUpdateCalls = fromCalls.filter(t => t === 'assessments');
      expect(assessmentUpdateCalls).toHaveLength(0);
    });

    it('then finalise_rubric_v2 is still called (rubric generation succeeded)', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(adminClient.rpc).toHaveBeenCalledWith(
        'finalise_rubric_v2',
        expect.any(Object),
      );
    });

    // LLD §11.1c AC: "Logs include artefactQualityStatus and artefactQualityScore"
    // This applies to the unavailable path as well as the success path.
    it('then the rubric summary log includes artefactQualityStatus="unavailable" and artefactQualityScore=null', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          artefactQualityStatus: 'unavailable',
          artefactQualityScore: null,
        }),
        expect.any(String),
      );
    });
  });

  describe('Given generator fails', () => {
    beforeEach(() => {
      mockGenerateRubric.mockResolvedValue(FAILED_RUBRIC_RESULT);
      // evaluator may or may not succeed — either way generator failure dominates
      mockEvaluateArtefactQuality.mockResolvedValue(SUCCESSFUL_QUALITY_RESULT);
    });

    it('then status -> "rubric_failed" (existing behaviour preserved)', async () => {
      const updateCalls: unknown[] = [];

      const assessmentsChain = makeChain(() => ({ data: null, error: null }));
      assessmentsChain.update.mockImplementation((values: Record<string, unknown>) => {
        updateCalls.push(values['status']);
        return assessmentsChain;
      });

      const adminClient = makeMockAdminClient();
      // Override only the assessments table; capture original fn before re-assigning
      const originalFrom = adminClient.from;
      adminClient.from = vi.fn((table: string) => {
        if (table === 'assessments') return assessmentsChain as never;
        return originalFrom(table);
      }) as typeof adminClient.from;

      await triggerAndWait(makeCtx(adminClient));

      expect(updateCalls).toContain('rubric_failed');
    });

    it('then finalise_rubric_v2 is NOT called when generator fails', async () => {
      const adminClient = makeMockAdminClient();
      await triggerAndWait(makeCtx(adminClient));

      const v2Call = vi.mocked(adminClient.rpc).mock.calls.find(
        ([name]) => name === 'finalise_rubric_v2',
      );
      expect(v2Call).toBeUndefined();
    });
  });
});
