// Tests for listProjects service function.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3
// Requirements: docs/requirements/v11-requirements.md §Story 1.2
// Issue #396: feat: POST + GET /api/projects (V11 E11.1 T1.3)

import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';
import { listProjects } from '@/app/api/projects/service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-001';
const USER_ID = 'user-uuid-001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: USER_ID,
  email: 'alice@example.com',
  githubUserId: 42,
  githubUsername: 'alice',
};

const PROJECT_ROWS = [
  {
    id: 'project-uuid-001',
    org_id: ORG_ID,
    name: 'Payment Service',
    description: 'Handles payments',
    created_at: '2026-04-30T10:00:00Z',
    updated_at: '2026-04-30T10:00:00Z',
  },
  {
    id: 'project-uuid-002',
    org_id: ORG_ID,
    name: 'Auth Service',
    description: null,
    created_at: '2026-04-29T09:00:00Z',
    updated_at: '2026-04-29T09:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Builds a ctx.supabase stub where:
 *   - user_organisations query returns the given membershipRow
 *   - projects query returns the given projectRows
 */
function makeUserSupabase(
  membershipRow: { github_role: string; admin_repo_github_ids: number[] } | null,
  projectRows: unknown[],
): ApiContext['supabase'] {
  // Membership query chain: .from('user_organisations').select().eq().eq().maybeSingle()
  const membershipMaybeSingle = vi.fn().mockResolvedValue({ data: membershipRow, error: null });
  const membershipEqUser = vi.fn().mockReturnValue({ maybeSingle: membershipMaybeSingle });
  const membershipEqOrg = vi.fn().mockReturnValue({ eq: membershipEqUser });
  const membershipSelect = vi.fn().mockReturnValue({ eq: membershipEqOrg });

  // Projects query chain: .from('projects').select().eq().order()
  const projectsOrder = vi.fn().mockResolvedValue({ data: projectRows, error: null });
  const projectsEq = vi.fn().mockReturnValue({ order: projectsOrder });
  const projectsSelect = vi.fn().mockReturnValue({ eq: projectsEq });

  const from = vi.fn((table: string) => {
    if (table === 'user_organisations') return { select: membershipSelect };
    if (table === 'projects') return { select: projectsSelect };
    // Fallback for any unexpected table
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) };
  });

  return { from } as unknown as ApiContext['supabase'];
}

/** Builds a full ApiContext. adminSupabase is unused for listProjects but must be present. */
function makeCtx(
  membershipRow: { github_role: string; admin_repo_github_ids: number[] } | null,
  projectRows: unknown[] = [],
): ApiContext {
  return {
    supabase: makeUserSupabase(membershipRow, projectRows),
    adminSupabase: { from: vi.fn() } as unknown as ApiContext['adminSupabase'],
    user: AUTH_USER,
  };
}

// ---------------------------------------------------------------------------
// Import under test (deferred so vitest vi.mock hoisting works correctly)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// describe: listProjects — authorisation / membership check
// ---------------------------------------------------------------------------

describe('listProjects — membership check', () => {
  describe('Given a caller with no membership row for the org', () => {
    it('throws ApiError(403) when no membership row exists [req §Story 1.2 AC 3, lld §B.3]', async () => {
      // When listProjects is called with a ctx that has no membership
      const ctx = makeCtx(null);
      // Then it throws 403
      await expect(listProjects(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws an ApiError instance (not a generic Error) when no membership exists [lld §B.3]', async () => {
      const ctx = makeCtx(null);
      await expect(listProjects(ctx, ORG_ID)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('Given an Org Admin (github_role=admin)', () => {
    it('resolves without throwing — Org Admin may list projects [req §Story 1.2 AC 1]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      await expect(listProjects(ctx, ORG_ID)).resolves.toBeDefined();
    });
  });

  describe('Given an Org Member (github_role=member, empty adminRepoGithubIds)', () => {
    it('throws ApiError(403) because Org Members cannot list projects [req §Story 1.2 AC 3, lld I5]', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [] });
      await expect(listProjects(ctx, ORG_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('Given a Repo Admin (github_role=member with non-empty adminRepoGithubIds)', () => {
    it('resolves without throwing — Repo Admin may list projects [req §Story 1.2 AC 2]', async () => {
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [101] }, PROJECT_ROWS);
      await expect(listProjects(ctx, ORG_ID)).resolves.toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// describe: listProjects — returned data shape
// ---------------------------------------------------------------------------

describe('listProjects — returned data shape', () => {
  describe('Given an org with multiple projects', () => {
    it('returns an array of ProjectResponse objects with id, org_id, name, description, created_at, updated_at [req §Story 1.2 AC 1]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      const result = await listProjects(ctx, ORG_ID) as Array<Record<string, unknown>>;
      expect(result).toHaveLength(2);
      // First item has all required ProjectResponse fields
      expect(result[0]).toMatchObject({
        id: 'project-uuid-001',
        org_id: ORG_ID,
        name: 'Payment Service',
        description: 'Handles payments',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('includes projects with null description (description is optional) [src/types/projects.ts]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      const result = await listProjects(ctx, ORG_ID) as Array<Record<string, unknown>>;
      const withNullDesc = result.find(p => p['name'] === 'Auth Service');
      expect(withNullDesc?.['description']).toBeNull();
    });

    it('returns all projects in the org regardless of repo-admin scope [req §Story 1.2 AC 2]', async () => {
      // Repo Admin sees all org projects, not just repos they admin
      const ctx = makeCtx({ github_role: 'member', admin_repo_github_ids: [101] }, PROJECT_ROWS);
      const result = await listProjects(ctx, ORG_ID) as unknown[];
      expect(result).toHaveLength(2);
    });
  });

  describe('Given an org with no projects', () => {
    it('returns an empty array [req §Story 1.2 AC 4, lld §B.3]', async () => {
      // When the org has no project rows
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, []);
      // Then the result is an empty array (not null, not undefined)
      const result = await listProjects(ctx, ORG_ID);
      expect(result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// describe: listProjects — client usage (RLS enforcement)
// ---------------------------------------------------------------------------

describe('listProjects — Supabase client selection', () => {
  describe('Given a listProjects call', () => {
    it('queries projects via ctx.supabase (user-scoped, RLS-enforced), not adminSupabase [lld §B.3, req Cross-Cutting Security]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      await listProjects(ctx, ORG_ID);
      // ctx.supabase.from must have been called with 'projects'
      expect((ctx.supabase as unknown as { from: ReturnType<typeof vi.fn> }).from)
        .toHaveBeenCalledWith('projects');
    });

    it('does NOT use adminSupabase to query projects (no RLS bypass on reads) [lld §B.3]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      await listProjects(ctx, ORG_ID);
      // adminSupabase.from must NOT have been called
      expect((ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from)
        .not.toHaveBeenCalled();
    });

    it('queries membership via ctx.supabase (not adminSupabase) [lld §B.3]', async () => {
      const ctx = makeCtx({ github_role: 'admin', admin_repo_github_ids: [] }, PROJECT_ROWS);
      await listProjects(ctx, ORG_ID);
      expect((ctx.supabase as unknown as { from: ReturnType<typeof vi.fn> }).from)
        .toHaveBeenCalledWith('user_organisations');
    });
  });
});
