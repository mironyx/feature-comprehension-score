// Adversarial evaluation tests — issue #397: GET/PATCH/DELETE /api/projects/[id].
//
// Gap 1 — I7 context merge (UNCOVERED by test-author):
//   The test-author verified *which* tables the admin client writes to, but not *what
//   payload* is sent to the rpc. The spec (LLD §B.4 step 5, I7, Story 1.4 AC 5)
//   requires that a PATCH supplying only `domain_notes` passes only that key in
//   p_context_fields — the DB function (jsonb ||) then merges it atomically, preserving
//   existing keys without a round-trip. The correct p_context_fields content is exercised
//   here; the DB-level merge is tested at schema test level.
//
// Gap 2 — updateProject returns the rpc result row
//   When only context fields are supplied, p_project_fields is null and the DB function
//   returns the existing projects row. The response therefore reflects the current project
//   data. This is the expected behaviour (ProjectResponse has no context fields), but it
//   was not explicitly tested. This test documents the actual behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks (must precede imports that trigger the module graph)
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
// Stateful mock plumbing
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-uuid-eval-001';
const ORG_ID = 'org-uuid-eval-001';

const AUTH_USER = {
  id: 'user-eval-001',
  email: 'admin@example.com',
  githubUserId: 9001,
  githubUsername: 'eval-admin',
};

const PROJECT_ROW = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  name: 'Eval Project',
  description: 'Evaluation description',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let membershipsResult: { data: unknown; error: unknown };
let rpcResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    upsert: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
    delete: vi.fn(),
    limit: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => membershipsResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  rpc: vi.fn(() => Promise.resolve(rpcResult)),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchProject(body: unknown, projectId = PROJECT_ID) {
  return PATCH(makePatchRequest(body), { params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipsResult = {
    data: [{ org_id: ORG_ID, github_role: 'admin', admin_repo_github_ids: [] }],
    error: null,
  };
  rpcResult = { data: { ...PROJECT_ROW }, error: null };
  ({ PATCH } = await import('@/app/api/projects/[id]/route'));
});

// ---------------------------------------------------------------------------
// Gap 1 — I7: rpc receives only the supplied context fields (no read-then-merge)
// ---------------------------------------------------------------------------

describe('Gap 1 — I7: PATCH context fields sends correct p_context_fields to rpc', () => {
  describe('When PATCH supplies only domain_notes', () => {
    it('then p_context_fields contains only domain_notes [I7, Story 1.4 AC 5]', async () => {
      await patchProject({ domain_notes: 'New domain notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_context_fields).toEqual({ domain_notes: 'New domain notes' });
    });

    it('then p_project_fields is null [I7]', async () => {
      await patchProject({ domain_notes: 'New domain notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_project_fields).toBeNull();
    });
  });

  describe('When PATCH supplies only question_count', () => {
    it('then p_context_fields contains only question_count [I7]', async () => {
      await patchProject({ question_count: 5 });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_context_fields).toEqual({ question_count: 5 });
    });
  });

  describe('When PATCH supplies both name and domain_notes', () => {
    it('then p_project_fields contains only name [I7]', async () => {
      await patchProject({ name: 'New Name', domain_notes: 'New notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_project_fields).toEqual({ name: 'New Name' });
    });

    it('then p_context_fields contains only domain_notes [I7]', async () => {
      await patchProject({ name: 'New Name', domain_notes: 'New notes' });

      const rpcArgs = vi.mocked(mockAdminClient.rpc).mock.calls[0][1] as Record<string, unknown>;
      expect(rpcArgs.p_context_fields).toEqual({ domain_notes: 'New notes' });
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — updateProject returns the rpc result row
// ---------------------------------------------------------------------------

describe('Gap 2 — updateProject returns rpc result', () => {
  describe('When PATCH supplies only glob_patterns (a context field)', () => {
    it('then the response body contains the project data returned by rpc [spec gap — documented behaviour]', async () => {
      rpcResult = { data: PROJECT_ROW, error: null };

      const response = await patchProject({ glob_patterns: ['docs/**'] });
      const body = await response.json() as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body['name']).toBe(PROJECT_ROW.name);
    });
  });
});
