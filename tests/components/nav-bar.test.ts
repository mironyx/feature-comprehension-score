// Tests for NavBar component — role-conditional link rendering and layout shell classes.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1
// Issue: #62, #165, #432

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

vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

// NavLinks renders the role-conditional link list — surface hrefs/labels so
// they appear in the JSON tree without invoking the real client component
// (which calls usePathname).
vi.mock('@/components/nav-links', () => ({
  NavLinks: ({ links }: { links: ReadonlyArray<{ href: string; label: string }> }) => ({
    type: 'ul',
    props: {
      'data-testid': 'nav-links',
      children: links.map((link) => ({
        type: 'a',
        props: { href: link.href, children: link.label },
      })),
    },
  }),
}));

// MobileNavMenu — rendered only on mobile viewports; the desktop tests still
// walk over it. Stub returns the nav links so role-conditional assertions hold
// regardless of which branch surfaces them.
vi.mock('@/components/mobile-nav-menu', () => ({
  MobileNavMenu: ({ links }: { links: ReadonlyArray<{ href: string; label: string }> }) => ({
    type: 'div',
    props: {
      'data-testid': 'mobile-nav-menu',
      children: links.map((link) => ({
        type: 'a',
        props: { href: link.href, children: link.label },
      })),
    },
  }),
}));

vi.mock('@/components/sign-out-button', () => ({
  SignOutButton: () => ({
    type: 'form',
    props: {
      method: 'POST',
      action: '/auth/sign-out',
      'data-testid': 'sign-out-button',
    },
  }),
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

// Recursively invoke function-component nodes so stubs (Link, OrgSwitcher,
// SignOutButton) expand into their plain-object form. Mirrors the helper in
// mobile-nav-menu.test.ts.
type RenderNode = unknown;

function renderTree(node: RenderNode): RenderNode {
  if (!node || typeof node !== 'object') return node;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.type === 'function') {
    const result = (el.type as (p: unknown) => RenderNode)(el.props ?? {});
    return renderTree(result);
  }
  if (!el.props) return node;
  const newProps: Record<string, unknown> = { ...el.props };
  if (newProps.children !== undefined) {
    newProps.children = Array.isArray(newProps.children)
      ? newProps.children.map(renderTree)
      : renderTree(newProps.children as RenderNode);
  }
  return { ...el, props: newProps };
}

function renderNavBar(overrides: Partial<Parameters<typeof NavBar>[0]> = {}) {
  return renderTree(NavBar({
    username: 'alice',
    isAdminOrRepoAdmin: false,
    currentOrg,
    allOrgs: [],
    ...overrides,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavBar', () => {
  describe('Given I am an admin (Org Admin or Repo Admin)', () => {
    it('then I see Projects in navigation', () => {
      // [lld §B.1, I1] Admins see "Projects" link
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).toContain('Projects');
      expect(html).toContain('"/projects"');
    });

    it('then I see Organisation in navigation', () => {
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).toContain('Organisation');
    });

    it('then I see My Assessments with /assessments href (#438)', () => {
      // [issue #438] Admins are also assessment participants — they need the link
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).toContain('My Assessments');
      expect(html).toContain('"/assessments"');
    });

    it('then I do not see a Repositories link (deferred post-MVP)', () => {
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).not.toContain('Repositories');
    });

    it('then the FCS logo links to /projects', () => {
      // [lld §B.1, I2] Logo href is /projects for admins
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).toContain('"href":"/projects"');
    });

    it('then sign out is rendered via the SignOutButton component', () => {
      // [lld §B.1] inline form replaced with <SignOutButton/>
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: true }));
      expect(html).toContain('sign-out-button');
      expect(html).toContain('/auth/sign-out');
    });
  });

  describe('Given I am an Org Member (role = null)', () => {
    it('then I see My Assessments in navigation', () => {
      // [lld §B.1, I1] Members see "My Assessments"
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: false }));
      expect(html).toContain('My Assessments');
      expect(html).toContain('"/assessments"');
    });

    it('then I do not see admin-only links (Projects, Organisation)', () => {
      // [lld §B.1, I1] Members see neither Projects nor Organisation
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: false }));
      expect(html).not.toContain('Organisation');
      expect(html).not.toContain('"/projects"');
    });

    it('then the FCS logo links to /assessments', () => {
      // [lld §B.1, I2] Logo href is /assessments for members
      const html = JSON.stringify(renderNavBar({ isAdminOrRepoAdmin: false }));
      expect(html).toContain('"href":"/assessments"');
    });

    it('then I see my username in navigation', () => {
      const html = JSON.stringify(renderNavBar({ username: 'bob' }));
      expect(html).toContain('bob');
    });
  });

  describe('Given any user', () => {
    it('then a sign-out button posting to /auth/sign-out is present', () => {
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('/auth/sign-out');
      expect(html).toContain('POST');
    });
  });

  // -------------------------------------------------------------------------
  // Desktop layout preservation (req §Story 3.3 / issue #346)
  // -------------------------------------------------------------------------

  describe('Given a desktop viewport (>= 768px)', () => {
    it('then nav links, org switcher, and user controls are wrapped in hidden md:contents', () => {
      // [req §Story 3.3 AC] "Given desktop viewports (>= 768px), the current horizontal
      // NavBar layout is preserved."
      const html = JSON.stringify(renderNavBar());
      expect(html).toContain('hidden md:contents');
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
