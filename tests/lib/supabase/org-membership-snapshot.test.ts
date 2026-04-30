// Tests for the admin-repo snapshot extension of resolveUserOrgsViaApp.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2
// Invariant I6: admin-repo snapshot is refreshed atomically with the membership upsert.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import {
  INPUT,
  buildMockClient,
  makeOrg,
  makeUserOrg,
  membershipResponse,
} from '../../fixtures/org-membership-mocks';
import { server } from '../../mocks/server';

// ---------------------------------------------------------------------------
// MSW lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = makeOrg({ id: 'org-1', github_org_name: 'acme', installation_id: 9001 });
const REPO_ID_ALPHA = 1111;
const REPO_ID_BETA = 2222;
const REPO_ID_GAMMA = 3333;

/** Mock fetchImpl that handles GitHub membership and per-repo permission endpoints. */
function makeAdminFetchImpl(opts: {
  membershipRole: 'admin' | 'member';
  repos: Array<{ id: number; name: string; owner: string }>;
  adminRepoIds: number[];
}) {
  return vi.fn(async (url: string) => {
    // Membership check
    if (url.includes('/orgs/') && url.includes('/memberships/')) {
      return membershipResponse(opts.membershipRole);
    }
    // Per-repo collaborator permission check
    for (const repo of opts.repos) {
      if (url.includes(`/repos/${repo.owner}/${repo.name}/collaborators/`)) {
        const permission = opts.adminRepoIds.includes(repo.id) ? 'admin' : 'write';
        return new Response(JSON.stringify({ permission }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response('Not Found', { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// describe: resolveUserOrgsViaApp — admin-repo snapshot
// ---------------------------------------------------------------------------

describe('resolveUserOrgsViaApp — admin-repo snapshot', () => {
  // -------------------------------------------------------------------------
  // Property 1: admin_repo_github_ids is populated alongside github_role in each
  // matched org row. [lld §B.2]
  // -------------------------------------------------------------------------
  describe('Given a member user with two admin repos in the org', () => {
    it('populates admin_repo_github_ids alongside github_role for each matched org', async () => {
      const repos = [
        { id: REPO_ID_ALPHA, name: 'alpha', owner: 'acme' },
        { id: REPO_ID_BETA, name: 'beta', owner: 'acme' },
      ];
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [REPO_ID_ALPHA, REPO_ID_BETA] })],
        registeredRepos: repos.map((r) => ({ org_id: 'org-1', github_repo_id: r.id, github_repo_name: `${r.owner}/${r.name}` })),
      });
      const fetchImpl = makeAdminFetchImpl({
        membershipRole: 'member',
        repos,
        adminRepoIds: [REPO_ID_ALPHA, REPO_ID_BETA],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            org_id: 'org-1',
            github_role: 'member',
            admin_repo_github_ids: expect.arrayContaining([REPO_ID_ALPHA, REPO_ID_BETA]),
          }),
        ]),
        expect.objectContaining({ onConflict: 'user_id,org_id' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: admin_repo_github_ids is written in the SAME upsert call as
  // github_role — no separate write. [lld §B.2, invariant I6]
  // -------------------------------------------------------------------------
  describe('Given a member user with admin repos in the org', () => {
    it('writes admin_repo_github_ids in the same upsert as github_role (no separate write)', async () => {
      const repos = [{ id: REPO_ID_ALPHA, name: 'alpha', owner: 'acme' }];
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [REPO_ID_ALPHA] })],
        registeredRepos: repos.map((r) => ({ org_id: 'org-1', github_repo_id: r.id, github_repo_name: `${r.owner}/${r.name}` })),
      });
      const fetchImpl = makeAdminFetchImpl({
        membershipRole: 'member',
        repos,
        adminRepoIds: [REPO_ID_ALPHA],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      // Exactly one upsert call — the snapshot column is NOT written in a separate round-trip.
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      // That single call carries both github_role and admin_repo_github_ids.
      const [rows] = upsertSpy.mock.calls[0] as [Array<Record<string, unknown>>];
      expect(rows[0]).toHaveProperty('github_role');
      expect(rows[0]).toHaveProperty('admin_repo_github_ids');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: When user is a member with no admin repos, an empty array is
  // stored (not undefined, not null). [lld §B.2, BDD spec]
  // -------------------------------------------------------------------------
  describe('Given a member user who holds no admin repos in the org', () => {
    it('records empty array when user is org member with no admin repos', async () => {
      const repos = [{ id: REPO_ID_GAMMA, name: 'gamma', owner: 'acme' }];
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [] })],
        registeredRepos: repos.map((r) => ({ org_id: 'org-1', github_repo_id: r.id, github_repo_name: `${r.owner}/${r.name}` })),
      });
      const fetchImpl = makeAdminFetchImpl({
        membershipRole: 'member',
        repos,
        adminRepoIds: [], // no admin repos
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            org_id: 'org-1',
            github_role: 'member',
            admin_repo_github_ids: [],
          }),
        ]),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Even when github_role = 'admin', admin_repo_github_ids is still
  // populated (so the gate can answer uniformly). [lld §B.2]
  // -------------------------------------------------------------------------
  describe('Given an org-admin user with admin repos in the org', () => {
    it('populates admin_repo_github_ids even when github_role is admin', async () => {
      const repos = [
        { id: REPO_ID_ALPHA, name: 'alpha', owner: 'acme' },
        { id: REPO_ID_BETA, name: 'beta', owner: 'acme' },
      ];
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'admin', admin_repo_github_ids: [REPO_ID_ALPHA, REPO_ID_BETA] })],
        registeredRepos: repos.map((r) => ({ org_id: 'org-1', github_repo_id: r.id, github_repo_name: `${r.owner}/${r.name}` })),
      });
      const fetchImpl = makeAdminFetchImpl({
        membershipRole: 'admin',
        repos,
        adminRepoIds: [REPO_ID_ALPHA, REPO_ID_BETA],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            github_role: 'admin',
            admin_repo_github_ids: expect.arrayContaining([REPO_ID_ALPHA, REPO_ID_BETA]),
          }),
        ]),
        expect.anything(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Atomicity — exactly one upsert call is made per matched user,
  // carrying all snapshot fields together. [lld invariant I6]
  // -------------------------------------------------------------------------
  describe('Given a user matched in a single org', () => {
    it('issues exactly one upsert call (no split writes between github_role and snapshot)', async () => {
      const repos = [{ id: REPO_ID_ALPHA, name: 'alpha', owner: 'acme' }];
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [REPO_ID_ALPHA] })],
        registeredRepos: repos.map((r) => ({ org_id: 'org-1', github_repo_id: r.id, github_repo_name: `${r.owner}/${r.name}` })),
      });
      const fetchImpl = makeAdminFetchImpl({
        membershipRole: 'member',
        repos,
        adminRepoIds: [REPO_ID_ALPHA],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      expect(upsertSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: admin_repo_github_ids contains only IDs from repos registered
  // under the matched org — not repos from other orgs in the DB. [lld §B.2]
  // The DB query is scoped to org_id so cross-org repos are never permission-checked.
  // -------------------------------------------------------------------------
  describe('Given repos registered for two different orgs in the DB', () => {
    it('only includes repo IDs belonging to the matched org in admin_repo_github_ids', async () => {
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [REPO_ID_ALPHA] })],
        registeredRepos: [
          { org_id: 'org-1', github_repo_id: REPO_ID_ALPHA, github_repo_name: 'acme/alpha' },
          { org_id: 'org-other', github_repo_id: REPO_ID_BETA, github_repo_name: 'other/beta' },
        ],
      });

      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes('/orgs/acme/memberships/')) return membershipResponse('member');
        if (url.includes('/repos/acme/alpha/collaborators/')) {
          return new Response(JSON.stringify({ permission: 'admin' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // other-org repo must never be permission-checked
        return new Response('Not Found', { status: 404 });
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken: async () => 'ghs_test',
      });

      const [rows] = upsertSpy.mock.calls[0] as [Array<Record<string, unknown>>];
      const ids = rows[0]?.['admin_repo_github_ids'] as number[];
      expect(ids).toContain(REPO_ID_ALPHA);
      expect(ids).not.toContain(REPO_ID_BETA);
    });
  });

  // -------------------------------------------------------------------------
  // MSW-based alternative: verify listAdminReposForUser is called using MSW
  // for the GitHub mock rather than vi.fn, following the artefact-source pattern.
  // -------------------------------------------------------------------------
  describe('Given MSW-mocked GitHub API (member role, one admin repo)', () => {
    it('populates admin_repo_github_ids from permission endpoint response', async () => {
      server.use(
        http.get('https://api.github.com/orgs/acme/memberships/alice', () =>
          HttpResponse.json({ role: 'member' }),
        ),
        http.get(
          'https://api.github.com/repos/acme/alpha/collaborators/alice/permission',
          () => HttpResponse.json({ permission: 'admin' }),
        ),
      );

      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [REPO_ID_ALPHA] })],
        registeredRepos: [{ org_id: 'org-1', github_repo_id: REPO_ID_ALPHA, github_repo_name: 'acme/alpha' }],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        getInstallationToken: async () => 'ghs_msw_test',
      });

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            org_id: 'org-1',
            github_role: 'member',
            admin_repo_github_ids: [REPO_ID_ALPHA],
          }),
        ]),
        expect.anything(),
      );
    });

    it('stores empty array when permission endpoint returns non-admin for all repos', async () => {
      server.use(
        http.get('https://api.github.com/orgs/acme/memberships/alice', () =>
          HttpResponse.json({ role: 'member' }),
        ),
        http.get(
          'https://api.github.com/repos/acme/gamma/collaborators/alice/permission',
          () => HttpResponse.json({ permission: 'write' }),
        ),
      );

      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [ORG],
        finalUserOrgs: [makeUserOrg({ github_role: 'member', admin_repo_github_ids: [] })],
        registeredRepos: [{ org_id: 'org-1', github_repo_id: REPO_ID_GAMMA, github_repo_name: 'acme/gamma' }],
      });

      await resolveUserOrgsViaApp(client, INPUT, {
        getInstallationToken: async () => 'ghs_msw_test',
      });

      const [rows] = upsertSpy.mock.calls[0] as [Array<Record<string, unknown>>];
      expect(rows[0]?.['admin_repo_github_ids']).toEqual([]);
    });
  });
});
