// Tests for FCS assessment creation — core pipeline contract.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4 POST /api/fcs

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/client', () => ({
  createGithubClient: vi.fn(),
}));

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';
import { createFcsForProject } from '@/app/api/projects/[id]/assessments/service';
import { type CreateFcsBody } from '@/app/api/projects/[id]/assessments/validation';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Constants — valid UUID format required by FcsCreateBodySchema
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';

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
    if (table === 'projects') return makeChain(() => ({ data: { id: PROJECT_ID }, error: null }));
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
};

const VALID_BODY: CreateFcsBody = {
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

  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } });
  mockOctokit.rest.users.getByUsername.mockResolvedValue({ data: { id: 99001, login: 'alice' } });

  orgMemberResult = { data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null };
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

function makeCtx(): ApiContext {
  return {
    supabase: mockUserClient as never,
    adminSupabase: mockAdminClient as never,
    user: AUTH_USER,
    orgId: ORG_ID,
  };
}

async function callCreateFcs(body: CreateFcsBody): Promise<{ assessment_id: string; status: string; participant_count: number }> {
  return createFcsForProject(makeCtx(), PROJECT_ID, body);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFcs', () => {
  describe('given a user who is not Org Admin', () => {
    it('throws 403 when user is a member', async () => {
      orgMemberResult = { data: { github_role: 'member', admin_repo_github_ids: [] }, error: null };
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 401 when user has no org membership', async () => {
      orgMemberResult = { data: null, error: null };
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('given a repository that is not found or belongs to a different org', () => {
    it('throws 422 when repository query fails', async () => {
      repoResult = { data: null, error: { code: 'PGRST116' } };
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 422 });
    });

    it('throws 422 when repository belongs to a different org', async () => {
      repoResult = {
        data: { github_repo_name: 'test-repo', org_id: 'other-org-id', organisations: { github_org_name: 'test-org', installation_id: 42 } },
        error: null,
      };
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 422 });
    });
  });

  describe('given a PR that is not merged', () => {
    it('throws 422 with a message indicating the PR is not merged', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Open PR', merged_at: null } });
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('not merged') });
    });
  });

  describe('given an unknown participant GitHub username', () => {
    it('throws 422 with a message indicating the unknown username', async () => {
      mockOctokit.rest.users.getByUsername.mockRejectedValue(new Error('Not Found'));
      await expect(callCreateFcs(VALID_BODY)).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('Unknown GitHub username') });
    });
  });

  describe('given a repository whose github_repo_name includes the org prefix', () => {
    it('strips the org prefix when calling the GitHub API', async () => {
      repoResult = {
        data: { github_repo_name: 'test-org/test-repo', org_id: ORG_ID, organisations: { github_org_name: 'test-org', installation_id: 42 } },
        error: null,
      };
      await callCreateFcs(VALID_BODY);
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test-org', repo: 'test-repo' }),
      );
    });
  });

  describe('given valid input', () => {
    it('returns assessment_id, status rubric_generation, and participant_count', async () => {
      const result = await callCreateFcs(VALID_BODY);
      expect(typeof result.assessment_id).toBe('string');
      expect(result.status).toBe('rubric_generation');
      expect(result.participant_count).toBe(1);
    });

    it('returns correct participant_count for multiple participants', async () => {
      mockOctokit.rest.users.getByUsername
        .mockResolvedValueOnce({ data: { id: 99001, login: 'alice' } })
        .mockResolvedValueOnce({ data: { id: 99002, login: 'bob' } });
      const body: CreateFcsBody = { ...VALID_BODY, participants: [{ github_username: 'alice' }, { github_username: 'bob' }] };
      const result = await callCreateFcs(body);
      expect(result.participant_count).toBe(2);
    });

    it('validates all PR numbers against the GitHub API', async () => {
      await callCreateFcs({ ...VALID_BODY, merged_pr_numbers: [42, 43] });
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ pull_number: 42 }),
      );
      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith(
        expect.objectContaining({ pull_number: 43 }),
      );
    });

    it('passes the numeric installation ID to createGithubClient', async () => {
      await callCreateFcs(VALID_BODY);
      expect(createGithubClient).toHaveBeenCalledWith(42);
    });

    it('stores assessment, merged PRs, and participants atomically via RPC', async () => {
      await callCreateFcs(VALID_BODY);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_org_id: ORG_ID,
          p_repository_id: VALID_BODY.repository_id,
          p_feature_name: VALID_BODY.feature_name,
        }),
      );
    });
  });
});
