// Adversarial evaluation tests — issue #421: /projects/[id]/settings page + glob validation.
//
// Regression pins for the API ↔ form error-body shape contract. The form's
// patchProject() reads `body.details.issues` (per `handleApiError` →
// `validateBody` shape: `{ error, details: { issues } }`). These tests pin
// that contract end-to-end so future changes to either side cannot silently
// break the per-glob error UI.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — identical pattern to tests/app/api/projects/update.test.ts
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
// Mock Supabase clients (reuse minimal shape from update.test.ts)
// ---------------------------------------------------------------------------

let membershipResult: { data: unknown; error: unknown };
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

const mockAdminClient = {
  rpc: vi.fn(() => Promise.resolve(rpcResult)),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-eval-421';
const ORG_ID = 'org-eval-421';
const AUTH_USER = {
  id: 'user-eval-421',
  email: 'admin@example.com',
  githubUserId: 9001,
  githubUsername: 'eval-admin',
};

const PROJECT_ROW = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  name: 'Eval Project',
  description: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ORG_ADMIN_MEMBERSHIP = { github_role: 'admin', admin_repo_github_ids: [] };

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

function patchProject(body: unknown) {
  return PATCH(makePatchRequest(body), { params: Promise.resolve({ id: PROJECT_ID }) });
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

describe('PATCH /api/projects/[id] — glob error shape contract [#421 eval]', () => {

  describe("Given a PATCH with glob_patterns: ['['] (unparseable bracket)", () => {
    it('When the route processes the request, Then it returns 422 [#421, I1]', async () => {
      const response = await patchProject({ glob_patterns: ['['] });

      expect(response.status).toBe(422);
    });

    it('When the route returns 422, Then body.details.issues is defined [#421, I1]', async () => {
      const response = await patchProject({ glob_patterns: ['['] });
      const body = await response.json() as Record<string, unknown>;
      const details = body['details'] as Record<string, unknown> | undefined;

      expect(details?.['issues']).toBeDefined();
    });

    it('When the route returns 422, Then body.details.issues[0].path equals ["glob_patterns", 0] [#421, I1]', async () => {
      const response = await patchProject({ glob_patterns: ['['] });
      const body = await response.json() as Record<string, unknown>;
      const details = body['details'] as Record<string, unknown> | undefined;
      const issues = details?.['issues'] as Array<{ path: (string | number)[]; message: string }> | undefined;

      expect(issues![0].path).toEqual(['glob_patterns', 0]);
      expect(issues![0].message).toBe('glob_unparseable:[');
    });
  });
});
