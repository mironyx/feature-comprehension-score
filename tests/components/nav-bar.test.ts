// Tests for NavBar component — role-conditional link rendering.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

vi.mock('@/components/org-switcher', () => ({
  OrgSwitcher: () => null,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { NavBar } from '@/components/nav-bar';
import type { Database } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

type OrgRow = Database['public']['Tables']['organisations']['Row'];

function makeOrg(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 'org-001',
    github_org_name: 'acme',
    github_org_id: 1001,
    installation_id: 9001,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const currentOrg = makeOrg();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavBar', () => {
  describe('Given I am an org admin', () => {
    it('then I see Organisation in navigation', () => {
      const jsx = NavBar({ username: 'alice', isAdmin: true, currentOrg, allOrgs: [] });
      expect(JSON.stringify(jsx)).toContain('Organisation');
    });

    it('then I see Repositories in navigation', () => {
      const jsx = NavBar({ username: 'alice', isAdmin: true, currentOrg, allOrgs: [] });
      expect(JSON.stringify(jsx)).toContain('Repositories');
    });

    it('then I see My Assessments in navigation', () => {
      const jsx = NavBar({ username: 'alice', isAdmin: true, currentOrg, allOrgs: [] });
      expect(JSON.stringify(jsx)).toContain('My Assessments');
    });
  });

  describe('Given I am a regular user', () => {
    it('then I do not see admin-only links', () => {
      const jsx = NavBar({ username: 'bob', isAdmin: false, currentOrg, allOrgs: [] });
      const html = JSON.stringify(jsx);
      expect(html).not.toContain('Organisation');
      expect(html).not.toContain('Repositories');
    });

    it('then I see My Assessments in navigation', () => {
      const jsx = NavBar({ username: 'bob', isAdmin: false, currentOrg, allOrgs: [] });
      expect(JSON.stringify(jsx)).toContain('My Assessments');
    });

    it('then I see my username in navigation', () => {
      const jsx = NavBar({ username: 'bob', isAdmin: false, currentOrg, allOrgs: [] });
      expect(JSON.stringify(jsx)).toContain('bob');
    });
  });
});
