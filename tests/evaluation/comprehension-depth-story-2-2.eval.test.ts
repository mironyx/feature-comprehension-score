// Adversarial evaluation tests for Story 2.2 — Depth-aware rubric generation.
// Issue #223.
//
// Gap found: the retry-rubric service reads config_comprehension_depth from the
// assessment row and threads it as comprehensionDepth through
// triggerRubricGeneration → AssembledArtefactSet → buildQuestionGenerationPrompt.
// No existing test asserts this wiring for the retry path. If the wiring line were
// removed (or the field omitted from the assessment fetch), all existing tests pass.
//
// AC-4: Depth is threaded from RubricTriggerParams → AssembledArtefactSet → prompt.
// The createFcs path is covered by comprehension-depth-story-2-1.eval.test.ts.
// This file covers the retryRubricGeneration path.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that trigger module resolution
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(),
  requireOrgAdmin: vi.fn(),
}));

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => mockUserClient),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => mockAdminClient),
}));

vi.mock('@/lib/github/client', () => ({
  createGithubClient: vi.fn(),
}));

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    extractFromPRs = vi.fn().mockResolvedValue({
      artefact_type: 'pull_request',
      pr_diff: 'diff',
      file_listing: [],
      file_contents: [],
      test_files: [],
    });
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({ generateStructured: vi.fn() }),
}));

// generateRubric is spied so we can inspect artefacts.comprehension_depth
vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn().mockResolvedValue({
    status: 'success',
    rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
    observability: { inputTokens: 100, outputTokens: 50, toolCalls: [], durationMs: 1 },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { generateRubric } from '@/lib/engine/pipeline';
import { POST } from '@/app/api/assessments/[id]/retry-rubric/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSESSMENT_ID = 'c0000000-0000-4000-8000-000000000010';
const ORG_ID = 'c0000000-0000-4000-8000-000000000001';
const REPO_ID = 'c0000000-0000-4000-8000-000000000002';

const AUTH_USER = {
  id: 'c0000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  githubUserId: 3001,
  githubUsername: 'adminuser',
};

// ---------------------------------------------------------------------------
// Mock chain builder — matches pattern in [id].retry-rubric.test.ts
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

let assessmentResult: { data: unknown; error: unknown };

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
  },
};

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') {
      return makeChain(() => ({ data: [{ github_role: 'admin' }], error: null }));
    }
    if (table === 'assessments') return makeChain(() => assessmentResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') return makeChain(() => assessmentResult);
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
        data: { enforcement_mode: 'soft', score_threshold: 70, fcs_question_count: 5, min_pr_size: 20 },
        error: null,
      }));
    }
    if (table === 'fcs_merged_prs') {
      return makeChain(() => ({ data: [{ pr_number: 42 }], error: null }));
    }
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  vi.mocked(generateRubric).mockResolvedValue({
    status: 'success',
    rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
    observability: { inputTokens: 100, outputTokens: 50, toolCalls: [], durationMs: 1 },
  });

  assessmentResult = {
    data: {
      id: ASSESSMENT_ID,
      org_id: ORG_ID,
      repository_id: REPO_ID,
      status: 'rubric_failed',
      config_question_count: 5,
      config_comprehension_depth: 'conceptual',
    },
    error: null,
  };
});

function makeRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/assessments/${ASSESSMENT_ID}/retry-rubric`,
    { method: 'POST' },
  );
}

async function waitForGenerate(): Promise<void> {
  // triggerRubricGeneration is fire-and-forget (void). Flush microtasks so the
  // async chain completes before assertions run.
  await new Promise(resolve => setTimeout(resolve, 50));
}

// ---------------------------------------------------------------------------
// Adversarial tests — depth threading through the retry path
// [lld §Story 2.2: "retriggerRubricForAssessment threads comprehensionDepth from
//  assessment.config_comprehension_depth"]
// ---------------------------------------------------------------------------

describe('POST /api/assessments/[id]/retry-rubric — comprehension_depth threading', () => {
  describe('given a rubric_failed assessment with config_comprehension_depth "detailed"', () => {
    it('passes comprehension_depth "detailed" to generateRubric via AssembledArtefactSet', async () => {
      // AC-4: depth flows from assessment row → RubricTriggerParams → AssembledArtefactSet
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          config_comprehension_depth: 'detailed',
        },
        error: null,
      };

      const res = await POST(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });
      expect(res.status).toBe(200);
      await waitForGenerate();

      expect(generateRubric).toHaveBeenCalledWith(
        expect.objectContaining({
          artefacts: expect.objectContaining({ comprehension_depth: 'detailed' }),
        }),
      );
    });
  });

  describe('given a rubric_failed assessment with config_comprehension_depth null', () => {
    it('defaults comprehension_depth to "conceptual" in the assembled artefact set', async () => {
      // Invariant 3: existing assessments without explicit depth default to conceptual
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          config_comprehension_depth: null,
        },
        error: null,
      };

      const res = await POST(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });
      expect(res.status).toBe(200);
      await waitForGenerate();

      expect(generateRubric).toHaveBeenCalledWith(
        expect.objectContaining({
          artefacts: expect.objectContaining({ comprehension_depth: 'conceptual' }),
        }),
      );
    });
  });
});
