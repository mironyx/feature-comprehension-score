import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  mockGitHubUser,
  mockUserOrgs,
  mockOrgMembershipRole,
} from '../../mocks/github';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OrgRow = Database['public']['Tables']['organisations']['Row'];
type UserOrgRow = Database['public']['Tables']['user_organisations']['Row'];

const TEST_USER_ID = 'user-uuid-001';
const TEST_PROVIDER_TOKEN = 'gho_test_token';
const GITHUB_USER: { id: number; login: string } = { id: 42, login: 'alice' };

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: `org-uuid-${Math.random()}`,
    github_org_id: 1001,
    github_org_name: 'acme',
    installation_id: 9001,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeUserOrg(orgId: string, overrides: Partial<UserOrgRow> = {}): UserOrgRow {
  return {
    id: `uo-uuid-${Math.random()}`,
    user_id: TEST_USER_ID,
    org_id: orgId,
    github_user_id: GITHUB_USER.id,
    github_username: GITHUB_USER.login,
    github_role: 'member',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Builds a minimal mock Supabase client for org-sync tests. */
function buildMockClient(opts: {
  installedOrgs: OrgRow[];
  finalUserOrgs: UserOrgRow[];
  existingUserOrgs?: UserOrgRow[];
  orgQueryError?: { message: string };
}) {
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteSpy = vi.fn();

  // delete chain: .eq() returns a real Promise extended with .not(), so both
  //   `await deleteQuery` and `await deleteQuery.not(...)` resolve correctly
  //   without adding `then` to a plain object (which triggers sonarqube S7739).
  const notSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqResult = Object.assign(
    Promise.resolve({ data: null, error: null }),
    { not: notSpy },
  );
  const deleteChain = { eq: vi.fn().mockReturnValue(eqResult) };
  deleteSpy.mockReturnValue(deleteChain);

  const existingRows = opts.existingUserOrgs ?? [];
  const finalRows = opts.finalUserOrgs;

  // select chain for final read: returns finalUserOrgs on the first call after upsert,
  // or existingUserOrgs for the transient-error bail-out path
  let selectCallCount = 0;
  const selectChain = {
    eq: vi.fn().mockImplementation(() => {
      selectCallCount++;
      // transient-error path calls select before any upsert — return existing rows
      const rows = upsertSpy.mock.calls.length === 0 ? existingRows : finalRows;
      return Promise.resolve({ data: rows, error: null });
    }),
  };

  // organisations query: .select(...).in(...).eq(...)
  const orgsSelectChain = {
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: opts.orgQueryError ? null : opts.installedOrgs,
      error: opts.orgQueryError ?? null,
    }),
  };

  const fromSpy = vi.fn((table: string) => {
    if (table === 'organisations') {
      return { select: vi.fn().mockReturnValue(orgsSelectChain) };
    }
    if (table === 'user_organisations') {
      return {
        upsert: upsertSpy,
        delete: deleteSpy,
        select: vi.fn().mockReturnValue(selectChain),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const client = { from: fromSpy } as unknown as SupabaseClient<Database>;
  return { client, upsertSpy, deleteSpy, orgsSelectChain, selectCallCount: () => selectCallCount };
}

// ---------------------------------------------------------------------------
// MSW lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncOrgMembership', () => {
  describe('Given a user who belongs to 2 orgs with the app installed', () => {
    it('then both orgs appear in user_organisations', async () => {
      const org1 = makeOrg({ github_org_id: 1001, github_org_name: 'acme', id: 'org-1' });
      const org2 = makeOrg({ github_org_id: 1002, github_org_name: 'beta', id: 'org-2' });
      const uo1 = makeUserOrg('org-1', { github_role: 'admin' });
      const uo2 = makeUserOrg('org-2', { github_role: 'member' });

      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([
          { id: 1001, login: 'acme' },
          { id: 1002, login: 'beta' },
        ]),
        mockOrgMembershipRole('acme', GITHUB_USER.login, 'admin'),
        mockOrgMembershipRole('beta', GITHUB_USER.login, 'member'),
      );

      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [org1, org2],
        finalUserOrgs: [uo1, uo2],
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      const result = await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(result).toHaveLength(2);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ org_id: 'org-1', github_role: 'admin' }),
          expect.objectContaining({ org_id: 'org-2', github_role: 'member' }),
        ]),
        expect.objectContaining({ onConflict: 'user_id,org_id' }),
      );
    });
  });

  describe('Given a user whose org membership changed since last login', () => {
    it('then user_organisations is updated on sign-in', async () => {
      const org1 = makeOrg({ github_org_id: 1001, github_org_name: 'acme', id: 'org-1' });
      const uo1Updated = makeUserOrg('org-1', { github_role: 'admin' });

      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([{ id: 1001, login: 'acme' }]),
        mockOrgMembershipRole('acme', GITHUB_USER.login, 'admin'),
      );

      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [org1],
        finalUserOrgs: [uo1Updated],
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      const result = await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ github_role: 'admin', org_id: 'org-1' }),
        ]),
        expect.objectContaining({ onConflict: 'user_id,org_id' }),
      );
      expect(result[0]?.github_role).toBe('admin');
    });
  });

  describe('Given a user who belongs to an org without the app installed', () => {
    it('then that org does not appear in user_organisations', async () => {
      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([{ id: 9999, login: 'no-app-org' }]),
      );

      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [],
        finalUserOrgs: [],
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      const result = await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(upsertSpy).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });
  });

  describe('Given a user who was removed from an org', () => {
    it('then the stale user_organisations row is deleted', async () => {
      // User is now only in 'acme', but previously was also in 'beta'
      const org1 = makeOrg({ github_org_id: 1001, github_org_name: 'acme', id: 'org-1' });
      const uo1 = makeUserOrg('org-1');

      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([{ id: 1001, login: 'acme' }]),
        mockOrgMembershipRole('acme', GITHUB_USER.login, 'member'),
      );

      const { client, deleteSpy } = buildMockClient({
        installedOrgs: [org1],
        finalUserOrgs: [uo1],
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(deleteSpy).toHaveBeenCalled();
      const chain = deleteSpy.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
      expect(chain.eq).toHaveBeenCalledWith('user_id', TEST_USER_ID);
    });
  });

  describe('Given a transient GitHub API error during membership fetch', () => {
    it('then existing memberships are preserved (not deleted)', async () => {
      const org1 = makeOrg({ github_org_id: 1001, github_org_name: 'acme', id: 'org-1' });
      const existingUo = makeUserOrg('org-1', { github_role: 'member' });

      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([{ id: 1001, login: 'acme' }]),
        // 500 error simulates a transient GitHub API failure
        http.get('https://api.github.com/orgs/acme/memberships/alice', () =>
          HttpResponse.json({ message: 'Server Error' }, { status: 500 }),
        ),
      );

      const { client, upsertSpy, deleteSpy } = buildMockClient({
        installedOrgs: [org1],
        finalUserOrgs: [],
        existingUserOrgs: [existingUo],
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      const result = await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(upsertSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]?.org_id).toBe('org-1');
    });
  });

  describe('Given a Supabase DB error when querying installed orgs', () => {
    it('then existing memberships are preserved (not deleted)', async () => {
      const existingUo = makeUserOrg('org-1', { github_role: 'admin' });

      server.use(
        mockGitHubUser(GITHUB_USER),
        mockUserOrgs([{ id: 1001, login: 'acme' }]),
      );

      const { client, upsertSpy, deleteSpy } = buildMockClient({
        installedOrgs: [],
        finalUserOrgs: [],
        existingUserOrgs: [existingUo],
        orgQueryError: { message: 'connection timeout' },
      });

      const { syncOrgMembership } = await import('@/lib/supabase/org-sync');
      const result = await syncOrgMembership(client, TEST_USER_ID, TEST_PROVIDER_TOKEN);

      expect(upsertSpy).not.toHaveBeenCalled();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]?.org_id).toBe('org-1');
    });
  });
});
