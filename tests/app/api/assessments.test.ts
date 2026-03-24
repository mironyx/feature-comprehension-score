// Tests for GET /api/assessments — list endpoint.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/auth', () => ({
  requireOrgAdmin: vi.fn(),
}));

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => mockSupabaseClient),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => mockSecretClient),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireOrgAdmin } from '@/lib/api/auth';

// ---------------------------------------------------------------------------
// Mock Supabase client state
// ---------------------------------------------------------------------------

const mockRangeOrder = vi.fn();
const mockRange = vi.fn(() => ({ order: mockRangeOrder }));
const mockEqStatus = vi.fn(() => ({ range: mockRange }));
const mockEqType = vi.fn(() => ({ eq: mockEqStatus, range: mockRange }));
const mockEqOrg = vi.fn(() => ({ eq: mockEqType, range: mockRange }));
const mockSelect = vi.fn(() => ({ eq: mockEqOrg }));

const mockParticipantsIn = vi.fn();
const mockParticipantsSelect = vi.fn(() => ({ in: mockParticipantsIn }));

const mockSupabaseClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') {
      return { select: mockSelect };
    }
    return {};
  }),
};

// Secret client is used for participant counts (bypasses RLS).
const mockSecretClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessment_participants') {
      return { select: mockParticipantsSelect };
    }
    return {};
  }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: 'user-001',
  email: 'alice@example.com',
  githubUserId: 1001,
  githubUsername: 'alice',
};

const ORG_ID = 'org-uuid-001';

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const searchParams = new URLSearchParams({ org_id: ORG_ID, ...params });
  return new NextRequest(`http://localhost/api/assessments?${searchParams}`);
}

function makeAssessmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assess-001',
    type: 'prcc',
    status: 'completed',
    org_id: ORG_ID,
    repository_id: 'repo-001',
    pr_number: 42,
    feature_name: null,
    aggregate_score: 85,
    conclusion: 'success',
    created_at: '2026-01-01T00:00:00Z',
    repositories: { github_repo_name: 'my-repo' },
    ...overrides,
  };
}

function setupAssessmentsQuery(rows: unknown[], count = rows.length) {
  mockRangeOrder.mockResolvedValue({ data: rows, error: null, count });
}

function setupParticipantsQuery(
  rows: Array<{ assessment_id: string; status: string }>,
) {
  mockParticipantsIn.mockResolvedValue({ data: rows, error: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOrgAdmin).mockResolvedValue(AUTH_USER);
});

describe('GET /api/assessments', () => {
  describe('Given an unauthenticated request', () => {
    it('then it returns 401', async () => {
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireOrgAdmin).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest());

      expect(response.status).toBe(401);
    });
  });

  describe('Given a request without org_id', () => {
    it('then it returns 400', async () => {
      const request = new NextRequest('http://localhost/api/assessments');
      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toMatch(/org_id/i);
    });
  });

  describe('Given an org admin requesting assessments', () => {
    it('then it returns all assessments for the org', async () => {
      const rows = [
        makeAssessmentRow({ id: 'assess-001' }),
        makeAssessmentRow({ id: 'assess-002', type: 'fcs', feature_name: 'My Feature' }),
      ];
      setupAssessmentsQuery(rows, 2);
      setupParticipantsQuery([
        { assessment_id: 'assess-001', status: 'submitted' },
        { assessment_id: 'assess-001', status: 'pending' },
        { assessment_id: 'assess-002', status: 'submitted' },
      ]);

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest());

      expect(response.status).toBe(200);
      const body = await response.json() as {
        assessments: unknown[];
        total: number;
        page: number;
        per_page: number;
      };
      expect(body.assessments).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.per_page).toBe(20);
    });

    it('then each assessment includes participant_count and completed_count', async () => {
      const rows = [makeAssessmentRow({ id: 'assess-001' })];
      setupAssessmentsQuery(rows, 1);
      setupParticipantsQuery([
        { assessment_id: 'assess-001', status: 'submitted' },
        { assessment_id: 'assess-001', status: 'submitted' },
        { assessment_id: 'assess-001', status: 'pending' },
      ]);

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest());

      const body = await response.json() as {
        assessments: Array<{
          participant_count: number;
          completed_count: number;
          repository_name: string;
        }>;
      };
      expect(body.assessments[0]?.participant_count).toBe(3);
      expect(body.assessments[0]?.completed_count).toBe(2);
      expect(body.assessments[0]?.repository_name).toBe('my-repo');
    });
  });

  describe('Given a regular user (non-admin)', () => {
    it('then it returns only assessments where they are a participant', async () => {
      vi.mocked(requireOrgAdmin).mockRejectedValue(
        new (await import('@/lib/api/errors')).ApiError(403, 'Forbidden'),
      );
      const rows = [makeAssessmentRow({ id: 'assess-mine' })];
      setupAssessmentsQuery(rows, 1);
      setupParticipantsQuery([
        { assessment_id: 'assess-mine', status: 'submitted' },
      ]);

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest());

      expect(response.status).toBe(200);
      const body = await response.json() as { assessments: unknown[] };
      // RLS handles the scoping — route still returns 200 with scoped results
      expect(body.assessments).toHaveLength(1);
    });
  });

  describe('Given type=prcc filter', () => {
    it('then it queries with the type filter', async () => {
      const rows = [makeAssessmentRow({ type: 'prcc' })];
      setupAssessmentsQuery(rows, 1);
      setupParticipantsQuery([]);

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest({ type: 'prcc' }));

      expect(response.status).toBe(200);
      expect(mockEqType).toHaveBeenCalledWith('type', 'prcc');
    });
  });

  describe('Given an invalid type filter', () => {
    it('then it returns 400', async () => {
      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest({ type: 'unknown' }));

      expect(response.status).toBe(400);
    });
  });

  describe('Given an invalid status filter', () => {
    it('then it returns 400', async () => {
      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest({ status: 'bogus' }));

      expect(response.status).toBe(400);
    });
  });

  describe('Given pagination parameters page=2 per_page=10', () => {
    it('then it returns the correct page with correct total', async () => {
      const rows = [makeAssessmentRow()];
      setupAssessmentsQuery(rows, 25);
      setupParticipantsQuery([]);

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest({ page: '2', per_page: '10' }));

      expect(response.status).toBe(200);
      const body = await response.json() as {
        total: number;
        page: number;
        per_page: number;
      };
      expect(body.total).toBe(25);
      expect(body.page).toBe(2);
      expect(body.per_page).toBe(10);
      // range(10, 19) for page 2 with per_page 10
      expect(mockRange).toHaveBeenCalledWith(10, 19);
    });
  });

  describe('Given a DB error', () => {
    it('then it returns 500', async () => {
      mockRangeOrder.mockResolvedValue({
        data: null,
        error: { message: 'DB failure' },
        count: null,
      });

      const { GET } = await import('@/app/api/assessments/route');
      const response = await GET(makeRequest());

      expect(response.status).toBe(500);
    });
  });
});
