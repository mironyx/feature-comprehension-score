// Tests for NavBar component — role-conditional link rendering and layout shell classes.
// Design reference: docs/design/frontend-system.md § Layout Shell
// Issue: #62, #165

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
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

function renderNavBar(overrides: Partial<Parameters<typeof NavBar>[0]> = {}) {
  return NavBar({
    username: 'alice',
    isAdmin: false,
    currentOrg,
    allOrgs: [],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavBar', () => {
  describe('Given I am an org admin', () => {
    it('then I see Organisation in navigation', () => {
      const html = JSON.stringify(renderNavBar({ isAdmin: true }));
      expect(html).toContain('Organisation');
    });

    it('then I do not see a Repositories link (deferred post-MVP)', () => {
      const html = JSON.stringify(renderNavBar({ isAdmin: true }));
      expect(html).not.toContain('Repositories');
    });

    it('then I see My Assessments in navigation', () => {
      const html = JSON.stringify(renderNavBar({ isAdmin: true }));
      expect(html).toContain('My Assessments');
    });

    it('then sign out renders as a POST form, not an anchor', () => {
      const html = JSON.stringify(renderNavBar({ isAdmin: true }));
      expect(html).toContain('form');
      expect(html).toContain('/auth/sign-out');
      expect(html).not.toContain('"a"');
    });
  });

  describe('Given any user', () => {
    it('then a sign-out form POSTing to /auth/sign-out is present', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('/auth/sign-out');
      expect(html).toContain('POST');
    });
  });

  describe('Given I am a regular user', () => {
    it('then I do not see admin-only links', () => {
      const html = JSON.stringify(renderNavBar({ username: 'bob' }));
      expect(html).not.toContain('Organisation');
      expect(html).not.toContain('Repositories');
    });

    it('then I see My Assessments in navigation', () => {
      const html = JSON.stringify(renderNavBar({ username: 'bob' }));
      expect(html).toContain('My Assessments');
    });

    it('then I see my username in navigation', () => {
      const html = JSON.stringify(renderNavBar({ username: 'bob' }));
      expect(html).toContain('bob');
    });
  });

  describe('Layout shell classes', () => {
    it('then the nav element is sticky with correct height and border', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('sticky');
      expect(html).toContain('top-0');
      expect(html).toContain('z-50');
      expect(html).toContain('h-[52px]');
      expect(html).toContain('border-b');
      expect(html).toContain('border-border');
      expect(html).toContain('bg-background');
    });

    it('then the nav has correct horizontal padding for desktop and mobile', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('px-content-pad-sm');
      expect(html).toContain('md:px-content-pad');
    });

    it('then the logo uses display font and accent colour', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('font-display');
      expect(html).toContain('text-accent');
    });

    it('then nav links use label size and secondary colour', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('text-label');
      expect(html).toContain('text-text-secondary');
    });
  });
});
