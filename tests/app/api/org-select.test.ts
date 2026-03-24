// Tests for the org-select API route — sets the fcs-org-id cookie.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/route-handler', () => ({
  createRouteHandlerSupabaseClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { NextRequest } from 'next/server';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeMockClient(
  user: { id: string } | null,
  isMember: boolean,
) {
  const selectResult = isMember
    ? { data: [{ org_id: 'org-001', user_id: user?.id }], error: null }
    : { data: [], error: null };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/org-select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an unauthenticated request', () => {
    it('then it returns 401', async () => {
      mockCreateRouteHandler.mockReturnValue(
        makeMockClient(null, false) as never,
      );

      const request = new NextRequest(
        'http://localhost/api/org-select?orgId=org-001',
      );
      const { GET } = await import('@/app/api/org-select/route');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Given an authenticated request with a valid orgId', () => {
    it('then it sets the fcs-org-id cookie and redirects to /assessments', async () => {
      mockCreateRouteHandler.mockReturnValue(
        makeMockClient({ id: 'u-001' }, true) as never,
      );

      const request = new NextRequest(
        'http://localhost/api/org-select?orgId=org-001',
      );
      const { GET } = await import('@/app/api/org-select/route');
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/assessments');
      expect(response.cookies.get('fcs-org-id')?.value).toBe('org-001');
    });
  });

  describe('Given an authenticated request for an org the user does not belong to', () => {
    it('then it returns 403', async () => {
      mockCreateRouteHandler.mockReturnValue(
        makeMockClient({ id: 'u-001' }, false) as never,
      );

      const request = new NextRequest(
        'http://localhost/api/org-select?orgId=org-999',
      );
      const { GET } = await import('@/app/api/org-select/route');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });
  });

  describe('Given a request with no orgId parameter', () => {
    it('then it returns 400', async () => {
      mockCreateRouteHandler.mockReturnValue(
        makeMockClient({ id: 'u-001' }, true) as never,
      );

      const request = new NextRequest('http://localhost/api/org-select');
      const { GET } = await import('@/app/api/org-select/route');
      const response = await GET(request);

      expect(response.status).toBe(400);
    });
  });
});
