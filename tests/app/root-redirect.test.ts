// Tests for root redirect server component (Home).
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md §A.2, §B.3
// Requirements reference: docs/requirements/v11-requirements.md §Story 4.4, §Story 4.6
// Issue: #434

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('@/lib/supabase/membership', () => ({
  getOrgRole: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

// AdminRootRedirect is a client component; mock it to return a recognisable
// React element so we can assert on the props passed to it.
vi.mock('@/app/admin-root-redirect', () => ({
  AdminRootRedirect: vi.fn(({ projectIds }: { projectIds: string[] }) => ({
    type: 'AdminRootRedirect',
    props: { projectIds },
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { redirect } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetSelectedOrgId = vi.mocked(getSelectedOrgId);
const mockGetOrgRole = vi.mocked(getOrgRole);
const mockRedirect = vi.mocked(redirect);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** Build a Supabase mock with optional authenticated user and project rows. */
function makeSupabaseMock(
  user: { id: string } | null,
  projectRows: { id: string }[] | null = [],
) {
  const projectsQuery = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: projectRows, error: null }),
    }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn().mockReturnValue(projectsQuery),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Root redirect (Home page)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Property 1: Unauthenticated user → redirect('/auth/sign-in')
  // [req §Story 4.4 AC5] [lld §A.2]
  // -------------------------------------------------------------------------

  describe('Given an unauthenticated user visits /', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseMock(null) as never);
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue(null);

      const { default: Home } = await import('@/app/page');
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Authenticated user but no orgId cookie → redirect('/org-select')
  // [req §Story 4.4 implicit — existing redirect unchanged] [lld §A.2]
  // -------------------------------------------------------------------------

  describe('Given an authenticated user with no org cookie visits /', () => {
    it('then it redirects to /org-select', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseMock({ id: 'u-001' }) as never);
      mockGetSelectedOrgId.mockReturnValue(null);
      mockGetOrgRole.mockResolvedValue(null);

      const { default: Home } = await import('@/app/page');
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT:/org-select');
      expect(mockRedirect).toHaveBeenCalledWith('/org-select');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Org Member (getOrgRole returns null) → redirect('/assessments')
  // [req §Story 4.4 AC4] [lld §A.2 "member (role = null)"]
  // -------------------------------------------------------------------------

  describe('Given an authenticated Org Member (role = null) visits /', () => {
    it('then it redirects to /assessments', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseMock({ id: 'u-002' }) as never);
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue(null);

      const { default: Home } = await import('@/app/page');
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT:/assessments');
      expect(mockRedirect).toHaveBeenCalledWith('/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Admin role — queries `projects` table filtering by `org_id`
  //             and selecting `id`
  // [lld §A.2 "select id from projects where org_id = $1"] [lld §B.3]
  // -------------------------------------------------------------------------

  describe('Given an authenticated admin visits /', () => {
    it('then it queries projects filtered by org_id', async () => {
      const supabase = makeSupabaseMock({ id: 'u-003' }, [{ id: 'proj-1' }]);
      mockCreateServer.mockResolvedValue(supabase as never);
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('admin');

      const { default: Home } = await import('@/app/page');
      await Home();

      expect(supabase.from).toHaveBeenCalledWith('projects');
      const selectResult = supabase.from.mock.results[0].value;
      const eqResult = selectResult.select.mock.results[0].value;
      expect(selectResult.select).toHaveBeenCalledWith('id');
      expect(eqResult.eq).toHaveBeenCalledWith('org_id', 'org-001');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Admin role — returns an AdminRootRedirect element with
  //             projectIds matching the project IDs from the query
  // [req §Story 4.4 AC1] [lld §A.2] [lld §B.3]
  // -------------------------------------------------------------------------

  describe('Given an authenticated admin with active projects visits /', () => {
    it('then it renders AdminRootRedirect with the project IDs', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseMock({ id: 'u-003' }, [{ id: 'proj-1' }, { id: 'proj-2' }]) as never,
      );
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('admin');

      const { default: Home } = await import('@/app/page');
      const result = await Home();

      // Result is the AdminRootRedirect element (or React element wrapping it).
      const element = result as { type: unknown; props: Record<string, unknown> };
      // The rendered output must reference the project IDs from the DB.
      const projectIds = element.props.projectIds as string[];
      expect(projectIds).toContain('proj-1');
      expect(projectIds).toContain('proj-2');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Admin role — when no projects exist (data is null),
  //             passes empty projectIds array
  // [lld §B.3 "(projects ?? []).map(p => p.id)"]
  // -------------------------------------------------------------------------

  describe('Given an authenticated admin with no projects visits /', () => {
    it('then it renders AdminRootRedirect with an empty projectIds array when data is null', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseMock({ id: 'u-003' }, null) as never,
      );
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('admin');

      const { default: Home } = await import('@/app/page');
      const result = await Home();

      const element = result as { type: unknown; props: Record<string, unknown> };
      expect(element.props.projectIds).toEqual([]);
    });

    it('then it renders AdminRootRedirect with an empty projectIds array when data is an empty array', async () => {
      // [lld §B.3] null-coalescing handles both null and []
      mockCreateServer.mockResolvedValue(
        makeSupabaseMock({ id: 'u-003' }, []) as never,
      );
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('admin');

      const { default: Home } = await import('@/app/page');
      const result = await Home();

      const element = result as { type: unknown; props: Record<string, unknown> };
      expect(element.props.projectIds).toEqual([]);
    });
  });
});
