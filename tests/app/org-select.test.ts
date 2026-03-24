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

type UserOrgWithOrg = {
  org_id: string;
  github_role: string;
  organisations: OrgRow;
};

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: `org-${Math.random()}`,
    github_org_name: 'acme',
    github_org_id: 1001,
    installation_id: 9001,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockClient(
  user: { id: string } | null,
  userOrgs: UserOrgWithOrg[],
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: userOrgs, error: null }),
      }),
    }),
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
      mockCreateServer.mockResolvedValue(makeMockClient(null, []) as never);

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      await expect(OrgSelectPage()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given a user with no organisations', () => {
    it('then it does not redirect', async () => {
      mockCreateServer.mockResolvedValue(makeMockClient({ id: 'u-001' }, []) as never);

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      const result = await OrgSelectPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });

  describe('Given a user with exactly one organisation', () => {
    it('then it auto-redirects to /assessments', async () => {
      const org = makeOrg({ id: 'org-001', github_org_name: 'acme' });
      const userOrgs: UserOrgWithOrg[] = [
        { org_id: org.id, github_role: 'member', organisations: org },
      ];
      mockCreateServer.mockResolvedValue(makeMockClient({ id: 'u-001' }, userOrgs) as never);

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      await expect(OrgSelectPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
      expect(mockRedirect).toHaveBeenCalledWith('/assessments');
    });
  });

  describe('Given a user with multiple organisations', () => {
    it('then it does not redirect', async () => {
      const org1 = makeOrg({ id: 'org-001', github_org_name: 'acme' });
      const org2 = makeOrg({ id: 'org-002', github_org_name: 'globex' });
      const userOrgs: UserOrgWithOrg[] = [
        { org_id: org1.id, github_role: 'admin', organisations: org1 },
        { org_id: org2.id, github_role: 'member', organisations: org2 },
      ];
      mockCreateServer.mockResolvedValue(
        makeMockClient({ id: 'u-001' }, userOrgs) as never,
      );

      const { default: OrgSelectPage } = await import('@/app/org-select/page');
      const result = await OrgSelectPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });
});
