// Adversarial evaluation tests — issue #395: sign-in admin-repo snapshot + Repo-Admin gate.
// Covers two genuine gaps identified in the test-author's suite:
//
// Gap 1: personal-account install path writes admin_repo_github_ids explicitly (not relying on DB default).
// Gap 2: gate helper functions issue zero GitHub (fetch) calls — required explicit assertion per LLD §B.2.
//
// Fixtures: reuse org-membership-mocks.ts and the gate makeCtx pattern from the sibling test files.

import { describe, expect, it, vi } from 'vitest';
import type { ApiContext } from '@/lib/api/context';
import {
  assertOrgAdmin,
  assertOrgAdminOrRepoAdmin,
  isOrgAdminOrRepoAdmin,
  readSnapshot,
} from '@/lib/api/repo-admin-gate';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import {
  INPUT,
  buildMockClient,
  makeOrg,
  makeUserOrg,
} from '../fixtures/org-membership-mocks';

// ---------------------------------------------------------------------------
// Gate helper fixture (mirrors the pattern in repo-admin-gate.test.ts without
// duplicating — the makeCtx helper is module-scoped there, so we inline a
// minimal version here rather than re-export it).
// ---------------------------------------------------------------------------

function makeGateCtx(row: { github_role: 'admin' | 'member'; admin_repo_github_ids: number[] } | null): ApiContext {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as ApiContext['supabase'],
    adminSupabase: {} as unknown as ApiContext['adminSupabase'],
    user: { id: 'user-1', email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
  };
}

const ORG_ID = 'org-uuid-001';

// ---------------------------------------------------------------------------
// Gap 1: personal-account install — admin_repo_github_ids explicitly written
//
// Spec: LLD §B.2 — "the field still records the actual admin-repo IDs —
// populated for both roles so the gate can answer uniformly."
// For personal accounts the implementation returns adminRepoGithubIds: [] (line 44
// of org-membership.ts). The upsert row must carry the field explicitly so the
// DB column is set to {} rather than relying on the column default.
// ---------------------------------------------------------------------------

describe('Gap 1 — personal-account install snapshot', () => {
  describe('Given a personal-account install (github_org_id === githubUserId)', () => {
    it('upsert row includes admin_repo_github_ids: [] explicitly (not omitted from payload)', async () => {
      const personalOrg = makeOrg({
        id: 'org-personal',
        github_org_id: INPUT.githubUserId, // matches the signed-in user → personal account
        github_org_name: INPUT.githubLogin,
      });
      const { client, upsertSpy } = buildMockClient({
        installedOrgs: [personalOrg],
        finalUserOrgs: [makeUserOrg({ org_id: 'org-personal', github_role: 'admin', admin_repo_github_ids: [] })],
      });
      const fetchImpl = vi.fn(); // must not be called
      const getInstallationToken = vi.fn(); // must not be called

      await resolveUserOrgsViaApp(client, INPUT, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getInstallationToken,
      });

      // The upsert payload must include the snapshot column explicitly.
      const [rows] = upsertSpy.mock.calls[0] as [Array<Record<string, unknown>>];
      expect(rows[0]).toHaveProperty('admin_repo_github_ids');
      expect(rows[0]?.['admin_repo_github_ids']).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2: gate helpers make zero GitHub (fetch) calls
//
// Spec: LLD §B.2 — "Gate helpers make zero GitHub API calls."
// The spec says this should be verified explicitly. The test-author verified that
// readSnapshot reads from ctx.supabase (not adminSupabase), but did not assert
// that no HTTP fetch is made. We use a fetch spy to confirm no outbound call.
// ---------------------------------------------------------------------------

describe('Gap 2 — gate helpers make zero GitHub API calls', () => {
  describe('Given readSnapshot is called', () => {
    it('does not call global fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ctx = makeGateCtx({ github_role: 'member', admin_repo_github_ids: [] });

      await readSnapshot(ctx, ORG_ID);

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('Given assertOrgAdminOrRepoAdmin is called', () => {
    it('does not call global fetch even when throwing 403', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ctx = makeGateCtx({ github_role: 'member', admin_repo_github_ids: [] });

      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).rejects.toMatchObject({ statusCode: 403 });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('Given assertOrgAdmin is called', () => {
    it('does not call global fetch even when throwing 403', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ctx = makeGateCtx({ github_role: 'member', admin_repo_github_ids: [101] });

      await expect(assertOrgAdmin(ctx, ORG_ID)).rejects.toMatchObject({ statusCode: 403 });
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('Given isOrgAdminOrRepoAdmin is called', () => {
    it('does not call global fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const ctx = makeGateCtx({ github_role: 'admin', admin_repo_github_ids: [] });

      await isOrgAdminOrRepoAdmin(ctx, ORG_ID);

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
