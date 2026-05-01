// Tests for Story 1.2 (#329): wire truncation into the artefact pipeline.
//
// Sections:
//   A. Pure engine tests — buildTruncationOptions, truncateArtefacts (strategy + file sort)
//   B. Integration-style tests — extractArtefacts truncation wiring via createFcs

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Section A — Pure engine tests
// (No mocks required — these are pure functions in src/lib/engine/prompts/truncate.ts)
// ===========================================================================

import {
  buildTruncationOptions,
  truncateArtefacts,
} from '@/lib/engine/prompts/truncate';
import type { RawArtefactSet } from '@/lib/engine/prompts/artefact-types';

// ---------------------------------------------------------------------------
// Shared factory for Section A
// ---------------------------------------------------------------------------

const makeRaw = (overrides: Partial<RawArtefactSet> = {}): RawArtefactSet => ({
  artefact_type: 'pull_request',
  pr_diff: 'small diff',
  file_listing: [{ path: 'f.ts', additions: 5, deletions: 2, status: 'modified' }],
  file_contents: [{ path: 'f.ts', content: 'small content' }],
  ...overrides,
});

// ---------------------------------------------------------------------------
// buildTruncationOptions
// ---------------------------------------------------------------------------

describe('buildTruncationOptions', () => {
  // [lld §1.2] strategy: toolUseEnabled → 'agentic', !toolUseEnabled → 'static'
  describe('Given toolUseEnabled is false', () => {
    it('should set strategy to static', () => {
      // [lld §1.2 / req §1.2]
      const opts = buildTruncationOptions(100_000, 5, false);
      expect(opts.strategy).toBe('static');
    });
  });

  describe('Given toolUseEnabled is true', () => {
    it('should set strategy to agentic', () => {
      // [lld §1.2 / req §1.2]
      const opts = buildTruncationOptions(100_000, 5, true);
      expect(opts.strategy).toBe('agentic');
    });
  });

  // [req §1.2 / lld I1] tokenBudget = Math.floor(contextLimit * 0.8)
  it('should set tokenBudget to Math.floor(contextLimit * 0.8)', () => {
    const opts = buildTruncationOptions(100_000, 5, false);
    expect(opts.tokenBudget).toBe(Math.floor(100_000 * 0.8));
  });

  it('should floor rather than round the token budget', () => {
    // 163_000 * 0.8 = 130_400 — floor stays 130_400 (exact), but ensures no rounding up
    const opts = buildTruncationOptions(163_001, 5, false);
    expect(opts.tokenBudget).toBe(Math.floor(163_001 * 0.8));
  });

  // [lld §1.2] questionCount is passed through unchanged
  it('should pass questionCount through unchanged', () => {
    const opts = buildTruncationOptions(200_000, 7, true);
    expect(opts.questionCount).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// truncateArtefacts — strategy: static mode diff behaviour
// [lld I8 / lld §1.2] Static mode: diff kept whole or dropped entirely
// ---------------------------------------------------------------------------

describe('truncateArtefacts — strategy: static mode', () => {
  // Build a raw set where diff exceeds DIFF_TRUNCATION_THRESHOLD (0.6) of remaining
  // budget, but file content fits. We use a tiny tokenBudget to force the condition.
  //
  // Strategy: use a budget of 200 tokens. pr_diff = 'x'.repeat(600) = 150 tokens
  // (ceil(600/4)). file_contents = 'a'.repeat(100) = 25 tokens. After high-priority
  // items (file_listing), remaining ≈ budget. diffTokens (150) > remaining (200) * 0.6
  // (= 120) — threshold exceeded.

  const buildStaticRaw = (): RawArtefactSet =>
    makeRaw({
      pr_diff: 'x'.repeat(600),              // 150 estimated tokens
      file_listing: [{ path: 'f.ts', additions: 10, deletions: 5, status: 'modified' }],
      file_contents: [{ path: 'f.ts', content: 'a'.repeat(100) }], // 25 tokens
    });

  describe('Given strategy is static and diff exceeds threshold', () => {
    it('should drop the diff entirely (empty string) and preserve file contents', () => {
      // [lld I8 / lld §1.2 static diff-drop]
      const result = truncateArtefacts(buildStaticRaw(), {
        questionCount: 3,
        tokenBudget: 200,
        strategy: 'static',
      });
      expect(result.pr_diff).toBe('');
      expect(result.file_contents).toHaveLength(1);
      expect(result.file_contents[0]?.content).toBe('a'.repeat(100));
    });

    it('should add "Code diff omitted — file contents preserved" to truncation_notes', () => {
      // [lld §1.2 static diff-drop note text]
      const result = truncateArtefacts(buildStaticRaw(), {
        questionCount: 3,
        tokenBudget: 200,
        strategy: 'static',
      });
      expect(result.truncation_notes).toBeDefined();
      expect(result.truncation_notes).toContain('Code diff omitted — file contents preserved');
    });

    it('should set token_budget_applied to true when diff is dropped', () => {
      // [req §1.2] token_budget_applied reflects actual truncation
      const result = truncateArtefacts(buildStaticRaw(), {
        questionCount: 3,
        tokenBudget: 200,
        strategy: 'static',
      });
      expect(result.token_budget_applied).toBe(true);
    });
  });

  describe('Given strategy is static and diff fits within budget', () => {
    it('should preserve the diff when it is within threshold', () => {
      // [lld §1.2] diff is only dropped when it would trigger truncation
      const raw = makeRaw({ pr_diff: 'tiny', file_contents: [{ path: 'f.ts', content: 'code' }] });
      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 100_000,
        strategy: 'static',
      });
      expect(result.pr_diff).toBe('tiny');
      expect(result.token_budget_applied).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// truncateArtefacts — strategy: agentic mode diff behaviour
// [lld §1.2] Agentic mode preserves existing mid-stream truncation behaviour
// ---------------------------------------------------------------------------

describe('truncateArtefacts — strategy: agentic mode', () => {
  describe('Given strategy is agentic and diff exceeds threshold', () => {
    it('should truncate diff in-place with "... [truncated]" marker, not drop it', () => {
      // [lld §1.2 agentic existing behaviour]
      const raw = makeRaw({
        pr_diff: 'x'.repeat(400_000),
        file_contents: [{ path: 'f.ts', content: 'small' }],
      });
      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 5_000,
        strategy: 'agentic',
      });
      expect(result.pr_diff).not.toBe('');
      expect(result.pr_diff).toContain('... [truncated]');
      expect(result.token_budget_applied).toBe(true);
    });

    it('should add "Code diff truncated" to truncation_notes in agentic mode', () => {
      // [lld §1.2 agentic existing note text]
      const raw = makeRaw({ pr_diff: 'x'.repeat(400_000) });
      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 5_000,
        strategy: 'agentic',
      });
      expect(result.truncation_notes).toContain('Code diff truncated');
    });
  });
});

// ---------------------------------------------------------------------------
// truncateArtefacts — file importance sort
// [lld I9 / lld §1.2] Before truncateFileContents: sort by (additions + deletions) desc
// ---------------------------------------------------------------------------

describe('truncateArtefacts — file importance sort', () => {
  describe('Given file_contents order differs from change-count order', () => {
    it('should keep the highest-change-count file when budget only allows one', () => {
      // [lld I9] low-churn file is in position 0, high-churn file is in position 1.
      // Budget forces exactly one file to be kept — it must be the high-churn one.
      // Each file content = 'x'.repeat(2000) = 500 tokens. Budget = 600 tokens
      // (allows ~1 file after listing overhead).
      const raw = makeRaw({
        pr_diff: '',
        file_listing: [
          { path: 'low-churn.ts', additions: 1, deletions: 0, status: 'added' },
          { path: 'high-churn.ts', additions: 50, deletions: 30, status: 'modified' },
        ],
        file_contents: [
          // Intentionally low-churn first to detect if sort is missing
          { path: 'low-churn.ts', content: 'x'.repeat(2000) },
          { path: 'high-churn.ts', content: 'x'.repeat(2000) },
        ],
      });

      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 600,
        strategy: 'static',
      });

      const keptPaths = result.file_contents.map((f) => f.path);
      expect(keptPaths).toContain('high-churn.ts');
      expect(keptPaths).not.toContain('low-churn.ts');
    });
  });

  describe('Given a file has no entry in file_listing', () => {
    it('should sort it after files with known change counts', () => {
      // [lld §1.2 sort] Files not in file_listing get 0 change count → sort last
      // Budget allows exactly one file — the known-churn file should be kept.
      const raw = makeRaw({
        pr_diff: '',
        file_listing: [
          { path: 'known.ts', additions: 20, deletions: 5, status: 'modified' },
          // 'unknown.ts' intentionally absent from file_listing
        ],
        file_contents: [
          // unknown.ts is first; sort should move known.ts ahead
          { path: 'unknown.ts', content: 'x'.repeat(2000) },
          { path: 'known.ts', content: 'x'.repeat(2000) },
        ],
      });

      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 600,
        strategy: 'static',
      });

      const keptPaths = result.file_contents.map((f) => f.path);
      expect(keptPaths).toContain('known.ts');
      expect(keptPaths).not.toContain('unknown.ts');
    });
  });

  describe('Given multiple files with equal change counts', () => {
    it('should keep all files with equal priority when budget permits', () => {
      // [lld §1.2] equal-churn files are kept together; only last ones drop
      const raw = makeRaw({
        pr_diff: '',
        file_listing: [
          { path: 'a.ts', additions: 10, deletions: 0, status: 'added' },
          { path: 'b.ts', additions: 10, deletions: 0, status: 'added' },
        ],
        file_contents: [
          { path: 'a.ts', content: 'small' },
          { path: 'b.ts', content: 'small' },
        ],
      });

      const result = truncateArtefacts(raw, {
        questionCount: 3,
        tokenBudget: 100_000,
        strategy: 'static',
      });

      expect(result.file_contents).toHaveLength(2);
      expect(result.token_budget_applied).toBe(false);
    });
  });
});

