// Adversarial tests for #441 — project column + filter + project dashboard reuse.
// Covers two genuine gaps not addressed by the feature test files:
//
//   Gap 1 — AC-3 (project dashboard empty state CTA): dashboard-page.test.ts mock
//   client only supports the `projects` table query chain and does not stub the
//   new `assessments` query chain added by loadProjectAssessments in #441.
//   Tests that require the page to actually render (not throw) are therefore
//   currently broken in the pre-existing file. This eval file provides a correctly
//   wired mock so the empty-state CTA property is verified.
//
//   Gap 2 — toListItem project_name mapping: no existing test verifies that
//   toListItem correctly maps `row.projects?.name ?? null` into `project_name`.
//   In particular, the PRCC case (projects = null → project_name = null) and
//   the FCS case (projects = { name: 'Alpha' } → project_name = 'Alpha') are
//   both untested at the unit level.
//
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.9
// Requirements:    docs/requirements/v11-requirements.md §Story 2.2 AC 3
// Issue:           #441

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Gap 1 — Project dashboard empty-state CTA
// AC-3: "Project dashboard empty state shows 'No assessments yet' +
//        'Create the first assessment' CTA"
//
// The project dashboard page (page.tsx) has its own inline empty-state block
// when assessments.length === 0 — this is separate from the AssessmentOverviewTable
// component's own empty state. The component's empty state is tested in
// assessment-overview-table.test.ts. The PAGE-LEVEL empty state (with the CTA
// Link to /projects/[id]/assessments/new) is not covered anywhere.
//
// Module mocks precede all imports per vitest hoisting rules.
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('@/lib/supabase/membership', () => ({
  getOrgRole: vi.fn(),
}));

vi.mock('@/app/api/assessments/helpers', () => ({
  fetchParticipantCounts: vi.fn().mockResolvedValue({}),
  toListItem: vi.fn().mockReturnValue({}),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    ({ type: 'a', props: { href, children } }),
}));

vi.mock('@/app/(authenticated)/projects/[id]/inline-edit-header', () => ({
  InlineEditHeader: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/delete-button', () => ({
  DeleteButton: () => null,
}));

vi.mock('@/components/ui/page-header', () => ({
  PageHeader: ({ title }: { title: string }) =>
    ({ type: 'div', props: { 'data-title': title } }),
}));

vi.mock('@/components/set-breadcrumbs', () => ({
  SetBreadcrumbs: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/track-last-visited', () => ({
  TrackLastVisitedProject: () => null,
}));

// AssessmentOverviewTable is a 'use client' component with useState.
// Stub it so the server component (page.tsx) can render in a node test.
vi.mock('@/app/(authenticated)/organisation/assessment-overview-table', () => ({
  AssessmentOverviewTable: ({ assessments }: { assessments: unknown[] }) =>
    ({ type: 'div', props: { 'data-testid': 'assessment-overview-table', assessments } }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockCookies = vi.mocked(cookies);
const mockGetOrgRole = vi.mocked(getOrgRole);

const ORG_ID = 'org-001';
const PROJECT_ID = 'project-abc';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  name: 'Payment Service',
  description: 'Handles all payment flows',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

/**
 * Builds a mock Supabase client that handles both queries the page now makes:
 *   1. projects table — .select().eq().eq().maybeSingle()
 *   2. assessments table — .select().eq().eq().order()
 *
 * The assessments chain was missing from dashboard-page.test.ts makeClient,
 * causing TypeError on every test that reaches loadProjectAssessments.
 */
function makeClient({
  project = MOCK_PROJECT as typeof MOCK_PROJECT | null,
  assessmentRows = [] as unknown[],
}: {
  project?: typeof MOCK_PROJECT | null;
  assessmentRows?: unknown[];
} = {}) {
  const assessmentsChain = {
    order: vi.fn().mockResolvedValue({ data: assessmentRows, error: null }),
  };
  const assessmentsEq2 = { eq: vi.fn().mockReturnValue(assessmentsChain) };
  const assessmentsEq1 = { eq: vi.fn().mockReturnValue(assessmentsEq2) };
  const assessmentsSelect = { select: vi.fn().mockReturnValue(assessmentsEq1) };

  const projectsMaybeSingle = { maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }) };
  const projectsEq2 = { eq: vi.fn().mockReturnValue(projectsMaybeSingle) };
  const projectsEq1 = { eq: vi.fn().mockReturnValue(projectsEq2) };
  const projectsSelect = { select: vi.fn().mockReturnValue(projectsEq1) };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-001' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'assessments') return assessmentsSelect;
      return projectsSelect;
    }),
  };
}

