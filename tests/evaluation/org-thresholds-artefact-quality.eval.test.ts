// Adversarial evaluation tests for issue #237 — org threshold config.
//
// Gaps found:
// 1. PATCH /api/organisations/[id]/thresholds 500 path — the DB write in
//    updateThresholds() can fail (e.g. DB error), but [id].thresholds.test.ts
//    never sets the admin client to return an error. All existing tests only
//    exercise the happy path and validation rejections.
// 2. GET /api/organisations/[id]/thresholds 500 path — same: DB read error in
//    loadThresholds() is untested.
// 3. assertOrgAdmin DB error path — if the user_organisations query itself
//    errors (not just returns empty), assertOrgAdmin should throw 500, but no
//    test exercises this.
//
// Mock pattern mirrors tests/app/api/organisations/[id].thresholds.test.ts
// exactly (helpers are not exported from there).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that depends on them
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
// Mock Supabase chain — mirrors [id].thresholds.test.ts pattern exactly
// ---------------------------------------------------------------------------

let membershipResult: { data: unknown; error: unknown };
let adminWriteResult: { data: unknown; error: unknown };
let selectResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    upsert: vi.fn(),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'org_config') return makeChain(() => selectResult);
    return makeChain(() => membershipResult);
  }),
};

const mockAdminClient = {
  from: vi.fn(() => makeChain(() => adminWriteResult)),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-eval-237';
const AUTH_USER = {
  id: 'user-eval-237',
  email: 'admin@example.com',
  githubUserId: 3001,
  githubUsername: 'admin-eval',
};

const THRESHOLDS_ROW = {
  org_id: ORG_ID,
  artefact_quality_threshold: 0.6,
  fcs_low_threshold: 60,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/thresholds`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function makeGetRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/thresholds`,
    { method: 'GET' },
  );
}

function patchThresholds(body: unknown) {
  return PATCH(
    makePatchRequest(body),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

function getThresholds() {
  return GET(
    makeGetRequest(),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipResult = { data: [{ github_role: 'admin' }], error: null };
  adminWriteResult = { data: THRESHOLDS_ROW, error: null };
  selectResult = { data: THRESHOLDS_ROW, error: null };
  ({ PATCH, GET } = await import(
    '@/app/api/organisations/[id]/thresholds/route'
  ));
});

// ---------------------------------------------------------------------------
// Gap 1: PATCH returns 500 when the DB write fails
// ---------------------------------------------------------------------------

describe('PATCH /api/organisations/[id]/thresholds — DB write error', () => {
  describe('Given an admin request where the DB update returns an error', () => {
    it('then it returns 500', async () => {
      adminWriteResult = { data: null, error: { message: 'connection refused' } };

      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2: GET returns 500 when the DB read fails
// ---------------------------------------------------------------------------

describe('GET /api/organisations/[id]/thresholds — DB read error', () => {
  describe('Given an admin request where the DB read returns an error', () => {
    it('then it returns 500', async () => {
      selectResult = { data: null, error: { message: 'query timeout' } };

      const response = await getThresholds();

      expect(response.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 3: assertOrgAdmin DB error path returns 500
// ---------------------------------------------------------------------------

describe('PATCH /api/organisations/[id]/thresholds — membership query DB error', () => {
  describe('Given the user_organisations query itself returns a DB error', () => {
    it('then it returns 500 (not 403)', async () => {
      membershipResult = { data: null, error: { message: 'relation does not exist' } };

      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(500);
    });
  });
});

describe('GET /api/organisations/[id]/thresholds — membership query DB error', () => {
  describe('Given the user_organisations query itself returns a DB error', () => {
    it('then it returns 500 (not 403)', async () => {
      membershipResult = { data: null, error: { message: 'relation does not exist' } };

      const response = await getThresholds();

      expect(response.status).toBe(500);
    });
  });
});