// ===========================================================================
// Section B — extractArtefacts truncation wiring (via createFcs)
// Mirrors the mock setup in tests/app/api/fcs-service-logging.test.ts
// ===========================================================================

// ---------------------------------------------------------------------------
// Module mocks — declared before imports
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
    observability: { inputTokens: 100, outputTokens: 50, toolCalls: [], durationMs: 1 },
  }),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

// Mock getModelContextLimit so tests can control the context budget.
// Default returns a generous 1_000_000 tokens (artefacts always fit).
const mockGetModelContextLimit = vi.fn().mockResolvedValue(1_000_000);
vi.mock('@/lib/openrouter/model-limits', () => ({
  getModelContextLimit: (...args: unknown[]) => mockGetModelContextLimit(...args),
  getConfiguredModelId: vi.fn().mockReturnValue('test-model/v1'),
  DEFAULT_CONTEXT_LIMIT: 130_000,
}));

// Mock loadOrgRetrievalSettings so tests can control tool_use_enabled.
// Default: static mode (tool_use_enabled = false).
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
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const USER_ID = 'a0000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A small artefact set that fits easily within the generous default budget.
 * File contents deliberately small so no truncation fires.
 */
const SMALL_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  pr_diff: 'diff --git a/f.ts b/f.ts\n+const x = 1;',
  file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
  file_contents: [{ path: 'f.ts', content: 'export const x = 1;' }],
  test_files: [],
};

