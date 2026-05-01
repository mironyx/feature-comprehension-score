// Tests for /assessments page rewrite — My Pending Assessments (FCS-only, cross-project).
// Issue: #415
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.6
// Requirements: docs/requirements/v11-requirements.md §Story 2.3, §Story 2.3a
//
// Covers all 9 BDD specs from issue #415 plus query-shape verification and
// ProjectFilter component behaviour tests.
//
// Testing approach:
//   - Page (server component): vi.mock + JSON.stringify(result) inspection.
//   - ProjectFilter (client component): renderToStaticMarkup with useState stubbed
//     to control initial state (same pattern as retry-button.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    JSON.stringify({ link: href, children }),
}));

// Stub useState so client components (ProjectFilter) can be rendered with
// renderToStaticMarkup in node tests. All other React APIs remain real.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn((initial: unknown) => [initial, vi.fn()]) };
});

vi.mock('@/components/ui/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => title,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: unknown }) => children,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-participant-001';
const PROJECT_A_ID = 'proj-aaa-0001';
const PROJECT_A_NAME = 'Alpha Project';
const PROJECT_B_ID = 'proj-bbb-0002';
const PROJECT_B_NAME = 'Beta Project';

// ---------------------------------------------------------------------------
// Shape of a raw row returned by the assessment_participants query
// ---------------------------------------------------------------------------

interface ParticipantRow {
  assessments: {
    id: string;
    status: string;
    feature_name: string | null;
    feature_description: string | null;
    rubric_error_code: string | null;
    rubric_retry_count: number;
    rubric_error_retryable: boolean | null;
    project_id: string;
    projects: { id: string; name: string };
  };
}

function makeRow(overrides: Partial<ParticipantRow['assessments']> = {}): ParticipantRow {
  return {
    assessments: {
      id: 'aid-0001',
      status: 'awaiting_responses',
      feature_name: 'My Feature',
      feature_description: null,
      rubric_error_code: null,
      rubric_retry_count: 0,
      rubric_error_retryable: null,
      project_id: PROJECT_A_ID,
      projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME },
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase client builder
//
// Models the new pending-queue query chain:
//   .from('assessment_participants')
//   .select(`assessments!inner(...)`)
//   .eq('user_id', user.id)
//   .eq('status', 'pending')
//   .eq('assessments.type', 'fcs')
//   .order('created_at', { foreignTable: 'assessments', ascending: false })
//
// captureSelect      — receives the select column string
// captureEqCalls     — accumulates [column, value] pairs from every .eq() call
// captureFromTables  — accumulates table names from every .from() call
// captureOrderArgs   — receives [column, options] from .order()
// ---------------------------------------------------------------------------

function makeClient({
  rows = [] as ParticipantRow[],
  captureSelect,
  captureEqCalls,
  captureFromTables,
  captureOrderArgs,
}: {
  rows?: ParticipantRow[];
  captureSelect?: (cols: string) => void;
  captureEqCalls?: Array<[string, unknown]>;
  captureFromTables?: string[];
  captureOrderArgs?: (col: string, opts: Record<string, unknown>) => void;
} = {}) {
  const mockOrder = vi.fn().mockImplementation(
    (col: string, opts?: Record<string, unknown>) => {
      captureOrderArgs?.(col, opts ?? {});
      return Promise.resolve({ data: rows, error: null });
    },
  );

  function makeEqChain(): {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } {
    const chain: { eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } = {
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        captureEqCalls?.push([col, val]);
        return makeEqChain();
      }),
      order: mockOrder,
    };
    return chain;
  }

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      captureFromTables?.push(table);
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          captureSelect?.(cols);
          return makeEqChain();
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Helper — invoke the page with a standard setup
// ---------------------------------------------------------------------------

async function renderPage(
  rows: ParticipantRow[] = [],
  opts: {
    captureSelect?: (cols: string) => void;
    captureEqCalls?: Array<[string, unknown]>;
    captureFromTables?: string[];
    captureOrderArgs?: (col: string, opts: Record<string, unknown>) => void;
  } = {},
): Promise<string> {
  const client = makeClient({ rows, ...opts });
  mockCreateServer.mockResolvedValue(client as never);
  const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// Tests — /assessments page (server component)
// ---------------------------------------------------------------------------

describe('/assessments — My Pending Assessments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  // -------------------------------------------------------------------------
  // Auth / redirect guards
  // -------------------------------------------------------------------------

  describe('Given no org is selected', () => {
    it('When page loads, Then redirects to /org-select', async () => {
      mockGetOrgId.mockReturnValue(null);
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        AssessmentsPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow('NEXT_REDIRECT:/org-select');
    });
  });

  describe('Given no authenticated user', () => {
    it('When page loads, Then redirects to /auth/sign-in', async () => {
      const client = makeClient();
      (client.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { user: null },
      });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        AssessmentsPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
    });
  });

  // -------------------------------------------------------------------------
  // Query shape — correct table and columns [lld §B.6, issue #415]
  // -------------------------------------------------------------------------

  describe('Given the pending-queue query', () => {
    it('queries the assessment_participants table (not assessments)', async () => {
      const captureFromTables: string[] = [];
      await renderPage([], { captureFromTables });
      expect(captureFromTables).toContain('assessment_participants');
      expect(captureFromTables).not.toContain('assessments');
    });

    it('select string includes assessments!inner join', async () => {
      let capturedSelect = '';
      await renderPage([], { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('assessments!inner');
    });

    it('select string includes projects!inner join inside the assessments join', async () => {
      let capturedSelect = '';
      await renderPage([], { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('projects!inner');
    });

    it('select string includes feature_name', async () => {
      let capturedSelect = '';
      await renderPage([], { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('feature_name');
    });

    it('select string includes feature_description', async () => {
      let capturedSelect = '';
      await renderPage([], { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('feature_description');
    });

    it('select string includes project_id', async () => {
      let capturedSelect = '';
      await renderPage([], { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('project_id');
    });

    // Regression #415: participant user_id filter restricts to current user [lld §B.6]
    it('applies eq("user_id", currentUser.id) to restrict to the current participant [issue #415]', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], { captureEqCalls: eqCalls });
      const match = eqCalls.find(([col, val]) => col === 'user_id' && val === USER_ID);
      expect(match).toBeDefined();
    });

    // Regression #415: org_id filter scopes to current org — prevents cross-org data leak
    it('applies eq("org_id", orgId) to scope results to the selected org [issue #415]', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], { captureEqCalls: eqCalls });
      const match = eqCalls.find(([col, val]) => col === 'org_id' && val === ORG_ID);
      expect(match).toBeDefined();
    });

    // Regression #415: only pending participant rows — excludes already-submitted [req §2.3]
    it('applies eq("status", "pending") to exclude submitted participant rows [issue #415]', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], { captureEqCalls: eqCalls });
      const match = eqCalls.find(([col, val]) => col === 'status' && val === 'pending');
      expect(match).toBeDefined();
    });

    // Regression #415: PRCC rows excluded via type predicate [req §2.3, lld I6]
    it('applies eq("assessments.type", "fcs") to exclude PRCC assessments [issue #415]', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], { captureEqCalls: eqCalls });
      const match = eqCalls.find(([col, val]) => col === 'assessments.type' && val === 'fcs');
      expect(match).toBeDefined();
    });

    it('orders by created_at with foreignTable: "assessments" and ascending: false [lld §B.6]', async () => {
      let capturedCol = '';
      let capturedOpts: Record<string, unknown> = {};
      await renderPage([], {
        captureOrderArgs: (col, opts) => {
          capturedCol = col;
          capturedOpts = opts;
        },
      });
      expect(capturedCol).toBe('created_at');
      expect(capturedOpts).toMatchObject({ foreignTable: 'assessments', ascending: false });
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 1: lists pending FCS assessments for current user
  // -------------------------------------------------------------------------

  describe('Given a participant has pending FCS assessments', () => {
    it('When page loads, Then lists the pending FCS assessments', async () => {
      const rendered = await renderPage([makeRow({ feature_name: 'Auth Redesign' })]);
      expect(rendered).toContain('Auth Redesign');
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 2: each item labelled with project name
  // -------------------------------------------------------------------------

  describe('Given pending assessments from different projects', () => {
    it('When page renders, Then each item is labelled with its project name', async () => {
      const rendered = await renderPage([
        makeRow({ projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
      ]);
      expect(rendered).toContain(PROJECT_A_NAME);
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.4 / Story 2.3 — BDD spec 3: each item links to project-first URL
  // -------------------------------------------------------------------------

  describe('Given a pending assessment with a known project_id', () => {
    it('When page renders, Then item links to /projects/[pid]/assessments/[aid]', async () => {
      const rendered = await renderPage([
        makeRow({
          id: 'aid-xyz',
          project_id: PROJECT_A_ID,
          projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME },
        }),
      ]);
      expect(rendered).toContain(`/projects/${PROJECT_A_ID}/assessments/aid-xyz`);
    });

    it('link URL is derived from the row project_id, not from a separate lookup', async () => {
      const rendered = await renderPage([
        makeRow({
          id: 'aid-check',
          project_id: PROJECT_B_ID,
          projects: { id: PROJECT_B_ID, name: PROJECT_B_NAME },
        }),
      ]);
      expect(rendered).toContain(`/projects/${PROJECT_B_ID}/assessments/aid-check`);
      expect(rendered).not.toContain(`/projects/${PROJECT_A_ID}/assessments/aid-check`);
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 4: excludes PRCC assessments
  // -------------------------------------------------------------------------

  describe('Given the assessments.type = fcs query predicate', () => {
    it('When page loads, Then the query excludes PRCC rows via the type predicate', async () => {
      // Verified by captureEqCalls test above.
      // Supplementary: if the predicate were absent, a row with type='prcc' would
      // reach the page. The empty result confirms the predicate fired.
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], { captureEqCalls: eqCalls });
      const fcsFilter = eqCalls.find(([col, val]) => col === 'assessments.type' && val === 'fcs');
      expect(fcsFilter).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 5: excludes assessments where user has already submitted
  // -------------------------------------------------------------------------

  describe('Given a participant who has already submitted', () => {
    it('When page reloads, Then submitted assessments do not appear (participant status moves to submitted)', async () => {
      // After submission the participant row has status = 'submitted'.
      // The .eq('status', 'pending') predicate returns zero rows for that user.
      const eqCalls: Array<[string, unknown]> = [];
      const rendered = await renderPage([], { captureEqCalls: eqCalls });
      // The pending filter must be applied
      expect(eqCalls.find(([col, val]) => col === 'status' && val === 'pending')).toBeDefined();
      // With no rows returned, empty state is shown
      expect(rendered).toContain('No pending assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3a — BDD spec 6: filter offers All projects + distinct projects
  // -------------------------------------------------------------------------

  describe('Given a participant has pending assessments across multiple projects', () => {
    it('When page renders, Then ProjectFilter receives exactly the distinct projects from the queue', async () => {
      const rows = [
        makeRow({ id: 'a1', project_id: PROJECT_A_ID, projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
        makeRow({ id: 'a2', project_id: PROJECT_B_ID, projects: { id: PROJECT_B_ID, name: PROJECT_B_NAME } }),
        makeRow({ id: 'a3', project_id: PROJECT_A_ID, projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
      ];
      const rendered = await renderPage(rows);
      // Parse the stubbed ProjectFilter output to inspect the projects prop
      const filterMatch = rendered.match(/"projectFilterProjects":(\[.*?\])/);
      expect(filterMatch).not.toBeNull();
      const filterProjects = JSON.parse(filterMatch![1]) as Array<{ id: string; name: string }>;
      // Exactly two distinct projects — not the full org list [lld I7, req §2.3a]
      expect(filterProjects).toHaveLength(2);
      const ids = filterProjects.map((p) => p.id).sort();
      expect(ids).toEqual([PROJECT_A_ID, PROJECT_B_ID].sort());
    });

    it('When page renders, Then project filter list does not include projects absent from the queue', async () => {
      // PROJECT_B has no pending rows — must not appear in the filter
      const rows = [
        makeRow({ id: 'only-a', project_id: PROJECT_A_ID, projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
      ];
      const rendered = await renderPage(rows);
      expect(rendered).not.toContain(PROJECT_B_ID);
      expect(rendered).not.toContain(PROJECT_B_NAME);
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3a — BDD spec 7: filter hidden when ≤ 1 project
  // -------------------------------------------------------------------------

  describe('Given a participant has pending assessments in only one project', () => {
    it('When page renders, Then ProjectFilter receives only one project (so it can hide itself)', async () => {
      const rows = [
        makeRow({ id: 'single-1', project_id: PROJECT_A_ID, projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
        makeRow({ id: 'single-2', project_id: PROJECT_A_ID, projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME } }),
      ];
      const rendered = await renderPage(rows);
      const filterMatch = rendered.match(/"projectFilterProjects":(\[.*?\])/);
      expect(filterMatch).not.toBeNull();
      const filterProjects = JSON.parse(filterMatch![1]) as Array<{ id: string; name: string }>;
      expect(filterProjects).toHaveLength(1);
      expect(filterProjects[0].id).toBe(PROJECT_A_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 8: selecting a project (delegated to ProjectFilter component)
  // — tested in the ProjectFilter describe block below
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Story 2.3 — BDD spec 9: empty state when no pending assessments
  // -------------------------------------------------------------------------

  describe('Given a participant has no pending assessments', () => {
    it('When page loads, Then shows an empty state message', async () => {
      const rendered = await renderPage([]);
      expect(rendered).toContain('No pending assessments');
    });
  });

  // -------------------------------------------------------------------------
  // V11 invariant: no "Completed" section [lld §B.6 "Removed in this rewrite"]
  // -------------------------------------------------------------------------

  describe('Given the V11 rewrite removes the Completed tab', () => {
    it('When page renders, Then no "Completed" section heading appears', async () => {
      const rendered = await renderPage([makeRow()]);
      // The previous page had a <h2>Completed</h2>. The new page must not.
      expect(rendered).not.toMatch(/"Completed"/);
    });
  });

  // -------------------------------------------------------------------------
  // Data passing: full items list goes to ProjectFilter
  // -------------------------------------------------------------------------

  describe('Given pending rows exist', () => {
    it('When page renders, Then all pending items are passed to ProjectFilter as the items prop', async () => {
      const rows = [
        makeRow({ id: 'pass-1', feature_name: 'Feature X' }),
        makeRow({ id: 'pass-2', feature_name: 'Feature Y' }),
      ];
      const rendered = await renderPage(rows);
      expect(rendered).toContain('"projectFilterItems"');
      expect(rendered).toContain('Feature X');
      expect(rendered).toContain('Feature Y');
    });
  });
});

// ---------------------------------------------------------------------------
// ProjectFilter component — behaviour tests
// ---------------------------------------------------------------------------
//
// Testing approach: renderToStaticMarkup with useState stubbed to control
// initial state (same pattern as retry-button.test.ts). Because useState is
// stubbed to [initialValue, noop], we can drive the "project X selected" branch
// by providing the relevant project id as the initial state.
// ---------------------------------------------------------------------------

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { ProjectAssessmentItem } from '@/app/(authenticated)/assessments/project-filter';

// ---------------------------------------------------------------------------
// Factories for ProjectFilter items
// ---------------------------------------------------------------------------

function makePendingItem(
  assessmentId: string,
  projectId: string,
  projectName: string,
  featureName = 'A Feature',
): ProjectAssessmentItem {
  return {
    assessments: {
      id: assessmentId,
      status: 'awaiting_responses',
      feature_name: featureName,
      feature_description: null,
      rubric_error_code: null,
      rubric_retry_count: 0,
      rubric_error_retryable: null,
      project_id: projectId,
      projects: { id: projectId, name: projectName },
    },
  };
}

const itemsA: ProjectAssessmentItem[] = [
  makePendingItem('aid-001', PROJECT_A_ID, PROJECT_A_NAME, 'Feature One'),
  makePendingItem('aid-002', PROJECT_A_ID, PROJECT_A_NAME, 'Feature Two'),
];
const itemsB: ProjectAssessmentItem[] = [
  makePendingItem('aid-003', PROJECT_B_ID, PROJECT_B_NAME, 'Feature Three'),
];
const allItems: ProjectAssessmentItem[] = [...itemsA, ...itemsB];
const twoProjects = [
  { id: PROJECT_A_ID, name: PROJECT_A_NAME },
  { id: PROJECT_B_ID, name: PROJECT_B_NAME },
];

describe('ProjectFilter component', () => {
  describe('Given more than one distinct project (filter is visible)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('When filter initialises, Then "All projects" option is present in the select', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      // useState stub returns [initial, noop] — initial is 'all'
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain('All projects');
    });

    it('When filter initialises, Then each project name appears as a select option', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain(PROJECT_A_NAME);
      expect(html).toContain(PROJECT_B_NAME);
    });

    it('When "All projects" is selected (default), Then all items are shown', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain('Feature One');
      expect(html).toContain('Feature Two');
      expect(html).toContain('Feature Three');
    });

    it('When a project filter is active (PROJECT_A_ID), Then only Project A items are shown', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      // Override useState to return PROJECT_A_ID as the selected filter value
      const reactModule = await import('react');
      vi.spyOn(reactModule, 'useState').mockImplementationOnce(
        () => [PROJECT_A_ID, vi.fn()] as never,
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain('Feature One');
      expect(html).toContain('Feature Two');
      expect(html).not.toContain('Feature Three');
    });

    it('When a project filter is active (PROJECT_B_ID), Then only Project B items are shown', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const reactModule = await import('react');
      vi.spyOn(reactModule, 'useState').mockImplementationOnce(
        () => [PROJECT_B_ID, vi.fn()] as never,
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).not.toContain('Feature One');
      expect(html).not.toContain('Feature Two');
      expect(html).toContain('Feature Three');
    });
  });

  describe('Given only one distinct project (filter is hidden)', () => {
    it('When page renders, Then the filter select control is not rendered [req §2.3a]', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const singleProject = [{ id: PROJECT_A_ID, name: PROJECT_A_NAME }];
      const html = renderToStaticMarkup(
        ProjectFilter({ items: itemsA, projects: singleProject }) as ReactElement,
      );
      // No <select> or combobox role — filter must be absent when ≤ 1 project
      expect(html).not.toContain('<select');
    });

    it('When page renders, Then the assessment items are still displayed', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const singleProject = [{ id: PROJECT_A_ID, name: PROJECT_A_NAME }];
      const html = renderToStaticMarkup(
        ProjectFilter({ items: itemsA, projects: singleProject }) as ReactElement,
      );
      expect(html).toContain('Feature One');
      expect(html).toContain('Feature Two');
    });
  });

  describe('Given zero items and zero projects', () => {
    it('When page renders, Then no filter control and no assessment items are rendered', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: [], projects: [] }) as ReactElement,
      );
      expect(html).not.toContain('<select');
      // No feature names in output
      expect(html).not.toContain('Feature');
    });
  });

  describe('Given items with project name labels and project-first links', () => {
    it('Each item renders its project name as a visible label', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain(PROJECT_A_NAME);
      expect(html).toContain(PROJECT_B_NAME);
    });

    it('Each item provides a link to /projects/[pid]/assessments/[aid] [req §2.3, §2.4]', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const html = renderToStaticMarkup(
        ProjectFilter({ items: allItems, projects: twoProjects }) as ReactElement,
      );
      expect(html).toContain(`/projects/${PROJECT_A_ID}/assessments/aid-001`);
      expect(html).toContain(`/projects/${PROJECT_B_ID}/assessments/aid-003`);
    });
  });
});
