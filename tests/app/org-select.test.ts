// Tests for org selection page redirect/routing logic.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockRedirect = vi.mocked(redirect);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

interface OrgRow {
  id: string;
  github_org_name: string;
  github_org_id: number;
  installation_id: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface MembershipRow {
  id: string;
  user_id: string;
  org_id: string;
  github_user_id: number;
  github_username: string;
  github_role: string;
  created_at: string;
  updated_at: string;
}

function makeOrg(id: string, name: string): OrgRow {
  return {
    id,
    github_org_name: name,
    github_org_id: 1001,
    installation_id: 9001,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeMembership(userId: string, orgId: string): MembershipRow {
  return {
    id: `mem-${orgId}`,
    user_id: userId,
    org_id: orgId,
    github_user_id: 42,
    github_username: 'alice',
    github_role: 'member',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Builds a mock Supabase client that serves two sequential FROM queries.
 * First call returns memberships; second call returns orgs (via .in()).
 */
function makeMockClient(
  user: { id: string } | null,
  memberships: MembershipRow[],
  orgs: OrgRow[],
) {
  const fromImpl = vi.fn()
    .mockReturnValueOnce({
      // user_organisations query: .select('*').eq('user_id', ...)
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
      }),
    })
    .mockReturnValueOnce({
      // organisations query: .select('*').in('id', [...])
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ data: orgs, error: null }),
      }),
    });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: fromImpl,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Org select page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an unauthenticated user', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeMockClient(null, [], []) as never);

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      await expect(OrgSelectPage()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given a user with no organisations', () => {
    it('then it does not redirect', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient({ id: 'u-001' }, [], []) as never,
      );

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      const result = await OrgSelectPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });

  describe('Given a user with exactly one organisation', () => {
    it('then it routes through /api/org-select to set the cookie before redirecting', async () => {
      const org = makeOrg('org-001', 'acme');
      const memberships = [makeMembership('u-001', 'org-001')];
      mockCreateServer.mockResolvedValue(
        makeMockClient({ id: 'u-001' }, memberships, [org]) as never,
      );

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      await expect(OrgSelectPage()).rejects.toThrow(
        'NEXT_REDIRECT:/api/org-select?orgId=org-001',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/api/org-select?orgId=org-001');
    });
  });

  describe('Given a user with multiple organisations', () => {
    it('then it does not redirect', async () => {
      const org1 = makeOrg('org-001', 'acme');
      const org2 = makeOrg('org-002', 'globex');
      const memberships = [
        makeMembership('u-001', 'org-001'),
        makeMembership('u-001', 'org-002'),
      ];
      mockCreateServer.mockResolvedValue(
        makeMockClient({ id: 'u-001' }, memberships, [org1, org2]) as never,
      );

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      const result = await OrgSelectPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });
});
