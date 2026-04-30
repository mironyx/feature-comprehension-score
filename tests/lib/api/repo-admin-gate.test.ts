// Tests for the Repo-Admin gate helper.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.2
// Invariant I5: Project CRUD requires Org Admin OR Repo Admin (non-empty adminRepoGithubIds);
//               DELETE additionally requires Org Admin.

import { describe, expect, it, vi } from 'vitest';
import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import {
  readSnapshot,
  isOrgAdminOrRepoAdmin,
  assertOrgAdminOrRepoAdmin,
  assertOrgAdmin,
} from '@/lib/api/repo-admin-gate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-001';
const ORG_ID = 'org-uuid-001';
const REPO_ID_1 = 101;
const REPO_ID_2 = 202;

interface SupabaseMockRow {
  github_role: 'admin' | 'member';
  admin_repo_github_ids: number[];
}

/** Build a minimal ApiContext whose supabase.from returns the given row (or null). */
function makeCtx(row: SupabaseMockRow | null): ApiContext {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as ApiContext['supabase'],
    adminSupabase: {} as unknown as ApiContext['adminSupabase'],
    user: { id: USER_ID, email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
  };
}

/** Build a ctx that returns a Supabase DB error. */
function makeCtxWithError(message: string): ApiContext {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message } });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });

  return {
    supabase: { from } as unknown as ApiContext['supabase'],
    adminSupabase: {} as unknown as ApiContext['adminSupabase'],
    user: { id: USER_ID, email: 'alice@example.com', githubUserId: 42, githubUsername: 'alice' },
  };
}

// ---------------------------------------------------------------------------
// describe: readSnapshot
// ---------------------------------------------------------------------------

describe('readSnapshot', () => {
  describe('Given a user with a membership row for the org (role=admin)', () => {
    it('returns a RepoAdminSnapshot with githubRole and adminRepoGithubIds', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [REPO_ID_1] });
      const snapshot = await readSnapshot(ctx, ORG_ID);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.githubRole).toBe('admin');
      expect(snapshot?.adminRepoGithubIds).toEqual([REPO_ID_1]);
    });
  });

  describe('Given a user with a membership row for the org (role=member)', () => {
    it('returns a RepoAdminSnapshot with githubRole=member', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [REPO_ID_1, REPO_ID_2] });
      const snapshot = await readSnapshot(ctx, ORG_ID);
      expect(snapshot?.githubRole).toBe('member');
      expect(snapshot?.adminRepoGithubIds).toEqual([REPO_ID_1, REPO_ID_2]);
    });
  });

  describe('Given a user with no membership row for the org', () => {
    it('returns null when user has no membership row for the org', async () => {
      const ctx = makeCtx(null);
      const snapshot = await readSnapshot(ctx, ORG_ID);
      expect(snapshot).toBeNull();
    });
  });

  describe('Given a Supabase DB error during the lookup', () => {
    it('throws ApiError(500) when the DB query fails', async () => {
      const ctx = makeCtxWithError('connection timeout');
      await expect(readSnapshot(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('Given readSnapshot queries user_organisations', () => {
    it('reads from ctx.supabase (not adminSupabase)', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      await readSnapshot(ctx, ORG_ID);
      // supabase.from was called; adminSupabase.from was not
      expect((ctx.supabase as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('user_organisations');
    });
  });

  describe('Given the membership row has an empty admin_repo_github_ids', () => {
    it('returns empty array for adminRepoGithubIds (not undefined)', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      const snapshot = await readSnapshot(ctx, ORG_ID);
      expect(snapshot?.adminRepoGithubIds).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// describe: isOrgAdminOrRepoAdmin
// ---------------------------------------------------------------------------

describe('isOrgAdminOrRepoAdmin', () => {
  describe('Given github_role = admin (regardless of repo set)', () => {
    it('returns true for github_role=admin even with empty adminRepoGithubIds', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] });
      const result = await isOrgAdminOrRepoAdmin(ctx, ORG_ID);
      expect(result).toBe(true);
    });

    it('returns true for github_role=admin with non-empty adminRepoGithubIds', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [REPO_ID_1] });
      const result = await isOrgAdminOrRepoAdmin(ctx, ORG_ID);
      expect(result).toBe(true);
    });
  });

  describe('Given github_role = member with non-empty admin_repo_github_ids', () => {
    it('returns true for member with non-empty admin_repo_github_ids', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [REPO_ID_1] });
      const result = await isOrgAdminOrRepoAdmin(ctx, ORG_ID);
      expect(result).toBe(true);
    });
  });

  describe('Given github_role = member with empty admin_repo_github_ids', () => {
    it('returns false for member with empty admin_repo_github_ids', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      const result = await isOrgAdminOrRepoAdmin(ctx, ORG_ID);
      expect(result).toBe(false);
    });
  });

  describe('Given no membership row for the org', () => {
    it('returns false when user has no membership row', async () => {
      const ctx = makeCtx(null);
      const result = await isOrgAdminOrRepoAdmin(ctx, ORG_ID);
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// describe: assertOrgAdminOrRepoAdmin
// ---------------------------------------------------------------------------

describe('assertOrgAdminOrRepoAdmin', () => {
  describe('Given github_role = admin', () => {
    it('resolves without throwing for github_role=admin', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] });
      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).resolves.toBeUndefined();
    });
  });

  describe('Given github_role = member with non-empty admin_repo_github_ids', () => {
    it('resolves without throwing for member with non-empty adminRepoGithubIds', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [REPO_ID_1] });
      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).resolves.toBeUndefined();
    });
  });

  describe('Given github_role = member with empty admin_repo_github_ids', () => {
    it('throws ApiError(403) for member with empty adminRepoGithubIds', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws an ApiError instance (not a generic Error) for member with empty snapshot', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('Given no membership row for the org', () => {
    it('throws ApiError(401) when no membership row exists', async () => {
      const ctx = makeCtx(null);
      await expect(assertOrgAdminOrRepoAdmin(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// describe: assertOrgAdmin
// ---------------------------------------------------------------------------

describe('assertOrgAdmin', () => {
  describe('Given github_role = admin', () => {
    it('resolves without throwing for github_role=admin', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] });
      await expect(assertOrgAdmin(ctx, ORG_ID)).resolves.toBeUndefined();
    });
  });

  describe('Given github_role = member (even with non-empty admin_repo_github_ids)', () => {
    it('throws ApiError(403) for member even with non-empty admin_repo_github_ids', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [REPO_ID_1] });
      await expect(assertOrgAdmin(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws ApiError(403) for member with empty admin_repo_github_ids', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      await expect(assertOrgAdmin(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('Given no membership row for the org', () => {
    it('throws ApiError(401) when no membership row exists', async () => {
      const ctx = makeCtx(null);
      await expect(assertOrgAdmin(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});
