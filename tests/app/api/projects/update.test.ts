// Tests for PATCH /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4
// Requirements:    docs/requirements/v11-requirements.md §Epic 1, Story 1.4
// Issue:           #397

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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import type { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>;
let PATCH: RouteHandler;

// ---------------------------------------------------------------------------
// Mock Supabase clients
// ---------------------------------------------------------------------------

// Single-row membership result from user_organisations .maybeSingle()
let membershipResult: { data: unknown; error: unknown };
// rpcResult: response from adminSupabase.rpc('patch_project', ...)
let rpcResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => membershipResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// updateProject only touches adminSupabase via rpc — no .from() calls
const mockAdminClient = {
  rpc: vi.fn(() => Promise.resolve(rpcResult)),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-uuid-001';
const ORG_ID = 'org-uuid-001';
const AUTH_USER = {
  id: 'user-001',
  email: 'admin@example.com',
  githubUserId: 1001,
  githubUsername: 'admin-user',
};

const PROJECT_ROW = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  name: 'Payment Service',
  description: 'Handles all payment flows',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ORG_ADMIN_MEMBERSHIP = { github_role: 'admin', admin_repo_github_ids: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `fcs-org-id=${ORG_ID}`,
    },
    body: JSON.stringify(body),
  });
}

function patchProject(body: unknown, projectId = PROJECT_ID) {
  return PATCH(
    makePatchRequest(body),
    { params: Promise.resolve({ id: projectId }) },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipResult = { data: ORG_ADMIN_MEMBERSHIP, error: null };
  rpcResult = { data: { ...PROJECT_ROW }, error: null };
  ({ PATCH } = await import('@/app/api/projects/[id]/route'));
});

