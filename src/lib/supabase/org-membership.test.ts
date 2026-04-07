// Unit tests for resolveUserOrgsViaApp.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §7

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { resolveUserOrgsViaApp, type ResolveUserOrgsInput } from './org-membership';

type OrgRow = Database['public']['Tables']['organisations']['Row'];
type UserOrgRow = Database['public']['Tables']['user_organisations']['Row'];

const INPUT: ResolveUserOrgsInput = {
  userId: 'user-1',
  githubUserId: 42,
  githubLogin: 'alice',
};

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 'org-1',
    github_org_id: 1001,
    github_org_name: 'acme',
    installation_id: 9001,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeUserOrg(overrides: Partial<UserOrgRow> = {}): UserOrgRow {
  return {
    id: 'uo-1',
    user_id: INPUT.userId,
    org_id: 'org-1',
    github_user_id: INPUT.githubUserId,
    github_username: INPUT.githubLogin,
    github_role: 'member',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

interface MockClientOptions {
  installedOrgs: OrgRow[];
  finalUserOrgs: UserOrgRow[];
  orgQueryError?: { message: string };
  upsertError?: { message: string };
}

function buildMockClient(opts: MockClientOptions) {
  const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: opts.upsertError ?? null });

  const notSpy = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqDelete = Object.assign(Promise.resolve({ data: null, error: null }), { not: notSpy });
  const deleteChain = { eq: vi.fn().mockReturnValue(eqDelete) };
  const deleteSpy = vi.fn().mockReturnValue(deleteChain);

  const selectFinal = {
    eq: vi.fn().mockResolvedValue({ data: opts.finalUserOrgs, error: null }),
  };

  const orgsSelectChain = {
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
        select: vi.fn().mockReturnValue(selectFinal),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  const client = { from: fromSpy } as unknown as SupabaseClient<Database>;
  return { client, upsertSpy, deleteSpy, notSpy };
}

function membershipResponse(role: 'admin' | 'member'): Response {
  return new Response(JSON.stringify({ role }), { status: 200 });
}

describe('resolveUserOrgsViaApp', () => {
  it('returns matching orgs when the user is a member of one installed org', async () => {
    const org = makeOrg();
    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [org],
      finalUserOrgs: [makeUserOrg({ github_role: 'admin' })],
    });
    const fetchImpl = vi.fn(async () => membershipResponse('admin'));
    const getInstallationToken = vi.fn(async () => 'ghs_test');

    const result = await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken,
    });

    expect(result).toHaveLength(1);
    expect(getInstallationToken).toHaveBeenCalledWith(9001);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/orgs/acme/memberships/alice',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghs_test' }),
      }),
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ org_id: 'org-1', github_role: 'admin' }),
      ]),
      expect.objectContaining({ onConflict: 'user_id,org_id' }),
    );
  });

  it('returns an empty array when the user is not a member of any installed org', async () => {
    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [makeOrg()],
      finalUserOrgs: [],
    });
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));

    const result = await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken: async () => 'ghs_test',
    });

    expect(result).toHaveLength(0);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('assigns installer as admin of a personal-account install without calling the API', async () => {
    const personalOrg = makeOrg({
      id: 'org-personal',
      github_org_id: INPUT.githubUserId,
      github_org_name: INPUT.githubLogin,
    });
    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [personalOrg],
      finalUserOrgs: [makeUserOrg({ org_id: 'org-personal', github_role: 'admin' })],
    });
    const fetchImpl = vi.fn();
    const getInstallationToken = vi.fn();

    const result = await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getInstallationToken).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ org_id: 'org-personal', github_role: 'admin' }),
      ]),
      expect.anything(),
    );
  });

  it('handles multi-org installs — returns only the orgs the user is a member of', async () => {
    const acme = makeOrg({ id: 'org-1', github_org_id: 1001, github_org_name: 'acme' });
    const beta = makeOrg({ id: 'org-2', github_org_id: 1002, github_org_name: 'beta', installation_id: 9002 });
    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [acme, beta],
      finalUserOrgs: [makeUserOrg({ org_id: 'org-1', github_role: 'admin' })],
    });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/orgs/acme/')) return membershipResponse('admin');
      return new Response('', { status: 404 });
    });

    const result = await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken: async () => 'ghs_test',
    });

    expect(result).toHaveLength(1);
    const upsertRows = upsertSpy.mock.calls[0]?.[0] as Array<{ org_id: string }>;
    expect(upsertRows).toHaveLength(1);
    expect(upsertRows[0]?.org_id).toBe('org-1');
  });

  it.each([
    { status: 500, label: '500 (transient)' },
    { status: 403, label: '403 (missing members:read or not re-consented)' },
  ])('throws on $label, distinct from 404 silent non-member', async ({ status }) => {
    const { client } = buildMockClient({ installedOrgs: [makeOrg()], finalUserOrgs: [] });
    const fetchImpl = vi.fn(async () => new Response('error', { status }));

    await expect(
      resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      }),
    ).rejects.toThrow(new RegExp(String(status)));
  });

  it('upserts new memberships and deletes stale rows for the user', async () => {
    const org = makeOrg();
    const { client, upsertSpy, deleteSpy, notSpy } = buildMockClient({
      installedOrgs: [org],
      finalUserOrgs: [makeUserOrg({ github_role: 'member' })],
    });
    const fetchImpl = vi.fn(async () => membershipResponse('member'));

    await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken: async () => 'ghs_test',
    });

    expect(upsertSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalled();
    // Delete must be scoped to this user.
    const chain = deleteSpy.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(chain.eq).toHaveBeenCalledWith('user_id', INPUT.userId);
    // And must exclude the retained org via .not('org_id', 'in', ...).
    expect(notSpy).toHaveBeenCalledWith('org_id', 'in', '(org-1)');
  });

  it('leaves memberships for other users untouched', async () => {
    const { client, deleteSpy } = buildMockClient({
      installedOrgs: [makeOrg()],
      finalUserOrgs: [makeUserOrg()],
    });
    const fetchImpl = vi.fn(async () => membershipResponse('member'));

    await resolveUserOrgsViaApp(client, INPUT, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getInstallationToken: async () => 'ghs_test',
    });

    // Every delete call must be scoped to INPUT.userId — this test proves the
    // service never issues an unfiltered delete that could affect other users.
    for (const call of deleteSpy.mock.results) {
      const chain = call.value as { eq: ReturnType<typeof vi.fn> };
      for (const eqCall of chain.eq.mock.calls) {
        expect(eqCall[0]).toBe('user_id');
        expect(eqCall[1]).toBe(INPUT.userId);
      }
    }
  });
});
