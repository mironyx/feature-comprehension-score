// Adversarial evaluation tests for issue #340 — Breadcrumbs navigation component.
//
// Two genuine gaps found in the test-author's suite:
//
// GAP-1: No trailing separator — the existing separator-count test uses `>=`
//        which would pass even if a trailing separator appeared after the last
//        segment.  The contract (LLD §T1) places separators only between
//        segments.  A regression changing `idx < segments.length - 1` to
//        `idx <= segments.length - 1` would not be caught.
//
// GAP-2: Separator is aria-hidden — the LLD spec shows
//        `<span aria-hidden="true">` on the separator so screen readers skip
//        the decorative character.  No existing test verifies this attribute.
//
// Failures here are findings.  Do NOT fix the implementation in this file.
//
// Tests use the same function-call + JSON.stringify inspection pattern as
// tests/components/ui/breadcrumbs.test.ts.

import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: unknown; className?: string }) => ({
    type: 'a',
    props: { href, children, className },
  }),
}));

import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import type { BreadcrumbSegment } from '@/components/ui/breadcrumbs';

function serialise(node: unknown): string {
  return JSON.stringify(node);
}

describe('Breadcrumbs (adversarial)', () => {

  // -------------------------------------------------------------------------
  // GAP-1: No trailing separator after the last segment
  // [lld §T1 — separator between segments, not after the last one]
  // The test-author's count test uses >= which would pass with too many
  // separators.  This test asserts the exact count (== segments.length - 1).
  // -------------------------------------------------------------------------
  describe('Given a multi-segment trail', () => {
    it('then there is no separator after the last segment (exact count)', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'A', href: '/a' },
        { label: 'B', href: '/b' },
        { label: 'C' },
      ];
      const el = Breadcrumbs({ segments });
      const html = serialise(el);

      // The separator span content serialises as the string value "/" in JSON.
      // Count occurrences of the JSON token `"/"` (quote-slash-quote).
      // href values like "/a" and "/b" serialise as "/a" and "/b" — they do
      // NOT match the pattern `"/"` (exactly quote-slash-quote), so counting
      // `"/"` gives only the decorator spans.
      const countExact = (str: string, token: string) =>
        str.split(token).length - 1;

      const separatorCount = countExact(html, '"/"');
      // For 3 segments there must be exactly 2 separators — one between each
      // adjacent pair.  A trailing separator would give 3.
      expect(separatorCount).toBe(segments.length - 1);
    });
  });

  // -------------------------------------------------------------------------
  // GAP-2: Separator carries aria-hidden="true"
  // [lld §T1 — `<span aria-hidden="true" …>/</span>`]
  // Screen readers must not announce the decorative separator character.
  // -------------------------------------------------------------------------
  describe('Given a multi-segment trail', () => {
    it('then separator spans carry aria-hidden="true" so screen readers skip them', () => {
      const segments: BreadcrumbSegment[] = [
        { label: 'My Assessments', href: '/assessments' },
        { label: 'Results' },
      ];
      const el = Breadcrumbs({ segments });
      const html = serialise(el);

      // React serialises aria-hidden as a string prop ("true"), not a boolean.
      // The JSON form is: "aria-hidden":"true"
      expect(html).toContain('"aria-hidden":"true"');
    });
  });
});
