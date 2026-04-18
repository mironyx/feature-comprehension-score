// Tests for POST /api/fcs — FCS assessment creation endpoint.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 POST /api/fcs

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(),
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

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { ApiError } from '@/lib/api/errors';

import { POST } from '@/app/api/fcs/route';

// ---------------------------------------------------------------------------
// Constants — valid UUID format required by FcsCreateBodySchema
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';

// ---------------------------------------------------------------------------
// Mock chain builder
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(() => Promise.resolve(resolver())),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    insert: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock state — mutable per test, reset in beforeEach
// ---------------------------------------------------------------------------

let orgMemberResult: { data: unknown; error: unknown };
let repoResult: { data: unknown; error: unknown };
let orgConfigResult: { data: unknown; error: unknown };
let assessmentsInsertResult: { data: unknown; error: unknown };
let mergedPrsInsertResult: { data: unknown; error: unknown };
let participantsInsertResult: { data: unknown; error: unknown };

// Mock Octokit — default: PR is merged, participant exists
const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
  },
};

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => orgMemberResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') return makeChain(() => repoResult);
    if (table === 'org_config') return makeChain(() => orgConfigResult);
    if (table === 'assessments') return makeChain(() => assessmentsInsertResult);
    if (table === 'fcs_merged_prs') return makeChain(() => mergedPrsInsertResult);
    if (table === 'assessment_participants') return makeChain(() => participantsInsertResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: 'mock-github-token', error: null }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  githubUserId: 1001,
  githubUsername: 'adminuser',
};

const VALID_BODY = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'New Checkout Flow',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } });
  mockOctokit.rest.users.getByUsername.mockResolvedValue({ data: { id: 99001, login: 'alice' } });

  orgMemberResult = { data: [{ github_role: 'admin' }], error: null };
  repoResult = {
    data: { github_repo_name: 'test-repo', org_id: ORG_ID, organisations: { github_org_name: 'test-org', installation_id: 42 } },
    error: null,
  };
  orgConfigResult = {
    data: { enforcement_mode: 'soft', score_threshold: 70, fcs_question_count: 5, min_pr_size: 20 },
    error: null,
  };
  assessmentsInsertResult = { data: null, error: null };
  mergedPrsInsertResult = { data: null, error: null };
  participantsInsertResult = { data: null, error: null };
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await POST(makeRequest(body));
  return { status: res.status, json: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/fcs', () => {
  describe('given an unauthenticated request', () => {
    it('returns 401', async () => {
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));
      const { status } = await callPost(VALID_BODY);
      expect(status).toBe(401);
    });
  });

  describe('given a user who is not Org Admin', () => {
    it('returns 403 when user is a member', async () => {
      orgMemberResult = { data: [{ github_role: 'member' }], error: null };
      const { status } = await callPost(VALID_BODY);
      expect(status).toBe(403);
    });

    it('returns 403 when user has no org membership', async () => {
      orgMemberResult = { data: [], error: null };
      const { status } = await callPost(VALID_BODY);
      expect(status).toBe(403);
    });
  });

  describe('given an invalid request body', () => {
    it('returns 422 when merged_pr_numbers is empty', async () => {
      const { status } = await callPost({ ...VALID_BODY, merged_pr_numbers: [] });
      expect(status).toBe(422);
    });

    it('returns 422 when participants is empty', async () => {
      const { status } = await callPost({ ...VALID_BODY, participants: [] });
      expect(status).toBe(422);
    });

    it('returns 422 when feature_name is empty', async () => {
      const { status } = await callPost({ ...VALID_BODY, feature_name: '' });
      expect(status).toBe(422);
    });

    it('returns 422 when org_id is missing', async () => {
      const { status } = await callPost({ ...VALID_BODY, org_id: undefined });
      expect(status).toBe(422);
    });
  });

  describe('given a repository that is not found or belongs to a different org', () => {
    it('returns 422 when repository query fails', async () => {
      repoResult = { data: null, error: { code: 'PGRST116' } };
      const { status } = await callPost(VALID_BODY);
      expect(status).toBe(422);
    });

    it('returns 422 when repository belongs to a different org', async () => {
      repoResult = {
        data: { github_repo_name: 'test-repo', org_id: 'other-org-id', organisations: { github_org_name: 'test-org', installation_id: 42 } },
        error: null,
      };
      const { status } = await callPost(VALID_BODY);
      expect(status).toBe(422);
    });
  });

  describe('given a PR that is not merged', () => {
    it('returns 422 with a message indicating the PR is not merged', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Open PR', merged_at: null } });
      const { status, json } = await callPost(VALID_BODY);
      expect(status).toBe(422);
      expect(JSON.stringify(json)).toContain('not merged');
    });
  });

  describe('given an unknown participant GitHub username', () => {
    it('returns 422 with a message indicating the unknown username', async () => {
      mockOctokit.rest.users.getByUsername.mockRejectedValue(new Error('Not Found'));
      const { status, json } = await callPost(VALID_BODY);
      expect(status).toBe(422);
      expect(JSON.stringify(json)).toContain('Unknown GitHub username');
    });
  });

  describe('given a repository whose github_repo_name includes the org prefix', () => {
    it('strips the org prefix when calling the GitHub API', async () => {
      repoResult = {
        data: { github_repo_name: 'test-org/test-repo', org_id: ORG_ID, organisations: { github_org_name: 'test-org', installation_id: 42 } },
        error: null,
      };
      await callPost(VALID_BODY);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test-org', repo: 'test-repo' }),
      );
    });
  });

  describe('given valid input', () => {
    it('returns 201 with assessment_id, status rubric_generation, and participant_count', async () => {
      const { status, json } = await callPost(VALID_BODY);
      expect(status).toBe(201);
      const body = json as Record<string, unknown>;
      expect(typeof body['assessment_id']).toBe('string');
      expect(body['status']).toBe('rubric_generation');
      expect(body['participant_count']).toBe(1);
    });

    it('returns correct participant_count for multiple participants', async () => {
      mockOctokit.rest.users.getByUsername
        .mockResolvedValueOnce({ data: { id: 99001, login: 'alice' } })
        .mockResolvedValueOnce({ data: { id: 99002, login: 'bob' } });
      const body = { ...VALID_BODY, participants: [{ github_username: 'alice' }, { github_username: 'bob' }] };
      const { status, json } = await callPost(body);
      expect(status).toBe(201);
      expect((json as Record<string, unknown>)['participant_count']).toBe(2);
    });

    it('validates all PR numbers against the GitHub API', async () => {
      await callPost({ ...VALID_BODY, merged_pr_numbers: [42, 43] });
      // Each PR number must be validated against the GitHub API
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ pull_number: 42 }),
      );
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ pull_number: 43 }),
      );
    });

    it('passes the numeric installation ID to createGithubClient', async () => {
      await callPost(VALID_BODY);
      expect(createGithubClient).toHaveBeenCalledWith(42);
    });

    it('stores assessment, merged PRs, and participants atomically via RPC', async () => {
      await callPost(VALID_BODY);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_org_id: VALID_BODY.org_id,
          p_repository_id: VALID_BODY.repository_id,
          p_feature_name: VALID_BODY.feature_name,
        }),
      );
    });
  });
});
