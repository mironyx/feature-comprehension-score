/**
 * Adversarial evaluation tests for issue #330 — surface truncation details on results.
 *
 * Gap found: AC-2 [req §1.3] states that when rubric generation completes, then
 * `token_budget_applied` and `truncation_notes` are persisted from the
 * `AssembledArtefactSet` via the `finalise_rubric` RPC.
 *
 * The test-author file (tests/components/truncation-details-card.test.ts) covers
 * the UI rendering contract. The fcs-service-truncation.test.ts file verifies
 * that the log payload carries the correct values. However, neither file asserts
 * that the `finalise_rubric` RPC call actually receives `p_token_budget_applied`
 * and `p_truncation_notes` — the persistence wiring is unverified.
 *
 * Both tests below exercise this structural property through the public `createFcs`
 * interface (the same surface used by fcs-service-truncation.test.ts).
 *
 * Gap classification: test-author missed a structural property clearly in the spec
 * (process signal).
 *
 * Fixture note: this file duplicates ~35 lines of mock setup from
 * fcs-service-truncation.test.ts because `makeMockAdminClient()` there is
 * module-scoped and creates the `rpc` spy internally, making it impossible to
 * capture for assertion. The variation here exposes the `rpc` spy externally.
 * If the fixture grows, extract to tests/fixtures/fcs-service-mocks.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports (vitest hoist requirement)
// ---------------------------------------------------------------------------

const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
    child: vi.fn(() => ({ info: mockLoggerInfo, error: mockLoggerError })),
  },
}));

vi.mock('@/lib/api/errors', () => ({
  ApiError: class ApiError extends Error {
    constructor(public statusCode: number, message: string) { super(message); }
  },
}));

vi.mock('@/lib/github/client', () => ({ createGithubClient: vi.fn() }));
vi.mock('@/lib/github/app-auth', () => ({ createAppAuthClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const mockExtractFromPRs = vi.fn();
const mockDiscoverLinkedPRs = vi.fn().mockResolvedValue([]);
const mockFetchIssueContent = vi.fn().mockResolvedValue([]);
const mockDiscoverChildIssues = vi.fn().mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    extractFromPRs = mockExtractFromPRs;
    discoverLinkedPRs = mockDiscoverLinkedPRs;
    fetchIssueContent = mockFetchIssueContent;
    discoverChildIssues = mockDiscoverChildIssues;
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn().mockResolvedValue({
    status: 'success',
    rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
    observability: { inputTokens: 100, outputTokens: 50, toolCalls: [], durationMs: 1 },
  }),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

const mockGetModelContextLimit = vi.fn().mockResolvedValue(1_000_000);
vi.mock('@/lib/openrouter/model-limits', () => ({
  getModelContextLimit: (...args: unknown[]) => mockGetModelContextLimit(...args),
  getConfiguredModelId: vi.fn().mockReturnValue('test-model/v1'),
  DEFAULT_CONTEXT_LIMIT: 130_000,
}));

vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: vi.fn().mockResolvedValue({
    tool_use_enabled: false,
    rubric_cost_cap_cents: 20,
    retrieval_timeout_seconds: 120,
  }),
  DEFAULT_RETRIEVAL_SETTINGS: {
    tool_use_enabled: false,
    rubric_cost_cap_cents: 20,
    retrieval_timeout_seconds: 120,
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
import { createFcsForProject } from '@/app/api/projects/[id]/assessments/service';
import { type CreateFcsBody } from '@/app/api/projects/[id]/assessments/validation';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

/** Artefact set that exceeds a tiny token budget (1_250 * 0.8 = 1_000 tokens). */
const LARGE_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  pr_diff: 'x'.repeat(400_000),
  file_listing: [{ path: 'a.ts', additions: 10, deletions: 5, status: 'modified' }],
  file_contents: [{ path: 'a.ts', content: 'x'.repeat(200_000) }],
  test_files: [],
};

