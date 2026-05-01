// Tests for DELETE /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4
// Requirements:    docs/requirements/v11-requirements.md §Epic 1, Story 1.5
// Issue:           #397
//
// Note: I3 (409 when project has assessments) is deferred — assessments.project_id
// does not exist in the schema yet. The check will be added when that column lands.

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
let DELETE: RouteHandler;

// ---------------------------------------------------------------------------
// Mock Supabase clients
// ---------------------------------------------------------------------------

let membershipsResult: { data: unknown; error: unknown };
let deleteResult: { count: number | null; error: unknown };

function makeUserChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    limit: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function makeAdminDeleteChain(resolver: () => { count: number | null; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  });
  chain.delete.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeUserChain(() => membershipsResult);
    return makeUserChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'projects') return makeAdminDeleteChain(() => deleteResult);
    return makeAdminDeleteChain(() => ({ count: null, error: null }));
  }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeleteRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: 'DELETE',
  });
}

function deleteProject(projectId = PROJECT_ID) {
  return DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipsResult = { data: [{ org_id: ORG_ID, github_role: 'admin' }], error: null };
  deleteResult = { count: 1, error: null };
  ({ DELETE } = await import('@/app/api/projects/[id]/route'));
});

describe('DELETE /api/projects/[id]', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const response = await deleteProject();

      expect(response.status).toBe(401);
    });
  });

  describe('Given a Repo Admin (member with non-empty admin_repo_github_ids)', () => {
    it('then it returns 403 — delete is Org Admin only [req §Story 1.5, I5]', async () => {
      membershipsResult = {
        data: [{ org_id: ORG_ID, github_role: 'member' }],
        error: null,
      };

      const response = await deleteProject();

      expect(response.status).toBe(403);
    });
  });

  describe('Given an Org Member (member with empty admin_repo_github_ids)', () => {
    it('then it returns 403 [req §Story 1.5, I5]', async () => {
      membershipsResult = {
        data: [{ org_id: ORG_ID, github_role: 'member' }],
        error: null,
      };

      const response = await deleteProject();

      expect(response.status).toBe(403);
    });
  });

  describe('Given the caller has no membership rows', () => {
    it('then it returns 401 [I5]', async () => {
      membershipsResult = { data: [], error: null };

      const response = await deleteProject();

      expect(response.status).toBe(401);
    });
  });

  describe('Given the project id does not exist (or belongs to a different org)', () => {
    it('then it returns 404 [req §Story 1.5]', async () => {
      deleteResult = { count: 0, error: null };

      const response = await deleteProject('nonexistent-proj-id');

      expect(response.status).toBe(404);
    });
  });

  describe('Given an Org Admin deleting an existing project', () => {
    it('then it returns 204 [req §Story 1.5]', async () => {
      const response = await deleteProject();

      expect(response.status).toBe(204);
    });

    it('then the response body is empty [req §Story 1.5]', async () => {
      const response = await deleteProject();
      const text = await response.text();

      expect(text).toBe('');
    });
  });

  describe('Given a second DELETE on an already-deleted project id (idempotent)', () => {
    it('then it returns 404 [req §Story 1.5]', async () => {
      deleteResult = { count: 0, error: null };

      const response = await deleteProject();

      expect(response.status).toBe(404);
    });
  });

  describe('Given the DB delete affects 0 rows (race condition or wrong org)', () => {
    it('then it returns 404 [lld §B.4 step 6]', async () => {
      deleteResult = { count: 0, error: null };

      const response = await deleteProject();

      expect(response.status).toBe(404);
    });
  });

  describe('Given a successful delete', () => {
    it('then it calls the admin client to delete the projects row [req §Story 1.5]', async () => {
      await deleteProject();

      const adminFromCalls = vi.mocked(mockAdminClient.from).mock.calls.map((c) => c[0]);
      expect(adminFromCalls).toContain('projects');
    });
  });
});
