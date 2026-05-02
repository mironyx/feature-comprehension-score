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
 * Builds a mock Supabase client matching the layout's three queries:
 * - organisations    → .select('*').eq('id', orgId).maybeSingle()
 * - user_organisations (org switcher) → .select('org_id').eq('user_id', userId)
 * - user_organisations (getOrgRole)   → .select('github_role, admin_repo_github_ids')
 *                                        .eq('org_id', orgId).eq('user_id', userId).maybeSingle()
 *
 * @param adminRepoGithubIds — non-empty array triggers repo_admin derivation in getOrgRole
 */
function makeMockClient(
  user: { id: string; user_metadata: Record<string, unknown> } | null,
  memberships: { org_id: string; github_role: string }[],
  currentOrg: typeof mockOrg | null,
  adminRepoGithubIds: number[] = [],
) {
  const snapshot = memberships.find((m) => m.org_id === ORG_ID) ?? null;
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
      // user_organisations — two query shapes:
      //   list  : .select(...).eq('user_id', uid)            → resolves array
      //   single: .select(...).eq('org_id', oid).eq('user_id', uid).maybeSingle()
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col: string) => {
            if (col === 'user_id') {
              return Promise.resolve({ data: memberships, error: null });
            }
            // org_id branch — return chainable for the second .eq().maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: snapshot
                    ? { github_role: snapshot.github_role, admin_repo_github_ids: adminRepoGithubIds }
                    : null,
                  error: null,
                }),
              }),
            };
          }),
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

  // -------------------------------------------------------------------------
  // Role propagation: layout passes correct isAdminOrRepoAdmin to NavBar.
  // [lld §B.1] Layout uses getOrgRole (not github_role === 'admin') — the
  // Repo Admin path (non-empty admin_repo_github_ids) was previously missed.
  // These tests walk the returned JSX element tree to read the prop.
  // -------------------------------------------------------------------------

  /**
   * Walk a React element tree (plain objects) to find the first element whose
   * props contain `isAdminOrRepoAdmin`.  Returns the prop value, or undefined.
   */
  function findIsAdminProp(node: unknown): boolean | undefined {
    if (!node || typeof node !== 'object') return undefined;
    const el = node as { props?: Record<string, unknown>; children?: unknown };
    if (el.props && 'isAdminOrRepoAdmin' in el.props) {
      return el.props['isAdminOrRepoAdmin'] as boolean;
    }
    const children = el.props?.children ?? (el as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const found = findIsAdminProp(child);
        if (found !== undefined) return found;
      }
    } else if (children !== undefined) {
      return findIsAdminProp(children);
    }
    return undefined;
  }

  describe('Given an Org Admin (github_role = admin)', () => {
    it('then the layout passes isAdminOrRepoAdmin=true to NavBar', async () => {
      // [lld §B.1, I1] Org Admin role → isAdminOrRepoAdmin = true
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { id: USER_ID, user_metadata: { user_name: 'alice', provider_id: '42' } },
          [{ org_id: ORG_ID, github_role: 'admin' }],
          mockOrg,
        ) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );
      const result = await AuthenticatedLayout({ children: null });

      expect(findIsAdminProp(result)).toBe(true);
    });
  });

  describe('Given a Repo Admin (github_role = member, admin_repo_github_ids non-empty)', () => {
    it('then the layout passes isAdminOrRepoAdmin=true to NavBar', async () => {
      // [lld §B.1, I1] Repo Admin (repo-level admin access) → isAdminOrRepoAdmin = true.
      // This is the new V11 role path — the old layout used github_role === 'admin'
      // which returned false for Repo Admins.
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { id: USER_ID, user_metadata: { user_name: 'bob', provider_id: '43' } },
          [{ org_id: ORG_ID, github_role: 'member' }],
          mockOrg,
          [99001], // non-empty adminRepoGithubIds → repo_admin
        ) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );
      const result = await AuthenticatedLayout({ children: null });

      expect(findIsAdminProp(result)).toBe(true);
    });
  });

  describe('Given an Org Member (github_role = member, no repo admin access)', () => {
    it('then the layout passes isAdminOrRepoAdmin=false to NavBar', async () => {
      // [lld §B.1, I1] Plain member → isAdminOrRepoAdmin = false
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { id: USER_ID, user_metadata: { user_name: 'carol', provider_id: '44' } },
          [{ org_id: ORG_ID, github_role: 'member' }],
          mockOrg,
          [], // empty adminRepoGithubIds → null role → false
        ) as never,
      );

      const { default: AuthenticatedLayout } = await import(
        '@/app/(authenticated)/layout'
      );
      const result = await AuthenticatedLayout({ children: null });

      expect(findIsAdminProp(result)).toBe(false);
    });
  });
});
