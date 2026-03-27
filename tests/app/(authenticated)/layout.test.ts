// Tests for (authenticated) layout — auth check and org membership loading.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

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

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockRedirect = vi.mocked(redirect);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ORG_ID = 'org-001';

const mockOrg = {
  id: ORG_ID,
  github_org_name: 'acme',
  github_org_id: 1001,
  installation_id: 9001,
  status: 'active' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Builds a mock Supabase client matching fetchOrgContext's two parallel queries:
 * - organisations → .select('*').eq('id', orgId).maybeSingle()
 * - user_organisations → .select('org_id, github_role').eq('user_id', userId)
 */
function makeMockClient(
  user: { id: string; user_metadata: Record<string, unknown> } | null,
  memberships: { org_id: string; github_role: string }[],
  currentOrg: typeof mockOrg | null,
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'organisations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: currentOrg, error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
        }),
      };
    }),
  };
}

const mockCookieStore = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Authenticated layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(null, [], null) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );

      await expect(
        AuthenticatedLayout({ children: null }),
      ).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');

      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given an authenticated user with no org selected', () => {
    it('then it redirects to /org-select', async () => {
      mockGetOrgId.mockReturnValue(null);
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { id: USER_ID, user_metadata: { user_name: 'alice', provider_id: '42' } },
          [],
          null,
        ) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );

      await expect(
        AuthenticatedLayout({ children: null }),
      ).rejects.toThrow('NEXT_REDIRECT:/org-select');

      expect(mockRedirect).toHaveBeenCalledWith('/org-select');
    });
  });

  describe('Given an authenticated user with an org', () => {
    it('then it renders the layout without redirecting', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { id: USER_ID, user_metadata: { user_name: 'alice', provider_id: '42' } },
          [{ org_id: ORG_ID, github_role: 'member' }],
          mockOrg,
        ) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );

      const result = await AuthenticatedLayout({ children: null });

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });
});