describe('Project dashboard — empty-state CTA (AC-3, #441)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // AC-3: "Project dashboard empty state shows 'No assessments yet' +
  //        'Create the first assessment' CTA"
  // [issue #441 AC-3] [req §Story 2.2 AC 3] [lld §B.9 BDD]
  //
  // The page.tsx renders its own empty-state block (not the component empty state)
  // when assessments.length === 0, including a Link to /projects/[id]/assessments/new.
  // -------------------------------------------------------------------------

  describe('Given a project with no assessments', () => {
    it('renders "No assessments yet" text in the page output', async () => {
      // [issue #441 AC-3] Page-level empty state must include "No assessments yet."
      const client = makeClient({ assessmentRows: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const { default: ProjectDashboardPage } = await import(
        '@/app/(authenticated)/projects/[id]/page'
      );

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      expect(JSON.stringify(result)).toContain('No assessments yet');
    });

    it('renders a "Create the first assessment" CTA link in the page empty state', async () => {
      // [issue #441 AC-3] The CTA must be a link to /projects/[id]/assessments/new.
      // This is the page's own inline empty state (separate from the component's).
      const client = makeClient({ assessmentRows: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const { default: ProjectDashboardPage } = await import(
        '@/app/(authenticated)/projects/[id]/page'
      );

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);
      // CTA link must point to the new-assessment route within this project.
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/new`);
      // CTA text must reference "Create the first assessment" (verbatim or close).
      expect(rendered).toMatch(/[Cc]reate the first assessment/);
    });

    it('does NOT render AssessmentOverviewTable when the project has no assessments', async () => {
      // [lld §B.9] The page conditionally renders the table only when assessments.length > 0.
      // The empty-state and the table are mutually exclusive branches.
      const client = makeClient({ assessmentRows: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const { default: ProjectDashboardPage } = await import(
        '@/app/(authenticated)/projects/[id]/page'
      );

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      // The stubbed AssessmentOverviewTable carries data-testid="assessment-overview-table".
      // It must NOT appear when there are no assessments.
      expect(JSON.stringify(result)).not.toContain('assessment-overview-table');
    });
  });

  describe('Given a project with assessments', () => {
    it('does NOT render the empty-state "Create the first assessment" CTA block when rows exist', async () => {
      // [lld §B.9] When rows exist, the component is rendered — not the empty state.
      // The "New Assessment" button in the header is always present; the empty-state
      // "Create the first assessment" CTA appears ONLY when assessments.length === 0.
      const client = makeClient({
        assessmentRows: [{ id: 'assess-1', type: 'fcs', status: 'completed',
          pr_number: null, feature_name: 'My Feature', aggregate_score: 0.8,
          conclusion: null, config_comprehension_depth: null, created_at: '2026-01-01T00:00:00Z',
          rubric_error_code: null, rubric_retry_count: 0, rubric_error_retryable: null,
          project_id: PROJECT_ID, repositories: { github_repo_name: 'acme/backend' },
          projects: { name: 'Payment Service' } }],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const { default: ProjectDashboardPage } = await import(
        '@/app/(authenticated)/projects/[id]/page'
      );

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);
      // The empty-state text must NOT appear when rows exist.
      // Note: "No assessments yet" only renders in the empty-state branch.
      expect(rendered).not.toContain('No assessments yet');
      // The "Create the first assessment" CTA is only in the empty-state branch.
      expect(rendered).not.toMatch(/[Cc]reate the first assessment/);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — toListItem project_name mapping
// [lld §B.9 "Data type extension"] toListItem maps row.projects?.name ?? null
// into project_name. No existing test exercises this mapping directly.
// ---------------------------------------------------------------------------

describe('toListItem — project_name field mapping (#441)', () => {
  // Import toListItem directly; it is pure (no I/O).
  // The @/app/api/assessments/helpers mock at the top of this file was declared
  // for the dashboard tests — we need the real implementation here.
  // We use a separate describe so the mock scope does not interfere.
  // vi.importActual bypasses the module-level mock.

  function makeMinimalRow(overrides: {
    projects?: { name: string } | null;
    project_id?: string | null;
  }) {
    return {
      id: 'assess-1',
      type: 'fcs' as const,
      status: 'completed' as const,
      repositories: { github_repo_name: 'acme/backend' },
      pr_number: null,
      feature_name: 'My Feature',
      aggregate_score: 0.8,
      conclusion: null,
      config_comprehension_depth: null,
      created_at: '2026-01-01T00:00:00Z',
      rubric_error_code: null,
      rubric_retry_count: 0,
      rubric_error_retryable: null,
      project_id: overrides.project_id ?? null,
      projects: overrides.projects,
    };
  }

  it('maps projects.name to project_name for FCS rows', async () => {
    // [lld §B.9] FCS rows have a projects join; project_name must be the joined name.
    const { toListItem } = await vi.importActual<
      typeof import('@/app/api/assessments/helpers')
    >('@/app/api/assessments/helpers');

    const row = makeMinimalRow({ projects: { name: 'Alpha Project' }, project_id: 'proj-1' });
    const item = toListItem(row, {});

    expect(item.project_name).toBe('Alpha Project');
  });

  it('maps project_name to null for PRCC rows (projects=null)', async () => {
    // [lld §B.9 "null for PRCC rows"] PRCC rows have no project; LEFT JOIN returns null.
    const { toListItem } = await vi.importActual<
      typeof import('@/app/api/assessments/helpers')
    >('@/app/api/assessments/helpers');

    const row = makeMinimalRow({ projects: null, project_id: null });
    const item = toListItem(row, {});

    expect(item.project_name).toBeNull();
  });

  it('maps project_name to null when projects is undefined (missing join result)', async () => {
    // Defensive: if the SELECT omits projects for some reason, project_name must
    // still be null rather than throwing or producing undefined.
    const { toListItem } = await vi.importActual<
      typeof import('@/app/api/assessments/helpers')
    >('@/app/api/assessments/helpers');

    const row = makeMinimalRow({ projects: undefined, project_id: null });
    const item = toListItem(row, {});

    expect(item.project_name).toBeNull();
  });
});
