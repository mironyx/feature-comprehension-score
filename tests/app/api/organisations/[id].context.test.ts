// Tests for PATCH /api/organisations/[id]/context — upsert org prompt context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/auth', () => ({
  requireOrgAdmin: vi.fn(),
}));

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  upsertOrgContext: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireOrgAdmin } from '@/lib/api/auth';
import { upsertOrgContext } from '@/lib/supabase/org-prompt-context';
import type { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>;
let PATCH: RouteHandler;

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
  vi.mocked(requireOrgAdmin).mockResolvedValue(AUTH_USER);
  vi.mocked(upsertOrgContext).mockResolvedValue(CONTEXT_ROW);
  ({ PATCH } = await import(
    '@/app/api/organisations/[id]/context/route'
  ));
});

describe('PATCH /api/organisations/[id]/context', () => {
  describe('Given a non-admin caller', () => {
    it('then it returns 403', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireOrgAdmin).mockRejectedValue(
        new ApiError(403, 'Forbidden'),
      );

      const response = await patchContext({ focus_areas: ['API design'] });

      expect(response.status).toBe(403);
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
      expect(upsertOrgContext).toHaveBeenCalledWith(
        ORG_ID,
        { focus_areas: ['API design'] },
      );
    });
  });

  describe('Given a valid admin request with all fields', () => {
    it('then it passes the full context to upsertOrgContext', async () => {
      const fullContext = {
        domain_vocabulary: [{ term: 'saga', definition: 'long-running process' }],
        focus_areas: ['event sourcing'],
        exclusions: ['legacy module'],
        domain_notes: 'We use CQRS.',
      };
      vi.mocked(upsertOrgContext).mockResolvedValue({
        ...CONTEXT_ROW,
        context: fullContext,
      });

      const response = await patchContext(fullContext);

      expect(response.status).toBe(200);
      expect(upsertOrgContext).toHaveBeenCalledWith(ORG_ID, fullContext);
    });
  });
});
