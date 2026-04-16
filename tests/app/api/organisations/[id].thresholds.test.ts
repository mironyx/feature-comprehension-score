// Tests for GET/PATCH /api/organisations/[id]/thresholds — org threshold config.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237

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
// Mock Supabase chain — mirrors the pattern from [id].context.test.ts
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

const ORG_ID = 'org-uuid-237';
const AUTH_USER = {
  id: 'user-237',
  email: 'admin@example.com',
  githubUserId: 2001,
  githubUsername: 'admin-user',
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
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipResult = { data: [{ github_role: 'admin' }], error: null };
  upsertResult = { data: THRESHOLDS_ROW, error: null };
  selectResult = { data: THRESHOLDS_ROW, error: null };
  ({ PATCH, GET } = await import(
    '@/app/api/organisations/[id]/thresholds/route'
  ));
});

// ---------------------------------------------------------------------------
// PATCH /api/organisations/[id]/thresholds
// ---------------------------------------------------------------------------

describe('PATCH /api/organisations/[id]/thresholds', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller (github_role=member)', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Given artefact_quality_threshold outside [0,1] (value: -0.1)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: -0.1,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given artefact_quality_threshold outside [0,1] (value: 1.1)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: 1.1,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given fcs_low_threshold outside [0,100] (value: -1)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: -1,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given fcs_low_threshold outside [0,100] (value: 101)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 101,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a missing required field (artefact_quality_threshold absent)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a missing required field (fcs_low_threshold absent)', () => {
    it('then it returns 422', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
      });

      expect(response.status).toBe(422);
    });
  });

  describe('Given a valid admin request with threshold values', () => {
    it('then it returns 200 with the updated thresholds', async () => {
      const response = await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.artefact_quality_threshold).toBe(0.6);
      expect(body.fcs_low_threshold).toBe(60);
    });
  });

  describe('Given a valid admin request with non-default values', () => {
    it('then it persists and returns the new values', async () => {
      const updated = {
        org_id: ORG_ID,
        artefact_quality_threshold: 0.8,
        fcs_low_threshold: 75,
      };
      upsertResult = { data: updated, error: null };

      const response = await patchThresholds({
        artefact_quality_threshold: 0.8,
        fcs_low_threshold: 75,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.artefact_quality_threshold).toBe(0.8);
      expect(body.fcs_low_threshold).toBe(75);
    });
  });

  describe('Given a valid admin request', () => {
    it('then it writes to the org_config table via the admin client', async () => {
      await patchThresholds({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });

      expect(mockAdminClient.from).toHaveBeenCalledWith('org_config');
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/organisations/[id]/thresholds
// ---------------------------------------------------------------------------

describe('GET /api/organisations/[id]/thresholds', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(
        new ApiError(401, 'Unauthenticated'),
      );

      const response = await getThresholds();

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller (github_role=member)', () => {
    it('then it returns 403', async () => {
      membershipResult = { data: [{ github_role: 'member' }], error: null };

      const response = await getThresholds();

      expect(response.status).toBe(403);
    });
  });

  describe('Given the org_config row has threshold values', () => {
    it('then it returns 200 with artefact_quality_threshold and fcs_low_threshold', async () => {
      const response = await getThresholds();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.artefact_quality_threshold).toBe(0.6);
      expect(body.fcs_low_threshold).toBe(60);
    });
  });

  describe('Given no org_config row exists for the org', () => {
    it('then it returns 200 with default threshold values', async () => {
      selectResult = { data: null, error: null };

      const response = await getThresholds();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.artefact_quality_threshold).toBe(0.6);
      expect(body.fcs_low_threshold).toBe(60);
    });
  });
});
