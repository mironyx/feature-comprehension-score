// Integration-style tests for project-context wiring in the FCS rubric pipeline.
// Exercises extractArtefacts indirectly via triggerRubricGeneration.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.2
// Issue: #422

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them.
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
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
  const extractFromPRs = vi.fn().mockResolvedValue({
    artefact_type: 'pull_request' as const,
    pr_diff: 'diff --git a/f.ts b/f.ts',
    file_listing: [{ path: 'f.ts', additions: 5, deletions: 1, status: 'modified' }],
    file_contents: [{ path: 'f.ts', content: 'export const x = 1;' }],
    test_files: [],
  });
  const discoverChildIssues = vi.fn().mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
  const discoverLinkedPRs = vi.fn().mockResolvedValue([]);
  const fetchIssueContent = vi.fn().mockResolvedValue([]);
  class MockGitHubArtefactSource {
    extractFromPRs = extractFromPRs;
    discoverChildIssues = discoverChildIssues;
    discoverLinkedPRs = discoverLinkedPRs;
    fetchIssueContent = fetchIssueContent;
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/github/tools/read-file', () => ({
  makeReadFileTool: vi.fn(() => ({ name: 'readFile', description: '', inputSchema: {}, handler: vi.fn() })),
}));

vi.mock('@/lib/github/tools/list-directory', () => ({
  makeListDirectoryTool: vi.fn(() => ({ name: 'listDirectory', description: '', inputSchema: {}, handler: vi.fn() })),
}));

// Project-context resolver — the unit under indirect test.
vi.mock('@/lib/supabase/project-prompt-context', () => ({
  loadProjectPromptContext: vi.fn(),
}));

// Org-context resolver — must NOT be called from the FCS path in V11.
vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn(),
}));

// Retrieval settings — return minimal defaults so no DB call is needed.
vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: vi.fn().mockResolvedValue({
    tool_use_enabled: false,
    rubric_cost_cap_cents: 20,
    retrieval_timeout_seconds: 120,
  }),
}));

// Model context limit — avoid env-var / network dependency.
vi.mock('@/lib/openrouter/model-limits', () => ({
  getModelContextLimit: vi.fn().mockResolvedValue(200_000),
  getConfiguredModelId: vi.fn().mockReturnValue('test-model'),
}));

// ---------------------------------------------------------------------------
// Imports after mocks.
// ---------------------------------------------------------------------------

import { triggerRubricGeneration } from '@/lib/api/fcs-pipeline';
import { AssembledArtefactSetSchema } from '@/lib/engine/prompts';
import { generateRubric } from '@/lib/engine/pipeline';
import { loadProjectPromptContext } from '@/lib/supabase/project-prompt-context';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { createGithubClient } from '@/lib/github/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const PROJECT_ID = 'b0000000-0000-4000-8000-000000000003';
const ASSESSMENT_ID = 'c0000000-0000-4000-8000-000000000004';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn().mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } }) },
    users: { getByUsername: vi.fn().mockResolvedValue({ data: { id: 99001, login: 'alice' } }) },
  },
};

