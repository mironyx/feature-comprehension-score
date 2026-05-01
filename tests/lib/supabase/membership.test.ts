// Tests for membership helpers.
// Issue: #121, #408

import { describe, it, expect, vi } from 'vitest';
import { isOrgAdmin, getOrgRole } from '@/lib/supabase/membership';
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
