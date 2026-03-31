// Tests for /assessments page — query filter includes rubric_generation.
// Design reference: docs/design/lld-phase-2-demo-ready.md §2a.1
// Issue: #130

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('@/lib/supabase/membership', () => ({
  isOrgAdmin: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/app/(authenticated)/assessments/assessment-status', () => ({
  StatusBadge: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockIsOrgAdmin = vi.mocked(isOrgAdmin);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';

function makeClient({
  assessments = [],
}: {
  assessments?: unknown[];
} = {}) {
  const mockIn = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({
      data: assessments,
      error: null,
    }),
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_organisations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ github_role: 'admin' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: mockIn,
          }),
        }),
      };
    }),
    _mockIn: mockIn,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessments page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockIsOrgAdmin.mockReturnValue(true);
  });

  describe('Given visible assessments', () => {
    it('queries both rubric_generation and awaiting_responses', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage();

      expect(client._mockIn).toHaveBeenCalledWith(
        'status',
        ['rubric_generation', 'awaiting_responses'],
      );
    });

    it('renders assessments as a list', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'a1',
            feature_name: 'Feature A',
            status: 'awaiting_responses',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage();

      expect(result).toBeTruthy();
    });

    it('shows empty message when no assessments', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('No pending assessments');
    });
  });
});
