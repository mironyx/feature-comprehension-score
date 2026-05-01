// Tests for GET /api/projects/[id].
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.4
// Requirements:    docs/requirements/v11-requirements.md §Epic 1, Story 1.3
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
let GET: RouteHandler;

// ---------------------------------------------------------------------------
// Mock Supabase clients
// ---------------------------------------------------------------------------

let projectResult: { data: unknown; error: unknown };
let membershipResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    limit: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'projects') return makeChain(() => projectResult);
    return makeChain(() => membershipResult);
  }),
};

const mockAdminClient = {
  from: vi.fn(() => makeChain(() => ({ data: null, error: null }))),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: 'GET',
  });
}

function getProject(projectId = PROJECT_ID) {
  return GET(makeGetRequest(), { params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  projectResult = { data: PROJECT_ROW, error: null };
  // Membership: org admin by default
  membershipResult = { data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null };
  ({ GET } = await import('@/app/api/projects/[id]/route'));
});

describe('GET /api/projects/[id]', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const response = await getProject();

      expect(response.status).toBe(401);
    });
  });

  describe('Given an Org Admin in the same org', () => {
    it('then it returns 200 with the project', async () => {
      const response = await getProject();

      expect(response.status).toBe(200);
    });

    it('then it returns the project id in the response body', async () => {
      const response = await getProject();
      const body = await response.json();

      expect(body.id).toBe(PROJECT_ID);
    });

    it('then it returns the project org_id', async () => {
      const response = await getProject();
      const body = await response.json();

      expect(body.org_id).toBe(ORG_ID);
    });

    it('then it returns the project name', async () => {
      const response = await getProject();
      const body = await response.json();

      expect(body.name).toBe('Payment Service');
    });

    it('then it returns the project description', async () => {
      const response = await getProject();
      const body = await response.json();

      expect(body.description).toBe('Handles all payment flows');
    });

    it('then it returns created_at and updated_at timestamps', async () => {
      const response = await getProject();
      const body = await response.json();

      expect(body.created_at).toBe('2026-01-01T00:00:00Z');
      expect(body.updated_at).toBe('2026-01-01T00:00:00Z');
    });
  });

  describe('Given a Repo Admin (member with non-empty admin_repo_github_ids) in the same org', () => {
    it('then it returns 200 with the project', async () => {
      membershipResult = {
        data: { github_role: 'member', admin_repo_github_ids: [101] },
        error: null,
      };

      const response = await getProject();

      expect(response.status).toBe(200);
    });
  });

  describe('Given the project id does not exist (returns null from DB)', () => {
    it('then it returns 404 [req §Story 1.3]', async () => {
      projectResult = { data: null, error: null };

      const response = await getProject();

      expect(response.status).toBe(404);
    });
  });

  describe('Given the project belongs to a different org (not visible via RLS)', () => {
    it('then it returns 404 (RLS filters the row, service treats null as missing) [req §Story 1.3]', async () => {
      // RLS restricts to caller's orgs — a cross-org project returns null
      projectResult = { data: null, error: null };

      const response = await getProject('cross-org-proj-id');

      expect(response.status).toBe(404);
    });
  });

  describe('Given the caller is an Org Member (member with empty admin_repo_github_ids)', () => {
    it('then it returns 403 [req §Story 1.3, I5]', async () => {
      membershipResult = {
        data: { github_role: 'member', admin_repo_github_ids: [] },
        error: null,
      };

      const response = await getProject();

      expect(response.status).toBe(403);
    });
  });

  describe('Given the caller has no membership row for the org', () => {
    it('then it returns 401 [I5]', async () => {
      membershipResult = { data: null, error: null };

      const response = await getProject();

      expect(response.status).toBe(401);
    });
  });

  describe('Given the project has a null description', () => {
    it('then it returns the project with description: null', async () => {
      projectResult = { data: { ...PROJECT_ROW, description: null }, error: null };

      const response = await getProject();
      const body = await response.json();

      expect(body.description).toBeNull();
    });
  });
});
