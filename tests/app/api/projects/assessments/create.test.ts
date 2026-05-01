// Tests for POST /api/projects/[id]/assessments — project-scoped FCS assessment creation.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.2
// Requirements: docs/requirements/v11-requirements.md §Epic 2 Story 2.1
// Issue: #411

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before any dependent import
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

vi.mock('@/lib/openrouter/model-limits', () => ({
  getModelContextLimit: vi.fn().mockReturnValue(128000),
  getConfiguredModelId: vi.fn().mockReturnValue('openai/gpt-4o'),
}));

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn().mockResolvedValue({ domainNotes: '', globPatterns: [] }),
}));

vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: vi.fn().mockResolvedValue({ exemptFilePatterns: [] }),
}));

vi.mock('@/lib/github', () => ({
  GitHubArtefactSource: vi.fn().mockImplementation(() => ({
    extractFromPRs: vi.fn().mockResolvedValue({ diffs: [], files: [], issues: [] }),
  })),
}));

vi.mock('@/lib/engine/prompts/truncate', () => ({
  truncateArtefacts: vi.fn((x: unknown) => x),
  buildTruncationOptions: vi.fn().mockReturnValue({}),
  estimateArtefactSetTokens: vi.fn().mockReturnValue(0),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { ApiError } from '@/lib/api/errors';
import { POST } from '@/app/api/projects/[id]/assessments/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'b0000000-0000-4000-8000-000000000001';
const ASSESSMENT_ID = 'c0000000-0000-4000-8000-000000000001';
const GITHUB_REPO_ID = 12345;

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
    in: vi.fn(() => Promise.resolve(resolver())),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  return chain;
}

// ---------------------------------------------------------------------------
// Mock state — reset in beforeEach
// ---------------------------------------------------------------------------

let orgMemberResult: { data: unknown; error: unknown };
let projectResult: { data: unknown; error: unknown };
let repoResult: { data: unknown; error: unknown };
let repoEnforceResult: { data: unknown; error: unknown };
let orgConfigResult: { data: unknown; error: unknown };
let rpcResult: { data: unknown; error: unknown };

// Mock Octokit
const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
    issues: { get: vi.fn() },
  },
};

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => orgMemberResult);
    if (table === 'projects') return makeChain(() => projectResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') {
      // enforcePerRepoAdmin uses maybeSingle() with eq('org_id') filter;
      // fetchRepoInfo uses single(). We return repoEnforceResult for the enforce
      // path and repoResult for fetchRepoInfo. Both come through the same mock —
      // tests set repoResult and repoEnforceResult to the same value for the
      // happy path, and override individually for targeted error tests.
      const chain = makeChain(() => repoEnforceResult);
      // Override single() to return repoResult (fetchRepoInfo path)
      chain.single.mockResolvedValue(repoResult);
      return chain;
    }
    if (table === 'org_config') return makeChain(() => orgConfigResult);
    if (table === 'assessments') return makeChain(() => ({ data: null, error: null }));
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn(() => Promise.resolve(rpcResult)),
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

  mockOctokit.rest.pulls.get.mockResolvedValue({
    data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' },
  });
  mockOctokit.rest.users.getByUsername.mockResolvedValue({
    data: { id: 99001, login: 'alice' },
  });
  mockOctokit.rest.issues.get.mockResolvedValue({
    data: { title: 'Test Issue', pull_request: undefined },
  });

  // Default: org admin with no repo restrictions
  orgMemberResult = {
    data: { github_role: 'admin', admin_repo_github_ids: [] },
    error: null,
  };

  // Default: project exists in the correct org
  projectResult = { data: { id: PROJECT_ID }, error: null };

  // Default: repo exists and belongs to the org (for fetchRepoInfo single() path)
  repoResult = {
    data: {
      github_repo_name: 'test-repo',
      org_id: ORG_ID,
      organisations: { github_org_name: 'test-org', installation_id: 42 },
    },
    error: null,
  };

  // Default: repo lookup for enforcePerRepoAdmin — github_repo_id in snapshot
  repoEnforceResult = {
    data: { github_repo_id: GITHUB_REPO_ID },
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

  // Default: RPC create_fcs_assessment returns an assessment id
  rpcResult = { data: ASSESSMENT_ID, error: null };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `fcs-org-id=${ORG_ID}`,
    },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await POST(makeRequest(body), { params: Promise.resolve({ id: PROJECT_ID }) });
  return { status: res.status, json: await res.json() };
}