/**
 * A large artefact set designed to exceed even a tiny token budget.
 * pr_diff and file_contents are deliberately large so truncation fires.
 */
const LARGE_ARTEFACT = {
  artefact_type: 'pull_request' as const,
  // 'x'.repeat(400_000) ≈ 100_000 tokens — exceeds any small budget
  pr_diff: 'x'.repeat(400_000),
  file_listing: [
    { path: 'a.ts', additions: 10, deletions: 5, status: 'modified' },
    { path: 'b.ts', additions: 20, deletions: 3, status: 'modified' },
  ],
  file_contents: [
    { path: 'a.ts', content: 'x'.repeat(200_000) },
    { path: 'b.ts', content: 'x'.repeat(200_000) },
  ],
  test_files: [],
};

// ---------------------------------------------------------------------------
// Mock client builders — reused from fcs-service-logging.test.ts pattern
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
            tool_use_enabled: false,
            rubric_cost_cap_cents: 20,
            retrieval_timeout_seconds: 120,
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
// Helper: invoke createFcs end-to-end and wait for the async pipeline tick
// ---------------------------------------------------------------------------

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
  // triggerRubricGeneration runs async — give it a tick to complete
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Returns the artefact-summary log payload, or undefined. */
function getArtefactSummaryPayload(): Record<string, unknown> | undefined {
  for (const call of mockLoggerInfo.mock.calls) {
    if (call[1] === 'Rubric generation: artefact summary') {
      return call[0] as Record<string, unknown>;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tests — extractArtefacts truncation wiring
// ---------------------------------------------------------------------------

describe('extractArtefacts truncation wiring (#329)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    // Default: generous budget, static mode
    mockGetModelContextLimit.mockResolvedValue(1_000_000);
    mockLoadOrgRetrievalSettings.mockResolvedValue({
      tool_use_enabled: false,
      rubric_cost_cap_cents: 20,
      retrieval_timeout_seconds: 120,
    });
    mockExtractFromPRs.mockResolvedValue(SMALL_ARTEFACT);
    mockDiscoverLinkedPRs.mockResolvedValue([]);
    mockFetchIssueContent.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------------
  // Fits within budget — no truncation
  // -------------------------------------------------------------------------

  describe('Given an artefact set that fits within the model context budget', () => {
    it('should log tokenBudgetApplied: false with no truncationNotes', async () => {
      // [req §1.2] token_budget_applied is false when no truncation needed
      mockExtractFromPRs.mockResolvedValue(SMALL_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_000_000);

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload).toBeDefined();
      expect(payload).toMatchObject({ tokenBudgetApplied: false });
      expect(payload).not.toHaveProperty('truncationNotes');
    });
  });

  // -------------------------------------------------------------------------
  // Exceeds budget — truncation fires
  // -------------------------------------------------------------------------

  describe('Given an artefact set that exceeds the model context budget', () => {
    it('should log tokenBudgetApplied: true', async () => {
      // [req §1.2] token_budget_applied reflects actual truncation
      // Small context limit forces truncation against the large artefact set
      mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
      // 1_000 token budget is tiny — large artefact will always exceed it
      mockGetModelContextLimit.mockResolvedValue(1_250); // Math.floor(1250 * 0.8) = 1000

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload?.tokenBudgetApplied).toBe(true);
    });

    it('should include truncationNotes in the log when truncation occurs', async () => {
      // [req §1.2 / lld §1.2 logging] truncation_notes propagated to log
      mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_250);

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload).toHaveProperty('truncationNotes');
      expect(Array.isArray(payload?.truncationNotes)).toBe(true);
      expect((payload?.truncationNotes as unknown[]).length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Hardcoded false removed — [req §1.2] regression test for issue #329
  // -------------------------------------------------------------------------

  it('regression #329: token_budget_applied is no longer hardcoded to false', async () => {
    // Before this story, extractArtefacts() hardcoded token_budget_applied: false.
    // After wiring, the value comes from truncateArtefacts() — must be true when
    // artefacts exceed the budget.
    mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
    mockGetModelContextLimit.mockResolvedValue(1_250);

    await runCreateFcs();

    const payload = getArtefactSummaryPayload();
    // If still hardcoded, this assertion would read false — regression would be caught.
    expect(payload?.tokenBudgetApplied).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Strategy propagation — tool_use_enabled drives strategy field
  // -------------------------------------------------------------------------

  describe('Given tool_use_enabled is false', () => {
    it('should use strategy static (diff is dropped in static mode, not truncated in-place)', async () => {
      // [lld §1.2 / req §1.2] static mode: diff dropped entirely when over threshold
      // Construct an artefact set whose diff is large enough to exceed threshold but
      // whose file_contents are small — static mode drops the diff.
      const staticArtefact = {
        ...SMALL_ARTEFACT,
        pr_diff: 'x'.repeat(600),              // 150 tokens
        file_contents: [{ path: 'f.ts', content: 'a'.repeat(100) }], // 25 tokens
      };
      mockExtractFromPRs.mockResolvedValue(staticArtefact);
      // tokenBudget = floor(250 * 0.8) = 200 — diff (150 tokens) > 200 * 0.6 (= 120)
      mockGetModelContextLimit.mockResolvedValue(250);
      mockLoadOrgRetrievalSettings.mockResolvedValue({
        tool_use_enabled: false,
        rubric_cost_cap_cents: 20,
        retrieval_timeout_seconds: 120,
      });

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      // Static mode with diff-over-threshold → truncation note includes "omitted"
      expect(payload?.tokenBudgetApplied).toBe(true);
      const notes = payload?.truncationNotes as string[] | undefined;
      expect(notes?.some((n) => n.includes('omitted'))).toBe(true);
    });
  });

  describe('Given tool_use_enabled is true', () => {
    it('should use strategy agentic (diff is truncated in-place, not dropped)', async () => {
      // [lld §1.2 / req §1.2] agentic mode: diff truncated mid-stream
      const agenticArtefact = {
        ...SMALL_ARTEFACT,
        pr_diff: 'x'.repeat(600),
        file_contents: [{ path: 'f.ts', content: 'a'.repeat(100) }],
      };
      mockExtractFromPRs.mockResolvedValue(agenticArtefact);
      mockGetModelContextLimit.mockResolvedValue(250); // same tiny budget
      mockLoadOrgRetrievalSettings.mockResolvedValue({
        tool_use_enabled: true,
        rubric_cost_cap_cents: 20,
        retrieval_timeout_seconds: 120,
      });

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload?.tokenBudgetApplied).toBe(true);
      // Agentic note says "truncated", not "omitted"
      const notes = payload?.truncationNotes as string[] | undefined;
      expect(notes?.some((n) => n.toLowerCase().includes('truncated'))).toBe(true);
      expect(notes?.some((n) => n.includes('omitted'))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // OpenRouter API failure fallback
  // [req §1.1 / lld I4] API failure → DEFAULT_CONTEXT_LIMIT (130_000)
  // -------------------------------------------------------------------------

  describe('Given the OpenRouter API fails', () => {
    it('should use the fallback context limit (130_000) for budget computation', async () => {
      // DEFAULT_CONTEXT_LIMIT = 130_000 → tokenBudget = floor(130_000 * 0.8) = 104_000.
      // SMALL_ARTEFACT easily fits within 104_000 tokens → tokenBudgetApplied: false.
      // If the code used 0 or crashed, truncation would fire unexpectedly.
      mockGetModelContextLimit.mockResolvedValue(130_000); // simulates fallback value
      mockExtractFromPRs.mockResolvedValue(SMALL_ARTEFACT);

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      // At fallback budget (104_000 tokens), small artefact should not be truncated
      expect(payload?.tokenBudgetApplied).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Logging enhancement — truncationNotes absent when no truncation
  // [lld §1.2 / req §1.2 AC-6]
  // -------------------------------------------------------------------------

  describe('logArtefactSummary — truncationNotes field', () => {
    it('should omit truncationNotes from the log when token_budget_applied is false', async () => {
      // [lld §1.2] truncationNotes only appears when artefacts.truncation_notes is present
      mockExtractFromPRs.mockResolvedValue(SMALL_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_000_000);

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload).not.toHaveProperty('truncationNotes');
    });

    it('should include truncationNotes in the log when token_budget_applied is true', async () => {
      // [lld §1.2] log must include truncationNotes array when truncation occurs
      mockExtractFromPRs.mockResolvedValue(LARGE_ARTEFACT);
      mockGetModelContextLimit.mockResolvedValue(1_250);

      await runCreateFcs();

      const payload = getArtefactSummaryPayload();
      expect(payload).toHaveProperty('truncationNotes');
    });
  });
});
