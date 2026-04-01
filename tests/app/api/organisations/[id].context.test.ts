// Tests for GET/PATCH /api/organisations/[id]/context — org prompt context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2

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
let GET: RouteHandler;

// ---------------------------------------------------------------------------
// Mock Supabase clients
// ---------------------------------------------------------------------------

let membershipResult: { data: unknown; error: unknown };
let upsertResult: { data: unknown; error: unknown };
let selectResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    upsert: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'organisation_contexts') return makeChain(() => selectResult);
    return makeChain(() => membershipResult);
  }),
};

const mockAdminClient = {
  from: vi.fn(() => makeChain(() => upsertResult)),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-001';
const AUTH_USER = {
  id: 'user-001',
  email: 'admin@example.com',
  githubUserId: 1001,
  githubUsername: 'admin-user',
};

const CONTEXT_ROW = {
  id: 'ctx-uuid-001',
  org_id: ORG_ID,
  project_id: null,
  context: { focus_areas: ['API design'] },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/context`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function patchContext(body: unknown) {
  return PATCH(
    makeRequest(body),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipResult = { data: [{ github_role: 'admin' }], error: null };
  upsertResult = { data: CONTEXT_ROW, error: null };
  selectResult = { data: CONTEXT_ROW, error: null };
  ({ PATCH, GET } = await import(
    '@/app/api/organisations/[id]/context/route'
  ));
});

describe('PATCH /api/organisations/[id]/context', () => {
  describe('Given a non-admin caller', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await patchContext({ focus_areas: ['API design'] });

      expect(response.status).toBe(403);
    });
  });

  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await patchContext({ focus_areas: ['API design'] });

      expect(response.status).toBe(401);
    });
  });

  describe('Given an invalid request body', () => {
    it('then it returns 422 when focus_areas exceeds max 5', async () => {
      const response = await patchContext({
        focus_areas: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(response.status).toBe(422);
    });

    it('then it returns 422 when domain_notes exceeds 500 chars', async () => {
      const response = await patchContext({
        domain_notes: 'x'.repeat(501),
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a valid admin request with context fields', () => {
    it('then it upserts and returns 200 with the context row', async () => {
      const response = await patchContext({ focus_areas: ['API design'] });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.org_id).toBe(ORG_ID);
      expect(body.context).toEqual({ focus_areas: ['API design'] });
    });
  });

  describe('Given a valid admin request with all fields', () => {
    it('then it calls upsert with the full context', async () => {
      const fullContext = {
        domain_vocabulary: [{ term: 'saga', definition: 'long-running process' }],
        focus_areas: ['event sourcing'],
        exclusions: ['legacy module'],
        domain_notes: 'We use CQRS.',
      };
      upsertResult = { data: { ...CONTEXT_ROW, context: fullContext }, error: null };

      const response = await patchContext(fullContext);

      expect(response.status).toBe(200);
      expect(mockAdminClient.from).toHaveBeenCalledWith('organisation_contexts');
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/organisations/[id]/context
// ---------------------------------------------------------------------------

function makeGetRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/context`,
    { method: 'GET' },
  );
}

function getContext() {
  return GET(
    makeGetRequest(),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

describe('GET /api/organisations/[id]/context', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await getContext();

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await getContext();

      expect(response.status).toBe(403);
    });
  });

  describe('Given no context row exists', () => {
    it('then it returns 200 with empty context', async () => {
      selectResult = { data: null, error: null };

      const response = await getContext();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.context).toEqual({});
    });
  });

  describe('Given a context row exists', () => {
    it('then it returns 200 with the context', async () => {
      const response = await getContext();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.context).toEqual({ focus_areas: ['API design'] });
    });
  });
});
