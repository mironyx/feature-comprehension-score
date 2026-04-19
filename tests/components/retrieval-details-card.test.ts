// Tests for RetrievalDetailsCard — collapsible "Retrieval details" section.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2b
// Requirements: docs/requirements/v2-requirements.md §Story 17.2
// Issue: #247

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ToolCallLogEntry } from '@/lib/engine/llm/tools';
import RetrievalDetailsCard, {
  type RetrievalDetailsCardProps,
} from '@/components/assessment/RetrievalDetailsCard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ToolCallLogEntry> = {}): ToolCallLogEntry {
  return {
    tool_name: 'readFile',
    argument_path: 'docs/adr/0014-api-routes.md',
    bytes_returned: 1024,
    outcome: 'ok',
    ...overrides,
  };
}

function makeProps(overrides: Partial<RetrievalDetailsCardProps> = {}): RetrievalDetailsCardProps {
  return {
    rubric_tool_call_count: 2,
    rubric_tool_calls: [
      makeEntry({ outcome: 'ok', bytes_returned: 512 }),
      makeEntry({
        tool_name: 'listDirectory',
        argument_path: 'docs/design',
        bytes_returned: 256,
        outcome: 'ok',
      }),
    ],
    rubric_input_tokens: 300,
    rubric_output_tokens: 100,
    rubric_duration_ms: 4200,
    ...overrides,
  };
}

