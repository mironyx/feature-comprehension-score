// Tests for NavLinks component — active route highlighting and link rendering.
// Design reference: docs/design/lld-v7-frontend-ux.md § T2
// Requirements reference: docs/requirements/v7-requirements.md § Story 1.2
// Issue: #341

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockUsePathname = vi.fn<[], string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: unknown;
    className?: string;
  }) => ({
    type: 'a',
    props: { href, children, className },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { NavLinks } from '@/components/nav-links';
import type { NavLink } from '@/components/nav-links';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ASSESSMENTS_LINK: NavLink = {
  href: '/assessments',
  label: 'My Assessments',
  matchPrefix: '/assessments',
};

const ORGANISATION_LINK: NavLink = {
  href: '/organisation',
  label: 'Organisation',
  matchPrefix: '/organisation',
};

const DEFAULT_LINKS: readonly NavLink[] = [ASSESSMENTS_LINK, ORGANISATION_LINK];

function renderNavLinks(
  links: readonly NavLink[] = DEFAULT_LINKS,
  pathname = '/'
): string {
  mockUsePathname.mockReturnValue(pathname);
  return JSON.stringify(NavLinks({ links }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavLinks', () => {
  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  describe('Given the component renders', () => {
    it('then it returns a ul element', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/');
      expect(html).toContain('"ul"');
    });

    it('then it renders one li per link', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/');
      // Two links → two "li" occurrences
      const matches = html.match(/"li"/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(DEFAULT_LINKS.length);
    });
  });

  // -------------------------------------------------------------------------
  // href and label rendering
  // -------------------------------------------------------------------------

  describe('Given links are provided', () => {
    it('then each link is rendered with the correct href', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/');
      expect(html).toContain('"/assessments"');
      expect(html).toContain('"/organisation"');
    });

    it('then each link displays the correct label text', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/');
      expect(html).toContain('My Assessments');
      expect(html).toContain('Organisation');
    });
  });

  // -------------------------------------------------------------------------
  // Active state — exact pathname match
  // -------------------------------------------------------------------------

  describe('Given the pathname exactly matches a matchPrefix', () => {
    it('then the matching link carries text-accent', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      // Locate the assessments link's className and check it contains text-accent
      const parsed = JSON.parse(html);
      const ul = parsed;
      const children: unknown[] = ul.props.children;
      const assessmentsLi = children.find((child: unknown) => {
        const c = child as { props: { children: { props: { children: unknown } } } };
        return JSON.stringify(c).includes('"My Assessments"');
      });
      const assessmentsLink = (assessmentsLi as { props: { children: { props: { className: string } } } })
        .props.children;
      expect(assessmentsLink.props.className).toContain('text-accent');
    });

    it('then the matching link carries border-b-2', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('border-b-2');
    });

    it('then the matching link carries border-accent', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('border-accent');
    });

    it('then the Organisation link is active when pathname is /organisation', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/organisation');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"Organisation"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Active state — sub-path (startsWith matchPrefix + '/') match
  // -------------------------------------------------------------------------

  describe('Given pathname is a child of a matchPrefix', () => {
    it('then My Assessments is active when pathname starts with /assessments/', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments/abc-123/results');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('text-accent');
    });

    it('then My Assessments is active for /assessments/new', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments/new');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Prefix boundary — must not over-match
  // -------------------------------------------------------------------------

  describe('Given a pathname that shares characters but not a segment boundary', () => {
    it('then /assessments-extra does not activate the /assessments link', () => {
      // The match rule is: pathname === matchPrefix OR pathname.startsWith(matchPrefix + '/')
      // '/assessments-extra'.startsWith('/assessments/') is false, so no active class.
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments-extra');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).not.toContain('text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Non-active styling
  // -------------------------------------------------------------------------

  describe('Given a link is not active', () => {
    it('then it carries text-text-secondary', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      // Organisation link should not be active
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"Organisation"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('text-text-secondary');
    });

    it('then it carries a hover affordance distinct from the active accent', () => {
      // Resolved spec gap (test-author flagged): the LLD reserves text-accent for the
      // active state, so the hover signal on inactive links must use a non-accent token
      // to keep "only one link active at a time" detectable by class inspection.
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"Organisation"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).toContain('hover:text-text-primary');
    });

    it('then it does not carry text-accent', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/organisation');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;
      const li = children.find((c: unknown) => JSON.stringify(c).includes('"My Assessments"'));
      const link = (li as { props: { children: { props: { className: string } } } }).props.children;
      expect(link.props.className).not.toContain('text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Mutual exclusivity — only one link active at a time
  // -------------------------------------------------------------------------

  describe('Given only one link can be active at a time', () => {
    it('then when on /assessments only My Assessments is active, not Organisation', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/assessments');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;

      const assessmentsLi = children.find((c: unknown) =>
        JSON.stringify(c).includes('"My Assessments"')
      );
      const orgLi = children.find((c: unknown) =>
        JSON.stringify(c).includes('"Organisation"')
      );

      const assessmentsClass = (
        assessmentsLi as { props: { children: { props: { className: string } } } }
      ).props.children.props.className;
      const orgClass = (
        orgLi as { props: { children: { props: { className: string } } } }
      ).props.children.props.className;

      expect(assessmentsClass).toContain('text-accent');
      expect(orgClass).not.toContain('text-accent');
    });

    it('then when on /organisation only Organisation is active, not My Assessments', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/organisation');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;

      const assessmentsLi = children.find((c: unknown) =>
        JSON.stringify(c).includes('"My Assessments"')
      );
      const orgLi = children.find((c: unknown) =>
        JSON.stringify(c).includes('"Organisation"')
      );

      const assessmentsClass = (
        assessmentsLi as { props: { children: { props: { className: string } } } }
      ).props.children.props.className;
      const orgClass = (
        orgLi as { props: { children: { props: { className: string } } } }
      ).props.children.props.className;

      expect(orgClass).toContain('text-accent');
      expect(assessmentsClass).not.toContain('text-accent');
    });

    it('then when on an unrelated pathname no link is active', () => {
      const html = renderNavLinks(DEFAULT_LINKS, '/settings');
      const parsed = JSON.parse(html);
      const children: unknown[] = parsed.props.children;

      for (const child of children) {
        const link = (child as { props: { children: { props: { className: string } } } }).props
          .children;
        expect(link.props.className).not.toContain('text-accent');
      }
    });
  });
});