async function callPostWithProject(body: unknown, projectId: string): Promise<{ status: number; json: unknown }> {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/assessments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `fcs-org-id=${ORG_ID}`,
    },
    body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: projectId }) });
  return { status: res.status, json: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/projects/[id]/assessments', () => {

  // -------------------------------------------------------------------------
  // Success cases
  // -------------------------------------------------------------------------

  describe('Given an Org Admin creating an assessment in their org\'s project', () => {
    it('returns 201 with assessment_id, status rubric_generation, and participant_count [req §Story 2.1, lld §B.2]', async () => {
      const { status, json } = await callPost(VALID_BODY);

      expect(status).toBe(201);
      const body = json as Record<string, unknown>;
      expect(typeof body['assessment_id']).toBe('string');
      expect(body['status']).toBe('rubric_generation');
      expect(body['participant_count']).toBe(1);
    });

    it('passes projectId from path to the RPC call via p_project_id [req §Story 2.1 AC, lld §B.2]', async () => {
      await callPost(VALID_BODY);

      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({ p_project_id: PROJECT_ID }),
      );
    });

    it('does not include org_id in the request body — org comes from fcs-org-id cookie [lld §B.2, ctx.orgId]', async () => {
      // The body has no org_id field; the test verifies the endpoint still works,
      // meaning org is resolved from the cookie, not the body.
      const bodyWithoutOrg = { ...VALID_BODY };
      expect(bodyWithoutOrg).not.toHaveProperty('org_id');
      const { status } = await callPost(bodyWithoutOrg);
      expect(status).toBe(201);
    });

    it('passes org_id sourced from cookie to the RPC, not from request body [lld §B.2]', async () => {
      await callPost(VALID_BODY);

      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({ p_org_id: ORG_ID }),
      );
    });

    it('returns correct participant_count for multiple participants [req §Story 2.1]', async () => {
      mockOctokit.rest.users.getByUsername
        .mockResolvedValueOnce({ data: { id: 99001, login: 'alice' } })
        .mockResolvedValueOnce({ data: { id: 99002, login: 'bob' } });

      const body = {
        ...VALID_BODY,
        participants: [{ github_username: 'alice' }, { github_username: 'bob' }],
      };
      const { status, json } = await callPost(body);

      expect(status).toBe(201);
      expect((json as Record<string, unknown>)['participant_count']).toBe(2);
    });
  });

  describe('Given a Repo Admin creating an assessment for a repo in their snapshot', () => {
    it('returns 201 when the repo\'s github_repo_id is in adminRepoGithubIds [lld §B.2 enforcePerRepoAdmin, req §Story 2.1]', async () => {
      // Repo Admin: member role with the repo's github_repo_id in their snapshot
      orgMemberResult = {
        data: { github_role: 'member', admin_repo_github_ids: [GITHUB_REPO_ID] },
        error: null,
      };
      repoEnforceResult = { data: { github_repo_id: GITHUB_REPO_ID }, error: null };

      const { status } = await callPost(VALID_BODY);

      expect(status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // Auth — missing cookie (no org selected)
  // -------------------------------------------------------------------------

  describe('Given a request with no fcs-org-id cookie', () => {
    it('returns 401 when the org cookie is absent [lld §A.1 ctx.orgId null check]', async () => {
      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      });
      const res = await POST(req, { params: Promise.resolve({ id: PROJECT_ID }) });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Auth — unauthenticated user
  // -------------------------------------------------------------------------

  describe('Given an unauthenticated request', () => {
    it('returns 401 when requireAuth throws [lld §A.1]', async () => {
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const { status } = await callPost(VALID_BODY);

      expect(status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Role gate — Org Member
  // -------------------------------------------------------------------------

  describe('Given an Org Member (member role, no admin repo ids)', () => {
    it('returns 403 [req §Story 2.1 AC Org Member ⇒ 403, lld §B.2 assertOrgAdminOrRepoAdmin]', async () => {
      orgMemberResult = {
        data: { github_role: 'member', admin_repo_github_ids: [] },
        error: null,
      };

      const { status } = await callPost(VALID_BODY);

      expect(status).toBe(403);
    });

    it('does not create an assessment row when caller is Org Member [req §Story 2.1]', async () => {
      orgMemberResult = {
        data: { github_role: 'member', admin_repo_github_ids: [] },
        error: null,
      };

      await callPost(VALID_BODY);

      expect(mockAdminClient.rpc).not.toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.anything(),
      );
    });
  });

  describe('Given a caller with no membership row in this org', () => {
    it('returns 401 when no user_organisations row exists [lld §B.2 assertOrgAdminOrRepoAdmin]', async () => {
      orgMemberResult = { data: null, error: null };

      const { status } = await callPost(VALID_BODY);

      expect(status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Project existence / tenant isolation
  // -------------------------------------------------------------------------

  describe('Given an unknown project id', () => {
    it('returns 404 when the project row is not found [req §Story 2.1 AC, lld §B.2 assertProjectInSelectedOrg]', async () => {
      projectResult = { data: null, error: null };

      const { status } = await callPostWithProject(VALID_BODY, 'b0000000-0000-4000-8000-000000000099');

      expect(status).toBe(404);
    });
  });

  describe('Given a project that belongs to a different org than the caller\'s selected org', () => {
    it('returns 404 (does not leak cross-org existence) [lld §B.2 assertProjectInSelectedOrg, lld open-question resolution]', async () => {
      // The query includes eq('org_id', ctx.orgId), so a project in another org
      // returns null, which maps to 404 — same as "not found".
      projectResult = { data: null, error: null };

      const { status } = await callPost(VALID_BODY);

      expect(status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // Per-repo admin gate
  // -------------------------------------------------------------------------

  describe('Given a Repo Admin submitting a repo NOT in their admin-repo snapshot', () => {
    it('returns 403 with message repo_admin_required [lld §B.2 enforcePerRepoAdmin, lld I3]', async () => {
      orgMemberResult = {
        data: { github_role: 'member', admin_repo_github_ids: [GITHUB_REPO_ID] },
        error: null,
      };
      // The repo exists in the org but its github_repo_id is not in the snapshot
      repoEnforceResult = { data: { github_repo_id: 99999 }, error: null };

      const { status, json } = await callPost(VALID_BODY);

      expect(status).toBe(403);
      expect(JSON.stringify(json)).toContain('repo_admin_required');
    });
  });

  describe('Given a tampered repository_id that does not exist in the org', () => {
    it('returns 422 with message repo_not_in_org [lld §B.2 enforcePerRepoAdmin step 3, issue #411 BDD]', async () => {
      orgMemberResult = {
        data: { github_role: 'member', admin_repo_github_ids: [GITHUB_REPO_ID] },
        error: null,
      };
      // Repository not found in org (maybeSingle returns null)
      repoEnforceResult = { data: null, error: null };

      const { status, json } = await callPost(VALID_BODY);

      expect(status).toBe(422);
      expect(JSON.stringify(json)).toContain('repo_not_in_org');
    });
  });

  // -------------------------------------------------------------------------
  // Body validation — missing required fields
  // -------------------------------------------------------------------------

  describe('Given a request body missing repository_id', () => {
    it('returns 422 (Zod validation rejects missing uuid field) [lld §B.2 Zod schema, issue #411]', async () => {
      const { repository_id: _omit, ...bodyWithoutRepo } = VALID_BODY;

      const { status } = await callPost(bodyWithoutRepo);

      expect(status).toBe(422);
    });
  });

  describe('Given a request body with an invalid (non-UUID) repository_id', () => {
    it('returns 422 (validateBody always uses 422 for Zod failures) [validation.ts z.string().uuid()]', async () => {
      const { status } = await callPost({ ...VALID_BODY, repository_id: 'not-a-uuid' });

      expect(status).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // Body validation — at-least-one-of refinement
  // -------------------------------------------------------------------------

  describe('Given a request body missing both merged_pr_numbers and issue_numbers', () => {
    it('returns 422 (refine: at least one is required) [validation.ts refine, issue #411]', async () => {
      const { merged_pr_numbers: _omit, ...bodyWithoutPrs } = VALID_BODY;

      const { status } = await callPost(bodyWithoutPrs);

      expect(status).toBe(422);
    });
  });

  describe('Given a request body with empty merged_pr_numbers and no issue_numbers', () => {
    it('returns 422 [validation.ts refine — both arrays empty satisfies zero count]', async () => {
      const { status } = await callPost({
        ...VALID_BODY,
        merged_pr_numbers: [],
      });

      expect(status).toBe(422);
    });
  });

  describe('Given a request body with empty participants array', () => {
    it('returns 422 [validation.ts participants.min(1)]', async () => {
      const { status } = await callPost({ ...VALID_BODY, participants: [] });

      expect(status).toBe(422);
    });
  });

  describe('Given a request body with an empty feature_name', () => {
    it('returns 422 [validation.ts feature_name.min(1)]', async () => {
      const { status } = await callPost({ ...VALID_BODY, feature_name: '' });

      expect(status).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // Response shape — matches CreateFcsResponse
  // -------------------------------------------------------------------------

  describe('Given a valid request succeeds', () => {
    it('response body has exactly the fields: assessment_id, status, participant_count [lld §B.2 CreateFcsResponse]', async () => {
      const { json } = await callPost(VALID_BODY);

      const body = json as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(['assessment_id', 'participant_count', 'status'].sort());
    });

    it('assessment_id is a string (UUID from RPC) [lld §B.2]', async () => {
      const { json } = await callPost(VALID_BODY);

      expect(typeof (json as Record<string, unknown>)['assessment_id']).toBe('string');
    });

    it('status is exactly the string "rubric_generation" [lld §B.2, CreateFcsResponse type]', async () => {
      const { json } = await callPost(VALID_BODY);

      expect((json as Record<string, unknown>)['status']).toBe('rubric_generation');
    });
  });

  // -------------------------------------------------------------------------
  // issue_numbers-only path (no merged_pr_numbers)
  // -------------------------------------------------------------------------

  describe('Given a body with issue_numbers only (no merged_pr_numbers)', () => {
    it('returns 201 — issue_numbers satisfies the at-least-one-of refinement [validation.ts refine]', async () => {
      const { merged_pr_numbers: _omit, ...bodyWithIssues } = VALID_BODY;
      const bodyWithIssueNumbers = { ...bodyWithIssues, issue_numbers: [10] };

      // Stub issues.get for the validateIssues path
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { title: 'Auth issue', pull_request: undefined },
      });

      const { status } = await callPost(bodyWithIssueNumbers);

      expect(status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // GitHub API PR validation
  // -------------------------------------------------------------------------

  describe('Given a PR that is not merged', () => {
    it('returns 422 with a message indicating the PR is not merged [lld §B.2 validateMergedPRs]', async () => {
      mockOctokit.rest.pulls.get.mockResolvedValue({
        data: { title: 'Open PR', merged_at: null },
      });

      const { status, json } = await callPost(VALID_BODY);

      expect(status).toBe(422);
      expect(JSON.stringify(json)).toContain('not merged');
    });
  });

  describe('Given an unknown participant GitHub username', () => {
    it('returns 422 containing "Unknown GitHub username" [lld §B.2 resolveParticipants]', async () => {
      mockOctokit.rest.users.getByUsername.mockRejectedValue(new Error('Not Found'));

      const { status, json } = await callPost(VALID_BODY);

      expect(status).toBe(422);
      expect(JSON.stringify(json)).toContain('Unknown GitHub username');
    });
  });

  // -------------------------------------------------------------------------
  // RPC call includes p_project_id
  // -------------------------------------------------------------------------

  describe('Given a valid Org Admin request', () => {
    it('calls create_fcs_assessment RPC with p_project_id matching the path param [lld §B.2 step 7]', async () => {
      await callPost(VALID_BODY);

      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_project_id: PROJECT_ID,
          p_org_id: ORG_ID,
          p_repository_id: REPO_ID,
          p_feature_name: VALID_BODY.feature_name,
        }),
      );
    });

    it('project lookup uses ctx.supabase (user-scoped RLS), not adminSupabase [CLAUDE.md security, lld §B.2]', async () => {
      await callPost(VALID_BODY);

      expect(mockUserClient.from).toHaveBeenCalledWith('projects');
      // adminSupabase must NOT be used for the projects lookup
      const adminCalls = (mockAdminClient.from as ReturnType<typeof vi.fn>).mock.calls
        .map((c: unknown[]) => c[0] as string);
      expect(adminCalls).not.toContain('projects');
    });

    it('membership snapshot lookup uses ctx.supabase (user-scoped RLS), not adminSupabase [CLAUDE.md security]', async () => {
      await callPost(VALID_BODY);

      expect(mockUserClient.from).toHaveBeenCalledWith('user_organisations');
      const adminCalls = (mockAdminClient.from as ReturnType<typeof vi.fn>).mock.calls
        .map((c: unknown[]) => c[0] as string);
      expect(adminCalls).not.toContain('user_organisations');
    });
  });

});

// ---------------------------------------------------------------------------
// Legacy route deletion — issue #411 invariant I9
// ---------------------------------------------------------------------------

describe('Legacy POST /api/fcs', () => {
  it('route module no longer exists (returns 404 — directory deleted) [lld §A.1 I9, issue #411]', async () => {
    await expect(import('@/app/api/fcs/route')).rejects.toThrow();
  });
});
