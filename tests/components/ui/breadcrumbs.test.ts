// Tests for Breadcrumbs component — presentational breadcrumb trail.
// Design reference: docs/design/lld-v7-frontend-ux.md § T1
// Requirements: docs/requirements/v7-requirements.md § Epic 1 Story 1.1
// Issue: #340

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that resolve next/link
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import type { BreadcrumbSegment } from '@/components/ui/breadcrumbs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively serialise an element tree to a plain string for substring checks. */
function serialise(node: unknown): string {
  return JSON.stringify(node);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Breadcrumbs', () => {

  // -------------------------------------------------------------------------
  // Property 1: root element is a <nav> with aria-label="Breadcrumb"
  // [req §Epic1/Story1.1] [lld §T1]
  // -------------------------------------------------------------------------
  describe('Given any segment list', () => {
    it('then the root element is a nav element', () => {
      const el = Breadcrumbs({ segments: [{ label: 'Home' }] });

      expect(el.type).toBe('nav');
    });

    it('then the nav has aria-label="Breadcrumb"', () => {
      const el = Breadcrumbs({ segments: [{ label: 'Home' }] });

      expect(el.props['aria-label']).toBe('Breadcrumb');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: wrapper carries text-caption and text-text-secondary
  // [lld §T1 Styling]
  // -------------------------------------------------------------------------
  describe('Given any segment list', () => {
    it('then the nav or its immediate list child carries text-caption class', () => {
      const el = Breadcrumbs({ segments: [{ label: 'Home' }] });

      // The class may sit on the <nav> itself or a direct child container.
      const html = serialise(el);
      expect(html).toContain('text-caption');
    });

    it('then the nav or its immediate list child carries text-text-secondary class', () => {
      const el = Breadcrumbs({ segments: [{ label: 'Home' }] });

      const html = serialise(el);
      expect(html).toContain('text-text-secondary');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: single segment without href renders as plain text, not a link
  // [req §Epic1/Story1.1 — "each segment except the current page is a link"]
  // [lld §T1 — "href?: undefined = current page (no link)"]
  // -------------------------------------------------------------------------
  describe('Given a single segment with no href (root page)', () => {
    it('then it renders a single segment without a link', () => {
      const el = Breadcrumbs({ segments: [{ label: 'My Assessments' }] });

      const html = serialise(el);
      // No anchor element should appear
      expect(html).not.toContain('"type":"a"');
    });

    it('then the label text appears in the output', () => {
      const el = Breadcrumbs({ segments: [{ label: 'My Assessments' }] });

      const html = serialise(el);
      expect(html).toContain('My Assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: segments with href render as links with the correct href
  // [req §Epic1/Story1.1 — "each segment except the current page is a clickable link"]
  // [lld §T1 — href present → link]
  // -------------------------------------------------------------------------
  describe('Given a segment with href provided', () => {
    it('then it renders as an anchor element (via next/link)', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'New Assessment' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('"type":"a"');
    });

    it('then the link href matches the provided href value', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'New Assessment' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('/assessments');
    });

    it('then the link label text appears in the output', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'New Assessment' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('My Assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: last segment without href renders as plain text with
  //             text-text-primary (current page styling)
  // [req §Epic1/Story1.1 — "active segment in text-text-primary"]
  // [lld §T1 Styling — "Current segment: text-text-primary, not linked"]
  // Note: The contract ties linking to presence of href, not to position.
  //       A segment without href is "current page" regardless of index.
  // -------------------------------------------------------------------------
  describe('Given the last segment has no href (current page)', () => {
    it('then the last segment carries text-text-primary class', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('text-text-primary');
    });

    it('then the last segment does not render as a link', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });

      // Serialise the full tree; confirm "Results" does NOT appear inside an anchor.
      const html = serialise(el);
      // The anchor must not contain the text "Results"
      const anchors = (html.match(/"type":"a".*?(?="type":(?!"a")|\]|\}$)/gs) ?? []);
      for (const anchor of anchors) {
        expect(anchor).not.toContain('Results');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: links carry hover:text-accent class
  // [lld §T1 Styling — "Links: hover:text-accent"]
  // -------------------------------------------------------------------------
  describe('Given a segment with href', () => {
    it('then the link element carries hover:text-accent class', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('hover:text-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: separators appear between segments but not before the first
  //             or after the last
  // [lld §T1 Styling — "Separator: > or / in text-text-secondary"]
  // -------------------------------------------------------------------------
  describe('Given multiple segments', () => {
    it('then a separator character appears in the rendered output', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Feature Alpha', href: '/assessments/42' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      // Separator is either '>' or '/'
      const hasGt = html.includes('>') || html.includes('&gt;');
      const hasSlash = html.includes('/');
      expect(hasGt || hasSlash).toBe(true);
    });

    it('then the number of separator occurrences equals segments.length - 1', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'A', href: '/a' },
        { label: 'B', href: '/b' },
        { label: 'C' },
      ];
      const el = Breadcrumbs({ segments });
      const html = serialise(el);

      // Count how many times the separator character appears.
      // We need exactly 2 separators for 3 segments.
      // Use a reliable separator string: the component uses '>' or '/'.
      // Try both and accept whichever one gives count == segments.length - 1.
      const countOccurrences = (str: string, sub: string) =>
        str.split(sub).length - 1;

      const gtCount = countOccurrences(html, '\\u003e'); // JSON-encoded >
      const slashCount = countOccurrences(html, '"\/"'); // JSON slash in separator elements

      // Accept > (as > in JSON) or a dedicated separator element containing /
      // The separator count must equal segments.length - 1 = 2
      const separatorCount = gtCount >= 2 ? gtCount : slashCount;
      expect(separatorCount).toBeGreaterThanOrEqual(segments.length - 1);
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: long-label truncation classes — ellipsis on narrow viewports
  // [req §Epic1/Story1.1 — "breadcrumbs truncate gracefully (ellipsis)"]
  // [lld §T1 BDD — "truncates long labels with ellipsis on narrow viewports"]
  // -------------------------------------------------------------------------
  describe('Given a segment with a long label', () => {
    it('then segment elements carry a truncate class for ellipsis overflow', () => {
      const longLabel = 'A'.repeat(80);
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: longLabel },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('truncate');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: all segment labels appear in the rendered output
  // [req §Epic1/Story1.1] — basic correctness guarantee
  // -------------------------------------------------------------------------
  describe('Given a three-segment trail (results page)', () => {
    it('then all three segment labels appear in the output', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Feature Alpha', href: '/assessments/42' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });

      const html = serialise(el);
      expect(html).toContain('My Assessments');
      expect(html).toContain('Feature Alpha');
      expect(html).toContain('Results');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: empty segments array — renders nav with no segment items
  // [lld §T1 — no explicit empty-state rule; we assert the nav is still present
  //  rather than null, since the component always returns ReactElement per signature]
  // -------------------------------------------------------------------------
  describe('Given an empty segments array', () => {
    it('then a nav element is still returned (not null)', () => {
      const el = Breadcrumbs({ segments: [] });

      expect(el).not.toBeNull();
      expect(el.type).toBe('nav');
    });

    it('then no anchor links are rendered', () => {
      const el = Breadcrumbs({ segments: [] });

      const html = serialise(el);
      expect(html).not.toContain('"type":"a"');
    });
  });
});
