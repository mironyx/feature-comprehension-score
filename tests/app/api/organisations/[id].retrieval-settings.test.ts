// Tests for GET/PATCH /api/organisations/[id]/retrieval-settings — retrieval config.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

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
// Mock Supabase clients — mirrors sibling [id].context.test.ts pattern
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

const VALID_SETTINGS = {
  tool_use_enabled: true,
  rubric_cost_cap_cents: 100,
  retrieval_timeout_seconds: 120,
};

const SETTINGS_ROW = {
  org_id: ORG_ID,
  tool_use_enabled: true,
  rubric_cost_cap_cents: 100,
  retrieval_timeout_seconds: 120,
};

const DEFAULT_SETTINGS = {
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/retrieval-settings`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function makeGetRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/retrieval-settings`,
    { method: 'GET' },
  );
}

function patchSettings(body: unknown) {
  return PATCH(
    makePatchRequest(body),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

function getSettings() {
  return GET(
    makeGetRequest(),
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
  upsertResult = { data: SETTINGS_ROW, error: null };
  selectResult = { data: SETTINGS_ROW, error: null };
  ({ PATCH, GET } = await import(
    '@/app/api/organisations/[id]/retrieval-settings/route'
  ));
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/organisations/[id]/retrieval-settings', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await patchSettings(VALID_SETTINGS);

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await patchSettings(VALID_SETTINGS);

      expect(response.status).toBe(403);
    });
  });

  describe('Given rubric_cost_cap_cents is below the minimum (0)', () => {
    it('then it returns 422 when value is -1', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, rubric_cost_cap_cents: -1 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given rubric_cost_cap_cents is above the maximum (500)', () => {
    it('then it returns 422 when value is 501', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, rubric_cost_cap_cents: 501 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given rubric_cost_cap_cents is a non-integer', () => {
    it('then it returns 422 when value is 1.5', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, rubric_cost_cap_cents: 1.5 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given retrieval_timeout_seconds is below the minimum (10)', () => {
    it('then it returns 422 when value is 9', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, retrieval_timeout_seconds: 9 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given retrieval_timeout_seconds is above the maximum (600)', () => {
    it('then it returns 422 when value is 601', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, retrieval_timeout_seconds: 601 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given retrieval_timeout_seconds is a non-integer', () => {
    it('then it returns 422 when value is 120.5', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, retrieval_timeout_seconds: 120.5 });

      expect(response.status).toBe(422);
    });
  });

  describe('Given tool_use_enabled is missing from the body', () => {
    it('then it returns 422', async () => {
      const { tool_use_enabled: _omitted, ...bodyWithout } = VALID_SETTINGS;

      const response = await patchSettings(bodyWithout);

      expect(response.status).toBe(422);
    });
  });

  describe('Given tool_use_enabled is not a boolean', () => {
    it('then it returns 422 when value is a string', async () => {
      const response = await patchSettings({ ...VALID_SETTINGS, tool_use_enabled: 'yes' });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a valid admin request with all three fields', () => {
    it('then it returns 200 with the updated settings', async () => {
      upsertResult = { data: SETTINGS_ROW, error: null };

      const response = await patchSettings(VALID_SETTINGS);

      expect(response.status).toBe(200);
    });
  });

  describe('Given a valid admin request, values round-trip correctly', () => {
    it('then the response body contains the sent values', async () => {
      const sent = { tool_use_enabled: false, rubric_cost_cap_cents: 50, retrieval_timeout_seconds: 300 };
      upsertResult = { data: { org_id: ORG_ID, ...sent }, error: null };

      const response = await patchSettings(sent);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tool_use_enabled).toBe(false);
      expect(body.rubric_cost_cap_cents).toBe(50);
      expect(body.retrieval_timeout_seconds).toBe(300);
    });
  });

  describe('Given boundary values that are exactly at the edge of allowed ranges', () => {
    it('then it returns 200 when rubric_cost_cap_cents is 0 (minimum)', async () => {
      upsertResult = { data: { ...SETTINGS_ROW, rubric_cost_cap_cents: 0 }, error: null };

      const response = await patchSettings({ ...VALID_SETTINGS, rubric_cost_cap_cents: 0 });

      expect(response.status).toBe(200);
    });

    it('then it returns 200 when rubric_cost_cap_cents is 500 (maximum)', async () => {
      upsertResult = { data: { ...SETTINGS_ROW, rubric_cost_cap_cents: 500 }, error: null };

      const response = await patchSettings({ ...VALID_SETTINGS, rubric_cost_cap_cents: 500 });

      expect(response.status).toBe(200);
    });

    it('then it returns 200 when retrieval_timeout_seconds is 10 (minimum)', async () => {
      upsertResult = { data: { ...SETTINGS_ROW, retrieval_timeout_seconds: 10 }, error: null };

      const response = await patchSettings({ ...VALID_SETTINGS, retrieval_timeout_seconds: 10 });

      expect(response.status).toBe(200);
    });

    it('then it returns 200 when retrieval_timeout_seconds is 600 (maximum)', async () => {
      upsertResult = { data: { ...SETTINGS_ROW, retrieval_timeout_seconds: 600 }, error: null };

      const response = await patchSettings({ ...VALID_SETTINGS, retrieval_timeout_seconds: 600 });

      expect(response.status).toBe(200);
    });
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/organisations/[id]/retrieval-settings', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await getSettings();

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await getSettings();

      expect(response.status).toBe(403);
    });
  });

  describe('Given a row exists in org_config for this org', () => {
    it('then it returns 200 with the three retrieval fields', async () => {
      selectResult = { data: SETTINGS_ROW, error: null };

      const response = await getSettings();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tool_use_enabled).toBe(SETTINGS_ROW.tool_use_enabled);
      expect(body.rubric_cost_cap_cents).toBe(SETTINGS_ROW.rubric_cost_cap_cents);
      expect(body.retrieval_timeout_seconds).toBe(SETTINGS_ROW.retrieval_timeout_seconds);
    });
  });

  describe('Given no org_config row exists for this org', () => {
    // Regression guard for issue #251: "persists defaults (false, 20, 120) when no row exists yet"
    it('then it returns 200 with DEFAULT_RETRIEVAL_SETTINGS', async () => {
      selectResult = { data: null, error: null };

      const response = await getSettings();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tool_use_enabled).toBe(DEFAULT_SETTINGS.tool_use_enabled);
      expect(body.rubric_cost_cap_cents).toBe(DEFAULT_SETTINGS.rubric_cost_cap_cents);
      expect(body.retrieval_timeout_seconds).toBe(DEFAULT_SETTINGS.retrieval_timeout_seconds);
    });
  });
});
