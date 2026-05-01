// Tests for POST /api/assessments/[id]/retry-rubric — admin retry endpoint.
// Issue: #132 (original), #273 (guardrails — retry count cap, retryable flag)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
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

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn().mockResolvedValue({
    status: 'success',
    rubric: { questions: [{ question_text: 'Q1', reference_answer: 'A1', weight: 1 }] },
  }),
}));

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { POST } from '@/app/api/assessments/[id]/retry-rubric/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSESSMENT_ID = 'a0000000-0000-4000-8000-000000000010';
const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';

const AUTH_USER = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  githubUserId: 1001,
  githubUsername: 'adminuser',
};

// ---------------------------------------------------------------------------
// Mock chain builder
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
// Update-payload spy (issue #273 — AC 3–6)
//
// makeChain returns a fresh chain object on every from('assessments') call, so
// we cannot intercept update() calls after the fact by reading mockAdminClient.
// Instead, we keep a module-scoped spy fn declared once. The assessments chain
// factory wraps update() through this spy so every call — regardless of which
// chain instance is produced — is captured. beforeEach resets the spy so tests
// do not cross-contaminate each other. This is the minimum invasive change that
// does not alter any existing test assertion.
// ---------------------------------------------------------------------------

// After a successful retry, this array holds the [column, value] pairs passed
// to .eq() AFTER the .update() call (used to verify org_id scoping per AC 6).
let postUpdateEqArgs: Array<[string, unknown]> = [];

// assessmentsUpdateSpy is a persistent vi.fn that all assessments chains delegate
// their .update() call through. We extract .mock.calls from it after callPost().
const assessmentsUpdateSpy = vi.fn();

function makeAssessmentsChain(resolver: () => { data: unknown; error: unknown }) {
  let afterUpdate = false;

  // post-update sub-chain: resolves cleanly and records .eq() arguments.
  const updateChain: Record<string, unknown> = {};
  updateChain['eq'] = (col: string, val: unknown) => {
    postUpdateEqArgs.push([col, val]);
    return updateChain;
  };
  // Make it thenable so `await chain.update(...).eq(...).eq(...)` works.
  updateChain['then'] = (
    onFulfilled?: ((v: unknown) => unknown) | null,
    onRejected?: ((e: unknown) => unknown) | null,
  ) => Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);

  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn((col: string, val: unknown) => {
      if (afterUpdate) postUpdateEqArgs.push([col, val]);
      return chain;
    }),
    single: vi.fn(() => Promise.resolve(resolver())),
    // Delegate to the module-scoped spy so calls are observable from tests.
    update: (payload: unknown) => {
      afterUpdate = true;
      assessmentsUpdateSpy(payload);
      return updateChain;
    },
  });
  chain.select.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

let assessmentResult: { data: unknown; error: unknown };
let repoResult: { data: unknown; error: unknown };
let orgConfigResult: { data: unknown; error: unknown };
let mergedPrsResult: { data: unknown; error: unknown };

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
  },
};

let userOrgResult: { data: unknown; error: unknown };
// User-scoped assessment read (RLS-filtered). Defaults to assessmentResult,
// but tests can set this to null to simulate a cross-org request where RLS
// hides the row even though it exists in the database.
let userAssessmentResult: { data: unknown; error: unknown } | null = null;

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => userOrgResult);
    if (table === 'assessments') return makeChain(() => userAssessmentResult ?? assessmentResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') return makeAssessmentsChain(() => assessmentResult);
    if (table === 'repositories') return makeChain(() => repoResult);
    if (table === 'org_config') return makeChain(() => orgConfigResult);
    if (table === 'fcs_merged_prs') return makeChain(() => mergedPrsResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  assessmentsUpdateSpy.mockReset();
  postUpdateEqArgs = [];

  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  userOrgResult = { data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null };
  userAssessmentResult = null;

  // rubric_retry_count and rubric_error_retryable are required by the guardrail
  // checks added in issue #273. Defaulting to safe values keeps all pre-existing
  // tests passing without modification.
  assessmentResult = {
    data: {
      id: ASSESSMENT_ID,
      org_id: ORG_ID,
      repository_id: REPO_ID,
      status: 'rubric_failed',
      config_question_count: 5,
      rubric_retry_count: 0,
      rubric_error_retryable: true,
    },
    error: null,
  };

  repoResult = {
    data: {
      github_repo_name: 'test-repo',
      org_id: ORG_ID,
      organisations: { github_org_name: 'test-org', installation_id: 42 },
    },
    error: null,
  };

  orgConfigResult = {
    data: {
      enforcement_mode: 'soft',
      score_threshold: 70,
      fcs_question_count: 5,
      min_pr_size: 20,
    },
    error: null,
  };

  mergedPrsResult = {
    data: [{ pr_number: 42 }],
    error: null,
  };
});

function makeRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/assessments/${ASSESSMENT_ID}/retry-rubric`,
    { method: 'POST' },
  );
}

async function callPost(): Promise<{ status: number; json: unknown }> {
  const res = await POST(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });
  return { status: res.status, json: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/assessments/[id]/retry-rubric', () => {
  it('resets status to rubric_generation and re-triggers generation', async () => {
    const { status, json } = await callPost();
    expect(status).toBe(200);
    const body = json as Record<string, unknown>;
    expect(body['status']).toBe('rubric_generation');
  });

  it('passes the numeric installation ID to createGithubClient', async () => {
    await callPost();
    expect(createGithubClient).toHaveBeenCalledWith(42);
  });

  it('returns 404 for non-existent assessment', async () => {
    assessmentResult = { data: null, error: null };
    const { status } = await callPost();
    expect(status).toBe(404);
  });

  it('returns 404 when RLS hides the assessment from the caller (cross-org)', async () => {
    // Given the assessment exists in the DB but is in another org (RLS denies).
    // The user-scoped client returns no row even though adminSupabase would see it.
    // When POST /retry-rubric is called, the route must 404 rather than leak the
    // existence of another org's assessment by reading through adminSupabase.
    userAssessmentResult = { data: null, error: null };
    const { status } = await callPost();
    expect(status).toBe(404);
  });

  it('returns 403 for non-admin user', async () => {
    userOrgResult = { data: { github_role: 'member', admin_repo_github_ids: [] }, error: null };
    const { status } = await callPost();
    expect(status).toBe(403);
  });

  it('returns 400 if assessment is not in rubric_failed status', async () => {
    assessmentResult = {
      data: {
        id: ASSESSMENT_ID,
        org_id: ORG_ID,
        repository_id: REPO_ID,
        status: 'awaiting_responses',
        config_question_count: 5,
        rubric_retry_count: 0,
        rubric_error_retryable: true,
      },
      error: null,
    };
    const { status, json } = await callPost();
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain('rubric_failed');
  });

  // -------------------------------------------------------------------------
  // Issue #273: Retry guardrails — retry count cap and retryable flag
  // -------------------------------------------------------------------------

  describe('guardrail: retry count cap (AC 1, I3)', () => {
    it('returns 400 with "Maximum retry limit reached" when rubric_retry_count equals 3', async () => {
      // Given an assessment that has already been retried 3 times (at the cap)
      // When POST /retry-rubric is called
      // Then it returns 400 with the cap message
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 3,
          rubric_error_retryable: true,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(400);
      expect(JSON.stringify(json)).toContain('Maximum retry limit reached');
    });

    it('returns 400 with "Maximum retry limit reached" when rubric_retry_count exceeds 3', async () => {
      // Given a count above the cap (defensive — e.g. data corrected from outside)
      // When POST /retry-rubric is called
      // Then the cap check still fires
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 4,
          rubric_error_retryable: true,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(400);
      expect(JSON.stringify(json)).toContain('Maximum retry limit reached');
    });
  });

  describe('guardrail: non-retryable error flag (AC 2, I4)', () => {
    it('returns 400 with "Error is not retryable" when rubric_error_retryable is false', async () => {
      // Given an assessment whose LLM error was flagged as non-retryable
      // When POST /retry-rubric is called
      // Then it returns 400 with the retryable message
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 0,
          rubric_error_retryable: false,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(400);
      expect(JSON.stringify(json)).toContain('Error is not retryable');
    });

    it('does not block retry when rubric_error_retryable is null (no error captured)', async () => {
      // Given an assessment with no error details recorded (null = unknown/not set)
      // When POST /retry-rubric is called
      // Then the retryable check does not block the request
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 0,
          rubric_error_retryable: null,
        },
        error: null,
      };
      const { status } = await callPost();
      expect(status).toBe(200);
    });
  });

  describe('update payload on successful retry (AC 3–6, I2, I7)', () => {
    // Helper: the FIRST update() call on the assessments table is always the
    // retry-reset write from retriggerRubricForAssessment. Subsequent calls
    // originate from the void-ed triggerRubricGeneration (updateProgress /
    // markRubricFailed). We always inspect call index 0 to get the reset payload.
    function firstUpdatePayload(): Record<string, unknown> {
      return assessmentsUpdateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    }

    it('sets status to "rubric_generation" in the update payload (AC 5)', async () => {
      // Given a retryable assessment below the count cap
      // When the retry succeeds
      // Then the DB update includes status: 'rubric_generation'
      await callPost();
      expect(firstUpdatePayload()['status']).toBe('rubric_generation');
    });

    it('increments rubric_retry_count by 1 in the update payload (AC 3)', async () => {
      // Given an assessment with rubric_retry_count=2 (one below the cap)
      // When the retry succeeds
      // Then the update sets rubric_retry_count to 3 (current + 1)
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 2,
          rubric_error_retryable: true,
        },
        error: null,
      };
      await callPost();
      expect(firstUpdatePayload()['rubric_retry_count']).toBe(3);
    });

    it('clears error fields to null in the update payload (AC 4)', async () => {
      // Given a retryable assessment
      // When the retry succeeds
      // Then rubric_error_code, rubric_error_message, rubric_error_retryable are null
      await callPost();
      const payload = firstUpdatePayload();
      expect(payload['rubric_error_code']).toBeNull();
      expect(payload['rubric_error_message']).toBeNull();
      expect(payload['rubric_error_retryable']).toBeNull();
    });

    it('clears observability fields to null in the update payload (AC 4)', async () => {
      // Given a retryable assessment
      // When the retry succeeds
      // Then token/duration/tool observability fields are null
      await callPost();
      const payload = firstUpdatePayload();
      expect(payload['rubric_input_tokens']).toBeNull();
      expect(payload['rubric_output_tokens']).toBeNull();
      expect(payload['rubric_tool_call_count']).toBeNull();
      expect(payload['rubric_tool_calls']).toBeNull();
      expect(payload['rubric_duration_ms']).toBeNull();
    });

    it('clears progress fields to null in the update payload (AC 4)', async () => {
      // Given a retryable assessment
      // When the retry succeeds
      // Then rubric_progress and rubric_progress_updated_at are null
      await callPost();
      const payload = firstUpdatePayload();
      expect(payload['rubric_progress']).toBeNull();
      expect(payload['rubric_progress_updated_at']).toBeNull();
    });
  });

  describe('update filter scope (AC 6, ADR-0025)', () => {
    it('scopes the assessments update by both id and org_id', async () => {
      // Given a successful retry
      // When the DB update is issued
      // Then .eq is called with 'id' and again with 'org_id' after the update
      // (defence-in-depth: service-role client bypasses RLS, so explicit org_id
      //  filter prevents cross-tenant writes — see ADR-0025).
      // postUpdateEqArgs is populated by makeAssessmentsChain above.
      await callPost();
      const eqKeys = postUpdateEqArgs.map(([key]) => key);
      expect(eqKeys).toContain('id');
      expect(eqKeys).toContain('org_id');
    });
  });

  describe('guardrail ordering (AC 8)', () => {
    it('returns 404 (existence) before 403 (admin) — assessment not found skips admin check', async () => {
      // Given: assessment does not exist AND user is non-admin
      // When: POST is called
      // Then: 404, not 403
      assessmentResult = { data: null, error: null };
      userOrgResult = { data: { github_role: 'member', admin_repo_github_ids: [] }, error: null };
      const { status } = await callPost();
      expect(status).toBe(404);
    });

    it('returns 403 (admin) before 400 (wrong status) — non-admin on non-failed assessment gets 403', async () => {
      // Given: assessment exists with wrong status AND user is non-admin
      // When: POST is called
      // Then: 403, not 400
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'awaiting_responses',
          config_question_count: 5,
          rubric_retry_count: 0,
          rubric_error_retryable: true,
        },
        error: null,
      };
      userOrgResult = { data: { github_role: 'member', admin_repo_github_ids: [] }, error: null };
      const { status } = await callPost();
      expect(status).toBe(403);
    });

    it('returns 400 wrong-status before 400 retry-cap — wrong status skips retry-count check', async () => {
      // Given: assessment is not in rubric_failed AND retry count is >= 3
      // When: POST is called
      // Then: 400 with rubric_failed message (status check wins)
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'awaiting_responses',
          config_question_count: 5,
          rubric_retry_count: 3,
          rubric_error_retryable: true,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(400);
      expect(JSON.stringify(json)).toContain('rubric_failed');
    });

    it('returns 400 retry-cap before 400 retryable — count check fires before retryable check', async () => {
      // Given: assessment is rubric_failed, retry count = 3, and error is also non-retryable
      // When: POST is called
      // Then: 400 with "Maximum retry limit reached" (count check wins over retryable check)
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 3,
          rubric_error_retryable: false,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(400);
      expect(JSON.stringify(json)).toContain('Maximum retry limit reached');
    });
  });

  describe('happy path at retry count 2 (AC 7)', () => {
    it('returns 200 and status rubric_generation when retry count is 2 (one below cap)', async () => {
      // Given: an assessment with rubric_retry_count=2, rubric_error_retryable=true
      // When: POST /retry-rubric is called
      // Then: 200 with status rubric_generation — guardrails pass and retry proceeds
      assessmentResult = {
        data: {
          id: ASSESSMENT_ID,
          org_id: ORG_ID,
          repository_id: REPO_ID,
          status: 'rubric_failed',
          config_question_count: 5,
          rubric_retry_count: 2,
          rubric_error_retryable: true,
        },
        error: null,
      };
      const { status, json } = await callPost();
      expect(status).toBe(200);
      const body = json as Record<string, unknown>;
      expect(body['status']).toBe('rubric_generation');
    });
  });
});
