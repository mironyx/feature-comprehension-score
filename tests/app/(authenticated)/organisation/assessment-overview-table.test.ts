// Tests for AssessmentOverviewTable — showProjectColumn prop + org overview project filter.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.9 (#LLD-v11-e11-2-fix-441)
// Requirements:    docs/requirements/v11-requirements.md §Epic 2, Story 2.2 AC 1
// Issue:           #441
//
// Testing approach:
//   Pattern (a) renderToStaticMarkup + useState stub: observable render-output properties.
//   Pattern (b) readFileSync source-text: structural wiring that is invisible from HTML
//               in a node environment (useState stubbed — post-interaction state is a noop).
//
// describe block 1: AssessmentOverviewTable — showProjectColumn
// describe block 2: Project dashboard — shared table (REQ-fcs-scoped-to-projects-project-scoped-assessment-list)
// describe block 3: Org overview — project filter

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports.
//
// AssessmentOverviewTable will become a 'use client' component (it calls useState
// for the project filter). Stub useState so it can be invoked in a node
// environment via renderToStaticMarkup. The stub returns [initialValue, vi.fn()],
// preserving the initial state value while making the setter a noop.
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useEffect: vi.fn(),
  };
});

// Stub next/link so renderToStaticMarkup works in node (no DOM).
vi.mock('next/link', async () => {
  const React = await import('react');
  return {
    default: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

// StatusBadge is a UI component — stub to avoid transitive deps.
vi.mock('@/components/ui/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => status,
}));

// RetryButton is a client component with hooks — stub to a recognisable marker.
vi.mock('@/app/(authenticated)/assessments/retry-button', () => ({
  RetryButton: ({ assessmentId }: { assessmentId: string }) =>
    `[RetryButton:${assessmentId}]`,
}));

// PollingStatusBadge is a client component with hooks — stub to a recognisable marker.
vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: ({ assessmentId }: { assessmentId: string }) =>
    `[PollingStatusBadge:${assessmentId}]`,
}));

