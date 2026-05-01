// Tests for membership helpers.
// Issue: #121, #408, #417

import { describe, it, expect, vi } from 'vitest';
import { isOrgAdmin, getOrgRole, readMembershipSnapshot } from '@/lib/supabase/membership';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

describe('isOrgAdmin', () => {
  describe('Given an empty membership list', () => {
    it('then returns false', () => {
      expect(isOrgAdmin([])).toBe(false);
    });
  });

  describe('Given a member (non-admin) row', () => {
    it('then returns false', () => {
      expect(isOrgAdmin([{ github_role: 'member' }])).toBe(false);
    });
  });

  describe('Given an admin row', () => {
    it('then returns true', () => {
      expect(isOrgAdmin([{ github_role: 'admin' }])).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabase(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient<Database>;
}

function makeSupabaseWithError(message: string) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message } });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient<Database>;
}

// ---------------------------------------------------------------------------
// getOrgRole
// ---------------------------------------------------------------------------

describe('getOrgRole', () => {
  describe('Given no membership row exists', () => {
    it('returns null', async () => {
      const supabase = makeSupabase(null);
      expect(await getOrgRole(supabase, 'u1', 'o1')).toBeNull();
    });
  });

  describe('Given github_role is "admin"', () => {
    it('returns "admin"', async () => {
      const supabase = makeSupabase({ github_role: 'admin', admin_repo_github_ids: [] });
      expect(await getOrgRole(supabase, 'u1', 'o1')).toBe('admin');
    });
  });

  describe('Given github_role is not "admin" but admin_repo_github_ids is non-empty', () => {
    it('returns "repo_admin"', async () => {
      const supabase = makeSupabase({ github_role: 'member', admin_repo_github_ids: [42] });
      expect(await getOrgRole(supabase, 'u1', 'o1')).toBe('repo_admin');
    });
  });

  describe('Given github_role is not "admin" and admin_repo_github_ids is empty', () => {
    it('returns null', async () => {
      const supabase = makeSupabase({ github_role: 'member', admin_repo_github_ids: [] });
      expect(await getOrgRole(supabase, 'u1', 'o1')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// readMembershipSnapshot — shared core (#417)
// ---------------------------------------------------------------------------

describe('readMembershipSnapshot', () => {
  describe('Given no membership row exists', () => {
    it('returns null', async () => {
      const supabase = makeSupabase(null);
      expect(await readMembershipSnapshot(supabase, 'u1', 'o1')).toBeNull();
    });
  });

  describe('Given a membership row with github_role and admin_repo_github_ids', () => {
    it('returns normalised snapshot with camelCase fields', async () => {
      const supabase = makeSupabase({ github_role: 'admin', admin_repo_github_ids: [101, 202] });
      const snap = await readMembershipSnapshot(supabase, 'u1', 'o1');
      expect(snap).toEqual({ githubRole: 'admin', adminRepoGithubIds: [101, 202] });
    });

    it('defaults adminRepoGithubIds to [] when the column is null', async () => {
      const supabase = makeSupabase({ github_role: 'member', admin_repo_github_ids: null });
      const snap = await readMembershipSnapshot(supabase, 'u1', 'o1');
      expect(snap?.adminRepoGithubIds).toEqual([]);
    });
  });

  describe('Given a DB error from Supabase', () => {
    it('throws an Error with the DB message', async () => {
      const supabase = makeSupabaseWithError('connection timeout');
      await expect(readMembershipSnapshot(supabase, 'u1', 'o1')).rejects.toThrow('connection timeout');
    });
  });
});
