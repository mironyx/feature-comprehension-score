// Tests for POST /api/assessments/[id]/retry-rubric — admin retry endpoint.
// Issue: #132

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

import { requireAuth, requireOrgAdmin } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { ApiError } from '@/lib/api/errors';
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
let repoResult: { data: unknown; error: unknown };
let orgConfigResult: { data: unknown; error: unknown };
let mergedPrsResult: { data: unknown; error: unknown };

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
  },
};

const mockUserClient = {
  from: vi.fn(() => makeChain(() => ({ data: null, error: null }))),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') return makeChain(() => assessmentResult);
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

  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(requireOrgAdmin).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  assessmentResult = {
    data: {
      id: ASSESSMENT_ID,
      org_id: ORG_ID,
      repository_id: REPO_ID,
      status: 'rubric_failed',
      config_question_count: 5,
    },
    error: null,
  };

  repoResult = {
    data: {
      github_repo_name: 'test-repo',
      org_id: ORG_ID,
      organisations: { github_org_name: 'test-org' },
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

  it('returns 404 for non-existent assessment', async () => {
    assessmentResult = { data: null, error: null };
    const { status } = await callPost();
    expect(status).toBe(404);
  });

  it('returns 403 for non-admin user', async () => {
    vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));
    const { status } = await callPost();
    expect(status).toBe(401);
  });

  it('returns 400 if assessment is not in rubric_failed status', async () => {
    assessmentResult = {
      data: {
        id: ASSESSMENT_ID,
        org_id: ORG_ID,
        repository_id: REPO_ID,
        status: 'awaiting_responses',
        config_question_count: 5,
      },
      error: null,
    };
    const { status, json } = await callPost();
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toContain('rubric_failed');
  });
});
