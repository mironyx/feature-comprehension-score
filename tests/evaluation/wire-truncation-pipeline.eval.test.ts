/**
 * Adversarial evaluation tests for issue #329 — wire truncation into artefact pipeline.
 *
 * Gap found: AC-6 [req §1.2] states that when the artefact summary log is emitted after
 * truncation, it must include the computed `tokenBudget` AND the model `contextLimit`
 * that drove it. The test-author's file verifies `tokenBudgetApplied` and
 * `truncationNotes`, but neither the implementation nor any test asserts that
 * `tokenBudget` or `contextLimit` appear in the log payload.
 *
 * Reference: v5-requirements.md §Story 1.2 AC-6:
 *   "Given truncation is applied, when the artefact summary log is emitted, then it
 *    includes tokenBudgetApplied: true, the truncation_notes array, the computed
 *    tokenBudget, and the model contextLimit that drove it."
 *
 * Both tests below are expected to FAIL. They are findings — the implementation
 * does not pass these fields through to logArtefactSummary.
 *
 * Do NOT fix the implementation here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports (same pattern as fcs-service-truncation.test.ts)
// ---------------------------------------------------------------------------

const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: vi.fn(),
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
    observability: { inputTokens: 100, outputTokens: 50, toolCalls: [], durationMs: 200 },
  }),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

const mockGetModelContextLimit = vi.fn().mockResolvedValue(1_250);
vi.mock('@/lib/openrouter/model-limits', () => ({
  getModelContextLimit: (...args: unknown[]) => mockGetModelContextLimit(...args),
  getConfiguredModelId: vi.fn().mockReturnValue('test-model/v1'),
  DEFAULT_CONTEXT_LIMIT: 130_000,
}));

const mockLoadOrgRetrievalSettings = vi.fn().mockResolvedValue({
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
});
vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: (...args: unknown[]) => mockLoadOrgRetrievalSettings(...args),
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
import { createFcs, type FcsCreateBody } from '@/lib/api/fcs-pipeline';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Fixtures — reused from fcs-service-truncation.test.ts
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

/** Artefact set that exceeds a tiny token budget so truncation fires. */
const LARGE_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  pr_diff: 'x'.repeat(400_000),
  file_listing: [
    { path: 'a.ts', additions: 10, deletions: 5, status: 'modified' },
  ],
  file_contents: [
    { path: 'a.ts', content: 'x'.repeat(200_000) },
  ],
  test_files: [],
};

// ---------------------------------------------------------------------------
// Mock client builders — same pattern as fcs-service-truncation.test.ts
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

function makeMockUserClient() {
  return {
    from: vi.fn(() =>
      makeChain(() => ({ data: [{ github_role: 'admin' }], error: null })),
    ),
  };
}

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
  await new Promise((resolve) => setTimeout(resolve, 200));
}

function getArtefactSummaryPayload(): Record<string, unknown> | undefined {
  for (const call of mockLoggerInfo.mock.calls) {
    if (call[1] === 'Rubric generation: artefact summary') {
      return call[0] as Record<string, unknown>;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Adversarial tests — AC-6 gap
// [req §1.2 AC-6] log must include tokenBudget and contextLimit when truncation fires
// ---------------------------------------------------------------------------

describe('logArtefactSummary — AC-6 missing fields (gap findings)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
    // 1_250 * 0.8 = 1_000 token budget — large artefact always exceeds it
    mockGetModelContextLimit.mockResolvedValue(1_250);
    mockLoadOrgRetrievalSettings.mockResolvedValue({
      tool_use_enabled: false,
      rubric_cost_cap_cents: 20,
      retrieval_timeout_seconds: 120,
    });
  });

  it('should include the computed tokenBudget in the artefact summary log when truncation occurs', async () => {
    // [req §1.2 AC-6] "includes ... the computed tokenBudget"
    // tokenBudget = Math.floor(1_250 * 0.8) = 1_000
    // FINDING: logArtefactSummary only receives AssembledArtefactSet, which does not
    // carry tokenBudget. The implementation does not log this field.
    await runCreateFcs();

    const payload = getArtefactSummaryPayload();
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty('tokenBudget');
    expect(payload?.tokenBudget).toBe(1_000);
  });

  it('should include the model contextLimit in the artefact summary log when truncation occurs', async () => {
    // [req §1.2 AC-6] "includes ... the model contextLimit that drove it"
    // contextLimit = 1_250 (from mockGetModelContextLimit)
    // FINDING: logArtefactSummary only receives AssembledArtefactSet, which does not
    // carry contextLimit. The implementation does not log this field.
    await runCreateFcs();

    const payload = getArtefactSummaryPayload();
    expect(payload).toBeDefined();
    expect(payload).toHaveProperty('contextLimit');
    expect(payload?.contextLimit).toBe(1_250);
  });
});
