// Tests for isOrgAdmin helper.
// Issue: #121

import { describe, it, expect } from 'vitest';
import { isOrgAdmin } from '@/lib/supabase/membership';

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
