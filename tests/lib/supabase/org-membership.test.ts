// Unit tests for resolveUserOrgsViaApp.
// Design reference: docs/design/lld-onboarding-auth-resolver.md §7

import { describe, it, expect, vi } from 'vitest';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import {
  INPUT,
  buildMockClient,
  makeOrg,
  makeUserOrg,
  membershipResponse,
} from '../../fixtures/org-membership-mocks';

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

    for (const call of deleteSpy.mock.results) {
      const chain = call.value as { eq: ReturnType<typeof vi.fn> };
      for (const eqCall of chain.eq.mock.calls) {
        expect(eqCall[0]).toBe('user_id');
        expect(eqCall[1]).toBe(INPUT.userId);
      }
    }
  });
});

describe('first-install race', () => {
  it('treats the installer as admin when signing in within 5 minutes of installation.created', async () => {
    const installerOrg = makeOrg({
      id: 'org-new',
      installer_github_user_id: INPUT.githubUserId,
    });
    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [],
      finalUserOrgs: [makeUserOrg({ org_id: 'org-new', github_role: 'admin' })],
      installerOrgs: [installerOrg],
      userOrgCount: 0,
    });
    const fetchImpl = vi.fn();

    const result = await resolveUserOrgsViaApp(
      client,
      INPUT,
      { fetchImpl: fetchImpl as unknown as typeof fetch, getInstallationToken: async () => 'ghs_test' },
      { firstInstallFallback: true },
    );

    expect(result).toHaveLength(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ org_id: 'org-new', github_role: 'admin' }),
      ]),
      expect.anything(),
    );
  });

  it('does not treat an arbitrary user as admin in the same window', async () => {
    const { client } = buildMockClient({
      installedOrgs: [],
      finalUserOrgs: [],
      installerOrgs: [],
      userOrgCount: 0,
    });
    const fetchImpl = vi.fn();

    const result = await resolveUserOrgsViaApp(
      client,
      INPUT,
      { fetchImpl: fetchImpl as unknown as typeof fetch, getInstallationToken: async () => 'ghs_test' },
      { firstInstallFallback: true },
    );

    expect(result).toHaveLength(0);
  });
});
