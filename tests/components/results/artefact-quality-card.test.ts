/**
 * Tests for ArtefactQualityCard — §11.2b results page artefact quality display.
 * Issue: #238
 *
 * Component contract (from ArtefactQualityCardProps):
 *   score      — number | null (overall artefact quality score, 0..100)
 *   status     — 'success' | 'unavailable' | 'pending'
 *   dimensions — ArtefactQualityDimension[] | null
 *   flag       — FlagResult ({ key, copy })
 *
 * Rendering rules per spec [lld §11.2b]:
 *   status='success'     → render overall score as a number
 *   status='unavailable' → render "Unavailable" text; no flag
 *   status='pending'     → render nothing (null)
 *   dimensions present   → collapsed <details> with 6 rows in canonical order:
 *                          adr_references, linked_issues, design_documents,
 *                          pr_description, test_coverage, commit_messages
 *   flag.copy non-null   → render flag copy text
 *   flag.key non-null    → render warning banner
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks (Next.js / UI primitives that are not needed for logic tests)
// ---------------------------------------------------------------------------

// No Next.js server imports expected in this component (it is a pure UI helper).
// Mock any UI-library components that would otherwise fail in the Vitest jsdom env.

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { ArtefactQualityCard } from '@/components/results/artefact-quality-card';
import type { ArtefactQualityCardProps } from '@/components/results/artefact-quality-card';
import type { ArtefactQualityDimension } from '@/lib/engine/llm/schemas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Canonical dimension order [lld §11.2b acceptance criteria]. */
const CANONICAL_ORDER: ArtefactQualityDimension['key'][] = [
  'adr_references',
  'linked_issues',
  'design_documents',
  'pr_description',
  'test_coverage',
  'commit_messages',
];

function makeDimensions(): ArtefactQualityDimension[] {
  return [
    { key: 'adr_references',   sub_score: 80, category: 'detailed',  rationale: 'ADR referenced.' },
    { key: 'linked_issues',    sub_score: 70, category: 'detailed',  rationale: 'Issues linked.' },
    { key: 'design_documents', sub_score: 60, category: 'minimal',   rationale: 'Design doc present.' },
    { key: 'pr_description',   sub_score: 90, category: 'detailed',  rationale: 'Thorough description.' },
    { key: 'test_coverage',    sub_score: 50, category: 'minimal',   rationale: 'Partial tests.' },
    { key: 'commit_messages',  sub_score: 40, category: 'minimal',   rationale: 'Basic commit messages.' },
  ];
}

function makeProps(overrides: Partial<ArtefactQualityCardProps> = {}): ArtefactQualityCardProps {
  return {
    score: 75,
    status: 'success',
    dimensions: makeDimensions(),
    flag: { key: null, copy: null },
    ...overrides,
  };
}