describe('PATCH /api/projects/[id]', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const response = await patchProject({ name: 'New Name' });

      expect(response.status).toBe(401);
    });
  });

  describe('Given no org cookie (no org selected)', () => {
    it('then it returns 403 [req §Story 1.4, I5]', async () => {
      const req = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      });
      const response = await PATCH(req, { params: Promise.resolve({ id: PROJECT_ID }) });

      expect(response.status).toBe(403);
    });
  });

  describe('Given an Org Member (member with empty admin_repo_github_ids)', () => {
    it('then it returns 403 and the project is unchanged [req §Story 1.4, I5]', async () => {
      membershipResult = {
        data: { github_role: 'member', admin_repo_github_ids: [] },
        error: null,
      };

      const response = await patchProject({ name: 'New Name' });

      expect(response.status).toBe(403);
    });
  });

  describe('Given a Repo Admin (member with non-empty admin_repo_github_ids)', () => {
    it('then it accepts the edit and returns 200 [req §Story 1.4]', async () => {
      membershipResult = {
        data: { github_role: 'member', admin_repo_github_ids: [101] },
        error: null,
      };
      rpcResult = { data: { ...PROJECT_ROW, name: 'Updated Name' }, error: null };

      const response = await patchProject({ name: 'Updated Name' });

      expect(response.status).toBe(200);
    });
  });

  describe('Given the caller has no membership in the current org', () => {
    it('then it returns 403 [I5]', async () => {
      membershipResult = { data: null, error: null };

      const response = await patchProject({ name: 'New Name' });

      expect(response.status).toBe(403);
    });
  });

  describe('Given a missing project id', () => {
    it('then it returns 404 [req §Story 1.3]', async () => {
      rpcResult = { data: null, error: { message: 'project_not_found', code: 'P0001' } };

      const response = await patchProject({ name: 'New Name' }, 'nonexistent-id');

      expect(response.status).toBe(404);
    });
  });

  describe('Given a valid PATCH with {name} only (Invariant I7)', () => {
    it('then it returns 200 [req §Story 1.4]', async () => {
      rpcResult = { data: { ...PROJECT_ROW, name: 'New Name' }, error: null };

      const response = await patchProject({ name: 'New Name' });

      expect(response.status).toBe(200);
    });

    it('then the response body reflects the updated name [req §Story 1.4, I7]', async () => {
      rpcResult = { data: { ...PROJECT_ROW, name: 'New Name' }, error: null };

      const response = await patchProject({ name: 'New Name' });
      const body = await response.json();

      expect(body.name).toBe('New Name');
    });

    it('then the rpc p_context_fields is null — no context write (Invariant I7)', async () => {
      rpcResult = { data: { ...PROJECT_ROW, name: 'New Name' }, error: null };

      await patchProject({ name: 'New Name' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_context_fields).toBeNull();
    });
  });

  describe('Given a valid PATCH with {domain_notes} only (Invariant I7)', () => {
    it('then it returns 200 [req §Story 1.4, I7]', async () => {
      const response = await patchProject({ domain_notes: 'Updated domain notes' });

      expect(response.status).toBe(200);
    });

    it('then the rpc p_project_fields is null — no project table update [I7]', async () => {
      await patchProject({ domain_notes: 'Updated domain notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_project_fields).toBeNull();
    });

    it('then the rpc p_context_fields is non-null [I7]', async () => {
      await patchProject({ domain_notes: 'Updated domain notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_context_fields).not.toBeNull();
    });
  });

  describe('Given a PATCH with both project fields and context fields', () => {
    it('then it returns 200 [req §Story 1.4]', async () => {
      rpcResult = { data: { ...PROJECT_ROW, name: 'Updated' }, error: null };

      const response = await patchProject({
        name: 'Updated',
        domain_notes: 'Updated domain notes',
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Given a PATCH with an empty body (no fields)', () => {
    it('then it returns 422 (at_least_one_field required) [req §Story 1.4, UpdateProjectSchema]', async () => {
      const response = await patchProject({});

      expect(response.status).toBe(422);
    });
  });

  describe('Given an invalid name — empty string', () => {
    it('then it returns 422 [req §Story 1.4]', async () => {
      const response = await patchProject({ name: '' });

      expect(response.status).toBe(422);
    });
  });

  describe('Given an invalid name — longer than 200 characters', () => {
    it('then it returns 422 [req §Story 1.4]', async () => {
      const response = await patchProject({ name: 'a'.repeat(201) });

      expect(response.status).toBe(422);
    });
  });

  describe('Given an invalid question_count below minimum (< 3)', () => {
    it('then it returns 422 [req §Story 1.4, UpdateProjectSchema]', async () => {
      const response = await patchProject({ question_count: 2 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given an invalid question_count above maximum (> 8)', () => {
    it('then it returns 422 [req §Story 1.4, UpdateProjectSchema, #421 V11 cap=8]', async () => {
      const response = await patchProject({ question_count: 9 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given question_count at boundary minimum (3)', () => {
    it('then it returns 200 [req §Story 1.4, UpdateProjectSchema]', async () => {
      const response = await patchProject({ question_count: 3 });

      expect(response.status).toBe(200);
    });
  });

  describe('Given question_count at boundary maximum (8)', () => {
    it('then it returns 200 [req §Story 1.4, UpdateProjectSchema, #421 V11 cap=8]', async () => {
      const response = await patchProject({ question_count: 8 });

      expect(response.status).toBe(200);
    });
  });

  describe('Given a duplicate name within the same org (case-insensitive unique violation)', () => {
    it('then it returns 409 [req §Story 1.4, I2]', async () => {
      rpcResult = {
        data: null,
        error: { code: '23505', message: 'unique constraint violation' },
      };

      const response = await patchProject({ name: 'existing project' });

      expect(response.status).toBe(409);
    });
  });

  describe('Given a successful PATCH', () => {
    it('then the response body contains the project id [req §Story 1.4]', async () => {
      rpcResult = { data: { ...PROJECT_ROW, name: 'New Name' }, error: null };

      const response = await patchProject({ name: 'New Name' });
      const body = await response.json();

      expect(body.id).toBe(PROJECT_ID);
    });

    it('then the response body contains org_id [req §Story 1.4]', async () => {
      rpcResult = { data: PROJECT_ROW, error: null };

      const response = await patchProject({ description: 'Updated desc' });
      const body = await response.json();

      expect(body.org_id).toBe(ORG_ID);
    });

    it('then the rpc is called with the org_id from the cookie [req §Story 1.4]', async () => {
      await patchProject({ name: 'New Name' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_org_id).toBe(ORG_ID);
    });
  });

  describe('Given a PATCH with description over 2000 characters', () => {
    it('then it returns 422 [UpdateProjectSchema]', async () => {
      const response = await patchProject({ description: 'x'.repeat(2001) });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a PATCH with domain_notes over 2000 characters', () => {
    it('then it returns 422 [UpdateProjectSchema]', async () => {
      const response = await patchProject({ domain_notes: 'x'.repeat(2001) });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a PATCH with glob_patterns exceeding 50 items', () => {
    it('then it returns 422 [UpdateProjectSchema]', async () => {
      const response = await patchProject({
        glob_patterns: Array.from({ length: 51 }, (_, i) => `src/${i}/**`),
      });

      expect(response.status).toBe(422);
    });
  });
});
