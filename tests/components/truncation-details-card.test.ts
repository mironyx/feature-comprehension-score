// Tests for TruncationDetailsCard — renders truncation details section.
// Design reference: docs/design/lld-v5-e1-token-budget.md §Story 1.3
// Requirements: docs/requirements/v5-requirements.md §Story 1.3
// Issue: #330

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TruncationDetailsCard, {
  type TruncationDetailsCardProps,
} from '@/components/assessment/TruncationDetailsCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProps(overrides: Partial<TruncationDetailsCardProps> = {}): TruncationDetailsCardProps {
  return {
    token_budget_applied: true,
    truncation_notes: ['12 of 33 file contents dropped', 'All 16 test files dropped'],
    rubric_tool_call_count: 0,
    ...overrides,
  };
}

/** Render the component to HTML; throws "not implemented" until implementation lands. */
function render(props: TruncationDetailsCardProps): string {
  return renderToStaticMarkup(TruncationDetailsCard(props) as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TruncationDetailsCard', () => {
  // -------------------------------------------------------------------------
  // Properties 1 & 2 — null return cases (token_budget_applied false or null)
  // -------------------------------------------------------------------------

  describe('Given token_budget_applied is false', () => {
    it('then returns null (no truncation section in DOM)', () => {
      // Property 1 [req §1.3, lld §1.3]: component returns null when token_budget_applied is false
      const result = TruncationDetailsCard(makeProps({ token_budget_applied: false }));
      expect(result).toBeNull();
    });
  });

  describe('Given token_budget_applied is null', () => {
    it('then returns null (legacy assessment with no truncation data)', () => {
      // Property 2 [req §1.3, lld §1.3]: component returns null when token_budget_applied is null
      const result = TruncationDetailsCard(makeProps({ token_budget_applied: null }));
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Properties 3 & 4 — section rendered with heading
  // -------------------------------------------------------------------------

  describe('Given token_budget_applied is true', () => {
    it('then renders the truncation details section', () => {
      // Property 3 [req §1.3, lld §1.3]: section is present in the DOM
      const html = render(makeProps());
      expect(html.length).toBeGreaterThan(0);
    });

    it('then renders "Truncation details" as the section heading', () => {
      // Property 4 [lld §1.3]: heading text must be "Truncation details"
      const html = render(makeProps());
      expect(html).toContain('Truncation details');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5 — each truncation note rendered as a list item
  // -------------------------------------------------------------------------

  describe('Given token_budget_applied is true', () => {
    it('then renders each truncation note as a list item', () => {
      // Property 5 [req §1.3, lld §1.3]: each note in truncation_notes appears as an <li>
      const notes = ['12 of 33 file contents dropped', 'All 16 test files dropped'];
      const html = render(makeProps({ truncation_notes: notes }));
      expect(html).toContain('12 of 33 file contents dropped');
      expect(html).toContain('All 16 test files dropped');
      // Both notes must be wrapped in <li> elements
      const liCount = (html.match(/<li[> ]/g) ?? []).length;
      expect(liCount).toBe(notes.length);
    });

    it('then renders a single truncation note as a single list item', () => {
      // Property 5 [req §1.3]: boundary — one note produces exactly one <li>
      const html = render(makeProps({ truncation_notes: ['Code diff truncated'] }));
      expect(html).toContain('Code diff truncated');
      const liCount = (html.match(/<li[> ]/g) ?? []).length;
      expect(liCount).toBe(1);
    });

    it('then renders no list items when truncation_notes is an empty array', () => {
      // Property 11 [lld §1.3]: empty notes array — section still renders but list is empty
      const html = render(makeProps({ truncation_notes: [] }));
      const liCount = (html.match(/<li[> ]/g) ?? []).length;
      expect(liCount).toBe(0);
    });

    it('then renders no list items when truncation_notes is null', () => {
      // Property 10 [lld §1.3]: null notes treated as empty — no crash, no list items
      const html = render(makeProps({ truncation_notes: null }));
      const liCount = (html.match(/<li[> ]/g) ?? []).length;
      expect(liCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Properties 6, 7, 9 — retrieval recommendation shown when retrieval not enabled
  // -------------------------------------------------------------------------

  describe('Given token_budget_applied is true and retrieval was not enabled (rubric_tool_call_count === 0)', () => {
    it('then renders the retrieval recommendation message', () => {
      // Property 6 [req §1.3, lld §1.3]: recommendation shown when count === 0
      const html = render(makeProps({ rubric_tool_call_count: 0 }));
      expect(html).toContain('Enable retrieval in organisation settings');
    });

    it('then the recommendation message mentions truncation and context window', () => {
      // Property 9 [req §1.3]: message must reference truncation and context window
      const html = render(makeProps({ rubric_tool_call_count: 0 }));
      expect(html).toContain("truncated to fit the model");
      expect(html).toContain("context window");
    });

    it('then the recommendation message mentions enabling retrieval', () => {
      // Property 9 [req §1.3]: exact wording — "Enable retrieval in organisation settings to let the LLM fetch additional content on demand"
      const html = render(makeProps({ rubric_tool_call_count: 0 }));
      expect(html).toContain('let the LLM fetch');
      expect(html).toContain('additional content on demand');
    });
  });

  describe('Given token_budget_applied is true and retrieval was not enabled (rubric_tool_call_count === null)', () => {
    it('then renders the retrieval recommendation message', () => {
      // Property 7 [req §1.3, lld §1.3]: recommendation shown when count === null (retrieval not used)
      const html = render(makeProps({ rubric_tool_call_count: null }));
      expect(html).toContain('Enable retrieval in organisation settings');
    });
  });

  // -------------------------------------------------------------------------
  // Property 8 — retrieval recommendation absent when retrieval was enabled
  // -------------------------------------------------------------------------

  describe('Given token_budget_applied is true and retrieval was enabled (rubric_tool_call_count > 0)', () => {
    it('then does NOT render the retrieval recommendation message', () => {
      // Property 8 [req §1.3, lld §1.3, issue]: no recommendation when count > 0 (retrieval was active)
      const html = render(makeProps({ rubric_tool_call_count: 3 }));
      expect(html).not.toContain('Enable retrieval in organisation settings');
    });

    it('then still renders the truncation details section with notes', () => {
      // Property 3 [req §1.3]: section is still rendered even when retrieval was enabled
      const html = render(makeProps({ rubric_tool_call_count: 5, truncation_notes: ['Code diff truncated'] }));
      expect(html).toContain('Truncation details');
      expect(html).toContain('Code diff truncated');
    });
  });
});