/** Artefact set that fits within any reasonable budget. */
const SMALL_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  pr_diff: 'diff --git a/f.ts\n+const x = 1;',
  file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
  file_contents: [{ path: 'f.ts', content: 'export const x = 1;' }],
  test_files: [],
};

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(),
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
    pulls: { get: vi.fn().mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } }) },
    users: { getByUsername: vi.fn().mockResolvedValue({ data: { id: 99001, login: 'alice' } }) },
    issues: { get: vi.fn().mockResolvedValue({ data: { number: 101, title: 'Epic', body: 'body', pull_request: undefined } }) },
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
 * Variant of makeMockAdminClient that exposes the rpc spy so tests can assert
 * what parameters were passed to finalise_rubric.
 */
function makeMockAdminClientWithRpcSpy() {
  const rpcSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const adminClient = {
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
            enforcement_mode: 'soft', score_threshold: 70,
            fcs_question_count: 5, min_pr_size: 20,
            tool_use_enabled: false, rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: 120,
          },
          error: null,
        }));
      }
      return makeChain(() => ({ data: null, error: null }));
    }),
    rpc: rpcSpy,
  };
  return { adminClient, rpcSpy };
}

async function runCreateFcsWithSpy(bodyOverrides: Partial<CreateFcsBody> = {}) {
  const { adminClient, rpcSpy } = makeMockAdminClientWithRpcSpy();
  const ctx: ApiContext = {
    supabase: makeMockUserClient() as never,
    adminSupabase: adminClient as never,
    user: { id: USER_ID, email: 'admin@example.com' },
    orgId: ORG_ID,
  };
  const body: CreateFcsBody = {
    org_id: ORG_ID,
    repository_id: REPO_ID,
    feature_name: 'Test Feature',
    merged_pr_numbers: [42],
    participants: [{ github_username: 'alice' }],
    ...bodyOverrides,
  };
  await createFcsForProject(ctx, PROJECT_ID, body);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { rpcSpy };
}

// ---------------------------------------------------------------------------
// Adversarial tests — AC-2 [req §1.3] persistence wiring
// "When rubric generation completes, then token_budget_applied and truncation_notes
//  are persisted from the AssembledArtefactSet."
// ---------------------------------------------------------------------------

describe('persistRubricFinalisation — AC-2 truncation persistence wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  });

  describe('Given an artefact set that exceeds the token budget (truncation occurs)', () => {
    it('should call finalise_rubric with p_token_budget_applied = true', async () => {
      // [req §1.3 AC-2, lld §1.3] token_budget_applied persisted as true when truncation fires
      mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_250); // budget = 1_000 → truncation fires

      const { rpcSpy } = await runCreateFcsWithSpy();

      const finaliseCall = rpcSpy.mock.calls.find(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      expect(finaliseCall).toBeDefined();
      const params = finaliseCall![1] as Record<string, unknown>;
      expect(params).toHaveProperty('p_token_budget_applied', true);
    });

    it('should call finalise_rubric with p_truncation_notes as a non-empty array', async () => {
      // [req §1.3 AC-2, lld §1.3] truncation_notes persisted when truncation fires
      mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_250);

      const { rpcSpy } = await runCreateFcsWithSpy();

      const finaliseCall = rpcSpy.mock.calls.find(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      expect(finaliseCall).toBeDefined();
      const params = finaliseCall![1] as Record<string, unknown>;
      expect(Array.isArray(params['p_truncation_notes'])).toBe(true);
      expect((params['p_truncation_notes'] as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('Given an artefact set that fits within the token budget (no truncation)', () => {
    it('should call finalise_rubric with p_token_budget_applied = false', async () => {
      // [req §1.3 AC-2] token_budget_applied persisted as false when no truncation
      mockExtractFromPRs.mockResolvedValue(SMALL_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_000_000); // generous budget

      const { rpcSpy } = await runCreateFcsWithSpy();

      const finaliseCall = rpcSpy.mock.calls.find(
        ([name]: [string]) => name === 'finalise_rubric',
      );
      expect(finaliseCall).toBeDefined();
      const params = finaliseCall![1] as Record<string, unknown>;
      expect(params).toHaveProperty('p_token_budget_applied', false);
    });
  });
});