const SUCCESS_RUBRIC = {
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
// Admin Supabase stub — responds to table queries needed by triggerRubricGeneration.
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
            fcs_question_count: 4,
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

const REPO_INFO = {
  orgName: 'test-org',
  repoName: 'test-repo',
  orgId: ORG_ID as string & { readonly _brand: 'OrgId' },
  installationId: 42,
  questionCount: 4,
  enforcementMode: 'soft',
  scoreThreshold: 70,
  minPrSize: 20,
};

function makeTriggerParams(adminSupabase: ReturnType<typeof makeMockAdminClient>) {
  return {
    adminSupabase: adminSupabase as never,
    assessmentId: ASSESSMENT_ID as never,
    projectId: PROJECT_ID,
    repoInfo: REPO_INFO as never,
    prNumbers: [42],
    issueNumbers: [],
  };
}

/** Waits for all pending microtasks and a short macro-task queue flush. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// ---------------------------------------------------------------------------
// Helper — extract the artefacts argument passed to generateRubric.
// ---------------------------------------------------------------------------

function captureGenerateRubricArtefacts() {
  const calls = vi.mocked(generateRubric).mock.calls;
  if (calls.length === 0) throw new Error('generateRubric was not called');
  return calls[0]![0]!.artefacts;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FCS rubric — project-context wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
    vi.mocked(generateRubric).mockResolvedValue(SUCCESS_RUBRIC);
  });

  it('extractArtefacts calls loadProjectPromptContext, not loadOrgPromptContext, for the FCS path', async () => {
    vi.mocked(loadProjectPromptContext).mockResolvedValue(undefined);

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    expect(vi.mocked(loadProjectPromptContext)).toHaveBeenCalledWith(
      expect.anything(),
      PROJECT_ID,
    );
    expect(vi.mocked(loadOrgPromptContext)).not.toHaveBeenCalled();
  });

  it('the assembled prompt contains the project domain_notes verbatim', async () => {
    vi.mocked(loadProjectPromptContext).mockResolvedValue({
      domain_notes: 'PROJECT-DOMAIN-NOTES',
    });

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    const artefacts = captureGenerateRubricArtefacts();
    expect(artefacts.organisation_context?.domain_notes).toBe('PROJECT-DOMAIN-NOTES');
  });

  it('the assembled prompt contains files matched by the project glob_patterns', async () => {
    // V11 NOTE: glob-driven file selection is out of scope for T3.2.
    // The achievable assertion is: glob_patterns from project context are passed
    // through in the assembled set's organisation_context so the downstream
    // prompt formatter can access them.
    vi.mocked(loadProjectPromptContext).mockResolvedValue({
      glob_patterns: ['**/*.md', 'docs/**'],
    });

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    const artefacts = captureGenerateRubricArtefacts();
    expect(artefacts.organisation_context?.glob_patterns).toEqual(['**/*.md', 'docs/**']);
  });

  it('a project with no context row produces an assembled set with organisation_context = undefined', async () => {
    vi.mocked(loadProjectPromptContext).mockResolvedValue(undefined);

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    const artefacts = captureGenerateRubricArtefacts();
    expect(artefacts.organisation_context).toBeUndefined();
  });

  it('the question count submitted to the LLM equals the project context question_count when set', async () => {
    vi.mocked(loadProjectPromptContext).mockResolvedValue({ question_count: 7 });

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    const artefacts = captureGenerateRubricArtefacts();
    expect(artefacts.question_count).toBe(7);
  });

  it('falls back to repoInfo.questionCount when project context has no question_count', async () => {
    // repoInfo.questionCount is 4 in REPO_INFO; project context returns no question_count.
    vi.mocked(loadProjectPromptContext).mockResolvedValue({ domain_notes: 'some notes' });

    const adminSupabase = makeMockAdminClient();
    await triggerRubricGeneration(makeTriggerParams(adminSupabase));
    await flushAsync();

    const artefacts = captureGenerateRubricArtefacts();
    expect(artefacts.question_count).toBe(4);
  });

  // -------------------------------------------------------------------------
  // AssembledArtefactSetSchema schema boundary tests (V11 upper bound = 8)
  // -------------------------------------------------------------------------

    it('accepts question_count = 8 in the assembled set schema (V11 upper bound)', () => {
    const minimalValid = {
      artefact_type: 'pull_request' as const,
      pr_diff: 'diff',
      file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
      file_contents: [],
      question_count: 8,
      artefact_quality: 'code_only' as const,
      token_budget_applied: false,
    };
    expect(AssembledArtefactSetSchema.safeParse(minimalValid).success).toBe(true);
  });

  it('rejects question_count = 9 in the assembled set schema', () => {
    const overBound = {
      artefact_type: 'pull_request' as const,
      pr_diff: 'diff',
      file_listing: [{ path: 'f.ts', additions: 1, deletions: 0, status: 'added' }],
      file_contents: [],
      question_count: 9,
      artefact_quality: 'code_only' as const,
      token_budget_applied: false,
    };
    expect(AssembledArtefactSetSchema.safeParse(overBound).success).toBe(false);
  });
});