/** Render the component to a JSON string for structural assertions. */
function render(props: ArtefactQualityCardProps): string {
  const el = ArtefactQualityCard(props);
  return JSON.stringify(el);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArtefactQualityCard', () => {

  // -------------------------------------------------------------------------
  // Status: 'success'
  // -------------------------------------------------------------------------

  describe('Given status = "success" with score 75', () => {

    // Property 1 — score is rendered as a number [lld §11.2b AC: "render overall score"]
    it('then renders the score value 75', () => {
      const html = render(makeProps({ score: 75, status: 'success' }));
      expect(html).toContain('75');
    });

    // Property 2 — "Unavailable" text is NOT rendered
    it('then does not render the "Unavailable" text', () => {
      const html = render(makeProps({ score: 75, status: 'success' }));
      expect(html).not.toContain('Unavailable');
    });

    // Property 3 — component is not null
    it('then returns a non-null React element', () => {
      const el = ArtefactQualityCard(makeProps({ score: 75, status: 'success' }));
      expect(el).not.toBeNull();
    });

  });

  // -------------------------------------------------------------------------
  // Status: 'unavailable'
  // -------------------------------------------------------------------------

  describe('Given status = "unavailable"', () => {

    // Property 4 — "Unavailable" text rendered [lld §11.2b BDD: 'renders "unavailable"...']
    it('then renders "Unavailable" text', () => {
      const html = render(makeProps({ score: null, status: 'unavailable', dimensions: null }));
      expect(html).toContain('Unavailable');
    });

    // Property 5 — no flag copy is rendered [lld §11.2b: no flag when unavailable]
    it('then does not render flag copy even if flag key is provided', () => {
      // The upstream computeArtefactQualityFlag always returns null for unavailable,
      // but a defensive test confirms the component does not render stray flag copy.
      const flagCopy = 'Some flag copy text.';
      const html = render(makeProps({
        score: null,
        status: 'unavailable',
        dimensions: null,
        flag: { key: 'comprehension_gap', copy: flagCopy },
      }));
      expect(html).not.toContain(flagCopy);
    });

    // Property 6 — component is not null (returns a UI element, not nothing)
    it('then returns a non-null React element', () => {
      const el = ArtefactQualityCard(makeProps({ score: null, status: 'unavailable', dimensions: null }));
      expect(el).not.toBeNull();
    });

  });

  // -------------------------------------------------------------------------
  // Status: 'pending'
  // -------------------------------------------------------------------------

  describe('Given status = "pending"', () => {

    // Property 7 — renders null (nothing) when pending [lld §11.2b: "Nothing (null) when status='pending'"]
    it('then returns null', () => {
      const el = ArtefactQualityCard(makeProps({ score: null, status: 'pending', dimensions: null }));
      expect(el).toBeNull();
    });

  });

  // -------------------------------------------------------------------------
  // Dimension breakdown
  // -------------------------------------------------------------------------

  describe('Given status = "success" with six dimensions', () => {

    // Property 8 — per-dimension breakdown is inside a <details> element [lld §11.2b AC]
    it('then renders a <details> element containing the dimension breakdown', () => {
      const html = render(makeProps());
      expect(html).toContain('details');
    });

    // Property 9 — all six dimension keys appear in the output [lld §11.2b AC]
    it('then renders all six dimension key labels', () => {
      const html = render(makeProps());
      for (const key of CANONICAL_ORDER) {
        expect(html).toContain(key);
      }
    });

    // Property 10 — dimensions appear in canonical order [lld §11.2b AC: "canonical order: adr_references, linked_issues, design_documents, pr_description, test_coverage, commit_messages"]
    it('then renders dimension keys in canonical order: adr_references before linked_issues before design_documents before pr_description before test_coverage before commit_messages', () => {
      const html = render(makeProps());
      const positions = CANONICAL_ORDER.map(key => html.indexOf(key));
      for (let i = 0; i < positions.length - 1; i++) {
        expect(positions[i]).toBeGreaterThanOrEqual(0);
        expect(positions[i]).toBeLessThan(positions[i + 1]!);
      }
    });

    // Property 11 — dimension sub_score values appear in output
    it('then renders each dimension sub_score value', () => {
      const dims = makeDimensions();
      const html = render(makeProps({ dimensions: dims }));
      for (const dim of dims) {
        expect(html).toContain(String(dim.sub_score));
      }
    });

  });

  // -------------------------------------------------------------------------
  // Flag copy
  // -------------------------------------------------------------------------

  describe('Given flag.copy is non-null', () => {

    // Property 12 — flag copy text is rendered [lld §11.2b: "Flag copy text when flag.copy is non-null"]
    it('then renders the flag copy text', () => {
      const copy = 'Your team understands the feature but the artefacts are thin.';
      const html = render(makeProps({
        flag: { key: 'comprehension_gap', copy },
      }));
      expect(html).toContain(copy);
    });

  });

  describe('Given flag.copy is null', () => {

    // Property 13 — no stray copy text rendered when flag.copy is null
    it('then does not render any flag copy element', () => {
      const html = render(makeProps({
        flag: { key: null, copy: null },
      }));
      // The copy field being null should produce no flag text in the output.
      // We check the output does not contain a known sentinel that would only appear
      // inside a flag copy block.
      expect(html).not.toMatch(/comprehension_gap|comprehension_and_documentation_risk|tacit_knowledge_concentration/);
    });

  });

  // -------------------------------------------------------------------------
  // Warning banners
  // -------------------------------------------------------------------------

  describe('Given flag.key is non-null', () => {

    // Property 14 — a warning banner is rendered when flag.key is set
    // [lld §11.2b: "Warning banners when quality or FCS thresholds are breached"]
    it('then renders a warning indicator (banner or alert element)', () => {
      const html = render(makeProps({
        flag: { key: 'comprehension_gap', copy: 'Team understands but docs are sparse.' },
      }));
      // The flag key itself or some warning-class element must be present.
      // We check that the copy text renders (which is the primary visible warning signal).
      expect(html).toContain('Team understands but docs are sparse.');
    });

    it('then renders the specific flag key as part of the warning content', () => {
      const html = render(makeProps({
        flag: { key: 'tacit_knowledge_concentration', copy: 'Knowledge is locked in team members.' },
      }));
      expect(html).toContain('tacit_knowledge_concentration');
    });

  });

  describe('Given flag.key is null', () => {

    // Property 15 — no warning banner when flag.key is null
    it('then does not render any of the three flag key strings', () => {
      const html = render(makeProps({
        flag: { key: null, copy: null },
      }));
      expect(html).not.toContain('comprehension_gap');
      expect(html).not.toContain('comprehension_and_documentation_risk');
      expect(html).not.toContain('tacit_knowledge_concentration');
    });

  });

  // -------------------------------------------------------------------------
  // Backwards compatibility: null dimensions
  // -------------------------------------------------------------------------

  describe('Given status = "success" but dimensions = null (legacy assessment)', () => {

    // Property 16 — score still renders even when dimensions are absent
    // [lld §11.2b: "Backwards compatible: legacy assessments without quality data render without errors"]
    it('then renders the score without error', () => {
      const html = render(makeProps({ dimensions: null, score: 62 }));
      expect(html).toContain('62');
    });

    // Property 17 — no <details> element rendered when dimensions are null
    it('then does not render the dimensions accordion', () => {
      // Without dimension data there is nothing to expand; the details element
      // must be absent or empty.
      const withDims = render(makeProps({ dimensions: makeDimensions() }));
      const withoutDims = render(makeProps({ dimensions: null }));
      // Either the details element is gone or it contains no key labels
      const hasDetailsWithContent = withoutDims.includes('adr_references');
      expect(hasDetailsWithContent).toBe(false);
      // Confirm that with dimensions it IS present, so we know the test distinguishes
      expect(withDims).toContain('adr_references');
    });

  });

});