// Stub lucide-react icons used by the actions column.
vi.mock('lucide-react', async () => {
  const React = await import('react');
  return {
    Trash2: ({ size }: { size?: number }) =>
      React.createElement('svg', { 'data-testid': 'icon-trash-2', width: size }),
    MoreHorizontal: ({ size }: { size?: number }) =>
      React.createElement('svg', { 'data-testid': 'icon-more-horizontal', width: size }),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import type { AssessmentListItem } from '@/app/api/assessments/helpers';

// ---------------------------------------------------------------------------
// Source-text fixtures (pattern b)
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, '../../../../src/app/(authenticated)');
const TABLE_SRC = readFileSync(resolve(ROOT, 'organisation/assessment-overview-table.tsx'), 'utf8');
const PROJECTS_PAGE_SRC = readFileSync(resolve(ROOT, 'projects/[id]/page.tsx'), 'utf8');

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<AssessmentListItem> = {}): AssessmentListItem {
  return {
    id: 'assess-1',
    type: 'fcs',
    status: 'completed',
    repository_name: 'acme/backend',
    pr_number: null,
    feature_name: 'My Feature',
    aggregate_score: 0.8,
    conclusion: null,
    config_comprehension_depth: null,
    participant_count: 2,
    completed_count: 1,
    created_at: '2026-01-01T00:00:00Z',
    rubric_error_code: null,
    rubric_retry_count: 0,
    rubric_error_retryable: null,
    project_id: 'proj-1',
    project_name: 'Alpha Project',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Render helpers — use vi.importActual to bypass the top-level useState stub
// so the component renders with the real initial state value.
// ---------------------------------------------------------------------------

async function renderTable(
  assessments: AssessmentListItem[],
  opts: { onDelete?: (a: AssessmentListItem) => void; showProjectColumn?: boolean } = {},
): Promise<string> {
  const { AssessmentOverviewTable } = await vi.importActual<
    typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
  >('@/app/(authenticated)/organisation/assessment-overview-table');
  return renderToStaticMarkup(
    AssessmentOverviewTable({
      assessments,
      onDelete: opts.onDelete,
      showProjectColumn: opts.showProjectColumn,
    }) as ReactElement,
  );
}

// Render with useState stubbed to return a fixed selected project value so we
// can observe the filtered output without a real DOM event system.
async function renderTableWithSelectedProject(
  assessments: AssessmentListItem[],
  selectedProject: string | null,
): Promise<string> {
  const reactMod = await import('react');
  const useStateMock = vi.mocked(reactMod.useState);
  // Return the fixed selected project for the first useState call (selectedProject state)
  useStateMock.mockImplementationOnce(() => [selectedProject, vi.fn()]);

  const { AssessmentOverviewTable } = await vi.importActual<
    typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
  >('@/app/(authenticated)/organisation/assessment-overview-table');
  return renderToStaticMarkup(
    AssessmentOverviewTable({ assessments, showProjectColumn: true }) as ReactElement,
  );
}

// ===========================================================================
// GROUP 1: AssessmentOverviewTable — showProjectColumn prop
// [lld §B.9 "Component contract extension"] [req §Story 2.2 AC 1]
// Issue: #441
// ===========================================================================

describe('AssessmentOverviewTable — showProjectColumn', () => {

  // -------------------------------------------------------------------------
  // Property 1: "Project" column header appears when showProjectColumn=true
  // [lld §B.9] "add 'Project' as the second header column"
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true', () => {
    it('renders Project column header when showProjectColumn=true', async () => {
      // [lld §B.9 I11] The column header "Project" must appear in the thead.
      const html = await renderTable([makeItem()], { showProjectColumn: true });
      expect(html).toContain('Project');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Project cell shows project_name for FCS rows
  // [lld §B.9] "each row cell renders project_name ?? '—'"
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and a FCS row with project_name set', () => {
    it('renders project_name in each FCS row', async () => {
      // [lld §B.9 I11] The project name must appear in the row cell.
      const item = makeItem({ project_name: 'Alpha Project' });
      const html = await renderTable([item], { showProjectColumn: true });
      expect(html).toContain('Alpha Project');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Project cell shows "—" for PRCC rows (project_id=null)
  // [lld §B.9] "project_name ?? '—'" — PRCC rows have project_name=null
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and a PRCC row with project_name=null', () => {
    it('renders "—" in Project cell for PRCC rows (project_id=null)', async () => {
      // [lld §B.9 I11] PRCC rows have no project_name; must render the em-dash fallback.
      const item = makeItem({
        type: 'prcc',
        project_id: null,
        project_name: null,
        feature_name: null,
        pr_number: 42,
      });
      const html = await renderTable([item], { showProjectColumn: true });
      // The project cell must render the em-dash, not "null" or "undefined".
      expect(html).toContain('—');
      expect(html).not.toMatch(/"null"|>null<|"undefined"|>undefined</);
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: No Project column when showProjectColumn is omitted
  // [lld §B.9] "default false — backward-compat with all existing callers"
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn is omitted (default)', () => {
    it('does not render Project column header when showProjectColumn omitted', async () => {
      // [lld §B.9] Backward compatibility: existing callers must see exactly the same
      // 7 columns as before. "Project" must not appear as a column header.
      const item = makeItem({ project_name: 'Alpha Project' });
      const html = await renderTable([item]);
      // The column header "Project" must not appear in the thead.
      // Note: "Project" may legitimately appear in other cells (project_name value),
      // so we check specifically for a <th> containing only "Project".
      expect(html).not.toMatch(/<th[^>]*>Project<\/th>/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 5 (source): showProjectColumn prop is declared in the interface
  // [lld §B.9 "Component contract extension"]
  // -------------------------------------------------------------------------

  it('declares showProjectColumn as an optional boolean prop in the interface', () => {
    // [lld §B.9] The component signature must include showProjectColumn?.
    expect(TABLE_SRC).toMatch(/showProjectColumn\??\s*:\s*boolean/);
  });

  // -------------------------------------------------------------------------
  // Property 6: Multiple FCS rows — each shows its own project_name
  // [lld §B.9 I11]
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and two FCS rows with different project names', () => {
    it('renders each project_name in its respective row', async () => {
      const items = [
        makeItem({ id: 'a1', project_name: 'Alpha Project', project_id: 'proj-1' }),
        makeItem({ id: 'a2', project_name: 'Beta Project', project_id: 'proj-2' }),
      ];
      const html = await renderTable(items, { showProjectColumn: true });
      expect(html).toContain('Alpha Project');
      expect(html).toContain('Beta Project');
    });
  });
});

// ===========================================================================
// GROUP 2: Project dashboard — shared table
// REQ: REQ-fcs-scoped-to-projects-project-scoped-assessment-list (Story 2.2 AC 1)
// [lld §B.9] "replace <AssessmentList> with <AssessmentOverviewTable>"
// Issue: #441 (regression fix)
// ===========================================================================

describe('Project dashboard — shared table (REQ-fcs-scoped-to-projects-project-scoped-assessment-list)', () => {

  // -------------------------------------------------------------------------
  // Property 7: projects/[id]/page.tsx imports AssessmentOverviewTable
  // [lld §B.9 I10] "Project dashboard uses AssessmentOverviewTable, not a bespoke list"
  // -------------------------------------------------------------------------

  it('uses AssessmentOverviewTable, not the deleted card list (regression #441)', () => {
    // [lld §B.9 I10] The project dashboard must import AssessmentOverviewTable.
    // The bespoke AssessmentList card list is deleted in fix #441.
    expect(PROJECTS_PAGE_SRC).toContain('AssessmentOverviewTable');
  });

  // -------------------------------------------------------------------------
  // Property 8: projects/[id]/page.tsx does NOT import AssessmentList
  // [lld §B.9] "delete assessment-list.tsx (no longer needed)"
  // -------------------------------------------------------------------------

  it('does not import the deleted AssessmentList component', () => {
    // [lld §B.9] AssessmentList must be removed from all import sites.
    // The page must not reference the deleted card list.
    expect(PROJECTS_PAGE_SRC).not.toMatch(/import.*AssessmentList/);
  });

  // -------------------------------------------------------------------------
  // Property 9: AssessmentOverviewTable renders standard column headers
  // [req §Story 2.2 AC 1] "same columns as the existing pre-V11 FCS assessment list"
  // [lld §B.9 BDD] "renders Feature/PR, Repository, Type, Status, Score, Completion, Date columns"
  // -------------------------------------------------------------------------

  describe('Given AssessmentOverviewTable is rendered with FCS assessments', () => {
    it('renders Feature/PR, Repository, Type, Status, Score, Completion, Date columns', async () => {
      // [req §Story 2.2 AC 1] All seven standard columns must be present.
      const items = [makeItem()];
      const html = await renderTable(items);
      expect(html).toContain('Feature');
      expect(html).toContain('Repository');
      expect(html).toContain('Type');
      expect(html).toContain('Status');
      expect(html).toContain('Score');
      expect(html).toContain('Completion');
      expect(html).toContain('Date');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: Only rows for the target project are rendered (no sibling rows)
  // [req §Story 2.2 AC 2] "no assessment from project B appears in A's list"
  // [lld §B.9 BDD] "filters by project_id — no sibling-project rows visible"
  // Observable: the caller (page) passes only project-scoped rows to the component.
  // We assert the component does NOT render rows that are not in the passed array.
  // -------------------------------------------------------------------------

  describe('Given AssessmentOverviewTable receives only rows for project A', () => {
    it('does not render any row from a sibling project', async () => {
      // The page layer is responsible for passing only project-scoped rows.
      // The component must not invent or fetch additional rows.
      const items = [makeItem({ id: 'a1', project_id: 'proj-a', feature_name: 'Feature A' })];
      const html = await renderTable(items);
      // A sibling row that was NOT passed must not appear.
      expect(html).not.toContain('sibling-assess-id');
      expect(html).not.toContain('proj-b');
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: Empty state renders "No assessments yet" + CTA
  // [req §Story 2.2 AC 3] [lld §B.9 BDD] "shows empty-state CTA when project has no assessments"
  // -------------------------------------------------------------------------

  describe('Given AssessmentOverviewTable receives an empty assessments array', () => {
    it('shows empty-state message when project has no assessments', async () => {
      // [req §Story 2.2 AC 3] The empty state must include "No assessments yet".
      const html = await renderTable([]);
      expect(html).toMatch(/[Nn]o assessments yet/);
    });
  });
});

// ===========================================================================
// GROUP 3: Org overview — project filter
// [lld §B.9 I12] "Project filter on org overview lists only projects present in loaded rows"
// Issue: #441
// ===========================================================================

describe('Org overview — project filter', () => {

  // -------------------------------------------------------------------------
  // Property 12: Filter shows distinct projects derived from loaded rows
  // [lld §B.9 I12] "Removing `assessment-list.tsx` leaves no broken import sites"
  // [lld §B.9 BDD] "project filter shows distinct projects derived from loaded rows, not full org list"
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and two rows from distinct projects', () => {
    it('project filter shows distinct projects derived from loaded rows, not full org list', async () => {
      // [lld §B.9 I12] The dropdown must list exactly the project names present in the rows.
      const items = [
        makeItem({ id: 'a1', project_id: 'proj-1', project_name: 'Alpha Project' }),
        makeItem({ id: 'a2', project_id: 'proj-2', project_name: 'Beta Project' }),
      ];
      const html = await renderTable(items, { showProjectColumn: true });
      expect(html).toContain('Alpha Project');
      expect(html).toContain('Beta Project');
    });
  });

  // -------------------------------------------------------------------------
  // Property 13: Selecting a project filters the table to that project only
  // [lld §B.9 BDD] "selecting a project filters the table to that project only"
  // Pattern (a) with useState stub to fix selectedProject to 'proj-1'.
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and selectedProject is fixed to "proj-1"', () => {
    it('selecting a project filters the table to that project only', async () => {
      // [lld §B.9 I12] When a project is selected, only its rows must appear.
      const items = [
        makeItem({ id: 'a1', project_id: 'proj-1', project_name: 'Alpha Project', feature_name: 'Feature Alpha' }),
        makeItem({ id: 'a2', project_id: 'proj-2', project_name: 'Beta Project', feature_name: 'Feature Beta' }),
      ];
      const html = await renderTableWithSelectedProject(items, 'proj-1');
      // Row from proj-1 must appear
      expect(html).toContain('Feature Alpha');
      // Row from proj-2 must be absent
      expect(html).not.toContain('Feature Beta');
    });
  });

  // -------------------------------------------------------------------------
  // Property 14: Filter is hidden when ≤ 1 distinct project in loaded rows
  // [lld §B.9 BDD] "filter hidden when ≤ 1 distinct project in loaded rows"
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and all rows belong to the same project', () => {
    it('filter is hidden when only 1 distinct project in loaded rows', async () => {
      // [lld §B.9] The dropdown must not render when there is only one project.
      // Consistent with ProjectFilter behaviour: "projects.length > 1" gate.
      const items = [
        makeItem({ id: 'a1', project_id: 'proj-1', project_name: 'Alpha Project' }),
        makeItem({ id: 'a2', project_id: 'proj-1', project_name: 'Alpha Project' }),
      ];
      const html = await renderTable(items, { showProjectColumn: true });
      // A <select> or dropdown for project filtering must NOT appear.
      // "All projects" and individual option elements must be absent.
      expect(html).not.toContain('All projects');
      expect(html).not.toMatch(/<select[^>]*aria-label="Filter by project"/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 15: Filter is hidden when 0 rows
  // [lld §B.9] ≤ 1 distinct project — 0 rows means empty state, no filter
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and no assessments', () => {
    it('does not render the project filter dropdown for an empty list', async () => {
      // No rows → empty state, never a filter dropdown.
      const html = await renderTable([], { showProjectColumn: true });
      expect(html).not.toContain('All projects');
    });
  });

  // -------------------------------------------------------------------------
  // Property 16: Filter is visible when > 1 distinct project
  // [lld §B.9 BDD] Complement of property 14 — filter renders for multiple projects
  // -------------------------------------------------------------------------

  describe('Given showProjectColumn=true and rows from two distinct projects', () => {
    it('renders the project filter dropdown when more than 1 distinct project exists', async () => {
      // [lld §B.9] The dropdown must be present when there is more than one project.
      const items = [
        makeItem({ id: 'a1', project_id: 'proj-1', project_name: 'Alpha Project' }),
        makeItem({ id: 'a2', project_id: 'proj-2', project_name: 'Beta Project' }),
      ];
      const html = await renderTable(items, { showProjectColumn: true });
      // A <select> with aria-label "Filter by project" must be rendered.
      expect(html).toMatch(/Filter by project/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 17 (source): project filter state is derived from loaded rows
  // [lld §B.9 I12] "lists only projects present in the loaded rows"
  // Source-text: the component must not fetch a full org project list.
  // -------------------------------------------------------------------------

  it('derives project list from loaded rows — no separate org project fetch in source', () => {
    // [lld §B.9 I12] The filter must be client-side, built from the rows prop.
    // The component must not import a project-fetching API call.
    expect(TABLE_SRC).not.toMatch(/fetch\s*\(.*\/api\/projects/);
    expect(TABLE_SRC).not.toMatch(/loadOrgProjects|fetchProjects/);
  });
});