/** Render the component to HTML; throws "not implemented" until implementation lands. */
function render(props: RetrievalDetailsCardProps): string {
  return renderToStaticMarkup(RetrievalDetailsCard(props) as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RetrievalDetailsCard', () => {
  // -------------------------------------------------------------------------
  // Properties 1 & 2 — hidden cases (null returns)
  // -------------------------------------------------------------------------

  describe('Given rubric_tool_call_count is 0', () => {
    it('then returns null (no "Retrieval details" heading in DOM)', () => {
      // Property 1 [lld §17.2b, issue]: component returns null when count === 0
      const result = RetrievalDetailsCard(makeProps({ rubric_tool_call_count: 0, rubric_tool_calls: [] }));
      expect(result).toBeNull();
    });

    it('then no tool_name text is rendered', () => {
      // Property 1 [lld §17.2b]: null return means no child content at all
      const result = RetrievalDetailsCard(makeProps({
        rubric_tool_call_count: 0,
        rubric_tool_calls: [],
      }));
      expect(result).toBeNull();
    });
  });

  describe('Given rubric_tool_call_count is null (legacy assessment)', () => {
    it('then returns null', () => {
      // Property 2 [lld §17.2b, req §17.2]: null count → legacy assessment → hidden
      const result = RetrievalDetailsCard(makeProps({ rubric_tool_call_count: null, rubric_tool_calls: null }));
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Properties 3, 12 — header and section heading
  // -------------------------------------------------------------------------

  describe('Given rubric_tool_call_count > 0', () => {
    it('then renders "Retrieval details" as the section heading', () => {
      // Property 12 [lld §17.2b]: heading text must be "Retrieval details"
      const html = render(makeProps());
      expect(html).toContain('Retrieval details');
    });

    it('then shows total call count equal to rubric_tool_call_count', () => {
      // Property 14 [lld §17.2b]: header "total calls" === rubric_tool_call_count
      const html = render(makeProps({ rubric_tool_call_count: 3 }));
      expect(html).toContain('3');
    });

    it('then shows total bytes equal to the sum of bytes_returned across all entries', () => {
      // Property 15 [lld §17.2b]: header "total bytes" === sum(bytes_returned)
      const calls: ToolCallLogEntry[] = [
        makeEntry({ bytes_returned: 100 }),
        makeEntry({ bytes_returned: 200 }),
        makeEntry({ bytes_returned: 300 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 3, rubric_tool_calls: calls }));
      expect(html).toContain('600');
    });

    it('then shows the duration value in ms when rubric_duration_ms is non-null', () => {
      // Property 17 [lld §17.2b]: duration rendered numerically when present
      const html = render(makeProps({ rubric_duration_ms: 4200 }));
      expect(html).toContain('4200');
    });
  });

  // -------------------------------------------------------------------------
  // Property 13 — collapsible (details/summary pattern for SSR)
  // -------------------------------------------------------------------------

  describe('Given the section is rendered', () => {
    it('then uses a <details> element for SSR-compatible collapsibility', () => {
      // Property 13 [lld §17.2b, req §17.2]: collapsible section; <details>/<summary> is the
      // SSR-compatible pattern (no JS required to toggle)
      const html = render(makeProps());
      expect(html).toContain('<details');
      expect(html).toContain('<summary');
    });
  });

  // -------------------------------------------------------------------------
  // Properties 4 & 16 — "Missing artefacts" summary present
  // -------------------------------------------------------------------------

  describe('Given at least one not_found outcome in rubric_tool_calls', () => {
    it('then shows a "Missing artefacts" summary', () => {
      // Property 4 [lld §17.2b, req §17.2]: "Missing artefacts" summary visible when not_found exists
      const calls: ToolCallLogEntry[] = [
        makeEntry({ outcome: 'ok' }),
        makeEntry({ argument_path: 'docs/adr/0001-missing.md', outcome: 'not_found', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 2, rubric_tool_calls: calls }));
      expect(html).toContain('Missing artefacts');
    });

    it('then lists each not_found argument_path in the summary', () => {
      // Property 16 [lld §17.2b]: "Missing artefacts" section lists the paths that were not found
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/adr/0001-missing.md', outcome: 'not_found', bytes_returned: 0 }),
        makeEntry({ argument_path: 'docs/design/v1-design.md', outcome: 'not_found', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 2, rubric_tool_calls: calls }));
      expect(html).toContain('docs/adr/0001-missing.md');
      expect(html).toContain('docs/design/v1-design.md');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5 — "Missing artefacts" summary absent
  // -------------------------------------------------------------------------

  describe('Given no not_found outcomes in rubric_tool_calls', () => {
    it('then does NOT show "Missing artefacts" summary', () => {
      // Property 5 [lld §17.2b]: no not_found → no summary block
      const calls: ToolCallLogEntry[] = [
        makeEntry({ outcome: 'ok' }),
        makeEntry({ outcome: 'error' }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 2, rubric_tool_calls: calls }));
      expect(html).not.toContain('Missing artefacts');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6 — all entries listed
  // -------------------------------------------------------------------------

  describe('Given multiple tool call entries', () => {
    it('then every entry tool_name appears in the expandable list', () => {
      // Property 6 [lld §17.2b]: each entry's tool_name is rendered in the list
      const calls: ToolCallLogEntry[] = [
        makeEntry({ tool_name: 'readFile', argument_path: 'docs/adr/0001.md' }),
        makeEntry({ tool_name: 'listDirectory', argument_path: 'docs/design' }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 2, rubric_tool_calls: calls }));
      expect(html).toContain('readFile');
      expect(html).toContain('listDirectory');
    });

    it('then every entry argument_path appears in the expandable list', () => {
      // Property 6 [lld §17.2b]: each entry's argument_path is rendered in the list
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/adr/0001.md' }),
        makeEntry({ argument_path: 'src/lib/engine/llm/tools.ts' }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 2, rubric_tool_calls: calls }));
      expect(html).toContain('docs/adr/0001.md');
      expect(html).toContain('src/lib/engine/llm/tools.ts');
    });
  });

  // -------------------------------------------------------------------------
  // Properties 7, 8, 11 — warning (destructive) styling
  // -------------------------------------------------------------------------

  describe('Given a forbidden_path outcome', () => {
    it('then renders that entry with a class containing "destructive"', () => {
      // Property 7 [lld §17.2b, tailwind.config.ts]: forbidden_path → warning colour (destructive)
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: '/etc/passwd', outcome: 'forbidden_path', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      // Locate the entry's class in the HTML; must contain 'destructive'
      const entryIndex = html.indexOf('/etc/passwd');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      // The surrounding HTML (entry container) must contain 'destructive'
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).toContain('destructive');
    });
  });

  describe('Given a budget_exhausted outcome', () => {
    it('then renders that entry with a class containing "destructive"', () => {
      // Property 8 [lld §17.2b]: budget_exhausted → warning colour (destructive)
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/large-file.md', outcome: 'budget_exhausted', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      const entryIndex = html.indexOf('docs/large-file.md');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).toContain('destructive');
    });
  });

  describe('Given an iteration_limit_reached outcome', () => {
    it('then renders that entry with a class containing "destructive"', () => {
      // Property 11 [lld §17.2b]: iteration_limit_reached → warning colour (destructive)
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/adr/0010.md', outcome: 'iteration_limit_reached', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      const entryIndex = html.indexOf('docs/adr/0010.md');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).toContain('destructive');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9 — ok outcome normal styling (NOT destructive)
  // -------------------------------------------------------------------------

  describe('Given an ok outcome only', () => {
    it('then renders the entry WITHOUT any "destructive" class in the entry container', () => {
      // Property 9 [lld §17.2b]: ok → normal styling, not destructive
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/adr/0014-api-routes.md', outcome: 'ok', bytes_returned: 512 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      const entryIndex = html.indexOf('docs/adr/0014-api-routes.md');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).not.toContain('destructive');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10 — not_found outcome neutral styling (NOT destructive)
  // -------------------------------------------------------------------------

  describe('Given a not_found outcome', () => {
    it('then renders that entry WITHOUT any "destructive" class in the entry container', () => {
      // Property 10 [lld §17.2b]: not_found → neutral styling; critically NOT destructive
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/missing.md', outcome: 'not_found', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      const entryIndex = html.indexOf('docs/missing.md');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).not.toContain('destructive');
    });
  });

  // -------------------------------------------------------------------------
  // Adversarial — error outcome neutral styling (NOT destructive)
  // AC-5 gap: `error` is a valid ToolCallOutcome variant; the LLD BDD spec did not enumerate
  // a dedicated styling test for it (spec gap), but AC-5 requires every variant to be covered.
  // -------------------------------------------------------------------------

  describe('Given an error outcome', () => {
    it('then renders that entry WITHOUT any "destructive" class in the entry container', () => {
      // `error` is not in WARNING_OUTCOMES; should render with normal styling, not warning colour.
      const calls: ToolCallLogEntry[] = [
        makeEntry({ argument_path: 'docs/design/v1-design.md', outcome: 'error', bytes_returned: 0 }),
      ];
      const html = render(makeProps({ rubric_tool_call_count: 1, rubric_tool_calls: calls }));
      const entryIndex = html.indexOf('docs/design/v1-design.md');
      expect(entryIndex).toBeGreaterThanOrEqual(0);
      const surrounding = html.slice(Math.max(0, entryIndex - 300), entryIndex + 300);
      expect(surrounding).not.toContain('destructive');
    });
  });
});
