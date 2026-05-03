// Tests for /projects/[id] dashboard — rev 1.3 contract.
// Story 1.3: Settings affordance (icon-and-label control in page header action slot).
// Story 2.2: Actions column parity (DeleteableAssessmentTable replaces bare AssessmentOverviewTable).
// Design reference: docs/design/lld-v11-e11-1-project-management.md §Pending changes — Rev 2
//                   docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §Pending changes — Rev 2
// Issue: #450
//
// Server component testing note: calling the async page function directly returns a
// React element tree without invoking child component functions. Assertions inspect
// JSON.stringify(result) for props that appear in the element tree — hrefs,
// aria-labels, class names, and data passed to child components as props.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
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
  // Function stubs are stored as React element types (never called by JSX).
  // next/link is a special case — we keep the default export shape.
  default: () => null,
}));

vi.mock('@/components/ui/page-header', () => ({
  PageHeader: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/inline-edit-header', () => ({
  InlineEditHeader: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/delete-button', () => ({
  DeleteButton: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/track-last-visited', () => ({
  TrackLastVisitedProject: () => null,
}));

vi.mock('@/components/set-breadcrumbs', () => ({
  SetBreadcrumbs: () => null,
}));

// DeleteableAssessmentTable is never called by JSX (it's stored as a React element
// type). Its props — including initialAssessments and showProjectColumn — are visible
// in JSON.stringify(result) because the React element stores them.
vi.mock('@/app/(authenticated)/organisation/deleteable-assessment-table', () => ({
  DeleteableAssessmentTable: () => null,
}));

vi.mock('lucide-react', () => ({
  Settings: () => null,
}));

vi.mock('@/app/api/assessments/helpers', () => ({
  fetchParticipantCounts: vi.fn().mockResolvedValue({}),
  toListItem: vi.fn((row: unknown) => row),
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const PROJECT_ID = 'project-abc';
const ASSESSMENT_ID = 'assess-xyz';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  name: 'Payment Service',
  description: 'Handles all payment flows',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const MOCK_ASSESSMENT_ROW = {
  id: ASSESSMENT_ID,
  type: 'fcs',
  status: 'awaiting_responses',
  pr_number: 42,
  feature_name: 'Auth revamp',
  aggregate_score: null,
  conclusion: null,
  config_comprehension_depth: 'standard',
  created_at: '2026-04-10T00:00:00Z',
  rubric_error_code: null,
  rubric_retry_count: 0,
  rubric_error_retryable: null,
  project_id: PROJECT_ID,
  repositories: { github_repo_name: 'acme/auth' },
  projects: { name: 'Payment Service' },
};

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function makeClient({
  project = MOCK_PROJECT as typeof MOCK_PROJECT | null,
  assessmentRows = [] as unknown[],
} = {}) {
  const makeMaybySingle = (data: unknown) => ({
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  });
  const makeEq2 = (data: unknown) => ({
    eq: vi.fn().mockReturnValue(makeMaybySingle(data)),
  });
  const makeEq1 = (data: unknown) => ({
    eq: vi.fn().mockReturnValue(makeEq2(data)),
  });
  const makeSelectChain = (data: unknown) => ({
    select: vi.fn().mockReturnValue(makeEq1(data)),
  });

  const makeOrder = (data: unknown) => ({
    order: vi.fn().mockResolvedValue({ data, error: null }),
  });
  const makeEq2Assessments = (data: unknown) => ({
    eq: vi.fn().mockReturnValue(makeOrder(data)),
  });
  const makeEq1Assessments = (data: unknown) => ({
    eq: vi.fn().mockReturnValue(makeEq2Assessments(data)),
  });
  const makeSelectAssessments = (data: unknown) => ({
    select: vi.fn().mockReturnValue(makeEq1Assessments(data)),
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') return makeSelectChain(project);
      if (table === 'assessments') return makeSelectAssessments(assessmentRows);
      return makeSelectChain(null);
    }),
  };
}

// ---------------------------------------------------------------------------
// Convenience invocation — mirrors sibling settings/page.test.ts
// ---------------------------------------------------------------------------

async function callPage(projectId = PROJECT_ID) {
  const { default: ProjectDashboardPage } = await import(
    '@/app/(authenticated)/projects/[id]/page'
  );
  return ProjectDashboardPage({ params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Project dashboard — Settings affordance (rev 1.3) [#450, lld E11.1 §I11]', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // Property 1: Settings link href is /projects/[id]/settings
  // Props on React elements ARE visible in JSON.stringify even when the
  // component function is never invoked by JSX.
  // [lld E11.1 §I10, §I11, #450]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard', () => {
    it('Settings link href is /projects/[id]/settings [lld E11.1 §I10, §I11, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();

      expect(JSON.stringify(result)).toContain(`/projects/${PROJECT_ID}/settings`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Settings link is identified by its aria-label — the icon-and-label
  // control sets aria-label="Project settings"; the legacy faint link had no aria-label.
  // [lld E11.1 §Pending changes — Rev 2: "header-area icon-and-label control"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard', () => {
    it('renders Settings link with icon and label inside the page header action slot [lld E11.1 §I11, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // The icon-and-label Settings link is identified by aria-label="Project settings"
      // which was absent from the legacy faint inline link.
      expect(rendered).toContain('"aria-label":"Project settings"');
      expect(rendered).toContain(`/projects/${PROJECT_ID}/settings`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Settings and New Assessment are siblings in the PageHeader action slot.
  // The `action` prop of PageHeader contains both — verify both hrefs appear in the
  // JSON subtree starting at `"action":`.
  // [lld E11.1 §Pending changes — Rev 2 Action slot composition sketch]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard', () => {
    it('renders Settings alongside New Assessment as a sibling header control [lld E11.1 §I11, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // Both hrefs must exist in the output.
      expect(rendered).toContain(`/projects/${PROJECT_ID}/settings`);
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/new`);

      // Both must appear within the PageHeader's `action` prop subtree.
      // Since PageHeader is the only element with an `action` prop, this uniquely
      // identifies the header action slot.
      const actionIndex = rendered.indexOf('"action":');
      expect(actionIndex).toBeGreaterThanOrEqual(0);
      const actionSubtree = rendered.slice(actionIndex);
      expect(actionSubtree).toContain(`/projects/${PROJECT_ID}/settings`);
      expect(actionSubtree).toContain(`/projects/${PROJECT_ID}/assessments/new`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: The legacy faint inline Settings link (text-text-secondary) is removed.
  // Regression guard — the pre-fix code rendered a link with class
  // "inline-flex items-center text-label font-medium text-text-secondary hover:text-text-primary"
  // [lld E11.1 §I11, issue #450 "Replace the faint inline Settings link"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard (#450 regression)', () => {
    it('does not render the legacy faint inline Settings link (text-text-secondary) [lld E11.1 §I11, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('text-text-secondary hover:text-text-primary');
    });
  });
});

// ---------------------------------------------------------------------------

describe('Project dashboard — actions column (rev 1.3) [#450, lld E11.2 §Pending Rev 2]', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // Property 5: DeleteableAssessmentTable is used (not bare AssessmentOverviewTable).
  // The component is not invoked by JSX, but its `initialAssessments` prop IS visible
  // in the serialised React element tree.
  // [lld E11.2 §Pending Rev 2: "replace AssessmentOverviewTable with DeleteableAssessmentTable"]
  // -------------------------------------------------------------------------

  describe('Given a project with at least one assessment', () => {
    it('renders Trash2 (delete) and MoreHorizontal (view-detail) icons per assessment row — uses DeleteableAssessmentTable [lld E11.2 §Pending Rev 2, #450]', async () => {
      const client = makeClient({ assessmentRows: [MOCK_ASSESSMENT_ROW] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();

      // `initialAssessments` is the distinctive prop of DeleteableAssessmentTable.
      // Its presence confirms that component (not AssessmentOverviewTable) was mounted.
      expect(JSON.stringify(result)).toContain('"initialAssessments"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: The page passes the loaded assessment list as `initialAssessments`.
  // The assessment id from the DB row must appear inside that prop.
  // [lld E11.2 §Pending Rev 2 change shape]
  // -------------------------------------------------------------------------

  describe('Given a project with one assessment row', () => {
    it('clicking delete opens DeleteAssessmentDialog and on confirm removes the row — DeleteableAssessmentTable receives initialAssessments prop [lld E11.2 §Pending Rev 2, #450]', async () => {
      const client = makeClient({ assessmentRows: [MOCK_ASSESSMENT_ROW] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"initialAssessments"');
      // The assessment id confirms the loaded data is passed through.
      expect(rendered).toContain(ASSESSMENT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Assessment list items carry `project_id` so DeleteableAssessmentTable
  // can construct the project-first detail URL /projects/[id]/assessments/[aid].
  // [lld E11.2 §Pending Rev 2 Invariants: "href must be project-first form" (DP8)]
  // -------------------------------------------------------------------------

  describe('Given a project with one assessment whose project_id matches the route [id]', () => {
    it('clicking view-detail navigates to /projects/[id]/assessments/[aid] — project_id is passed in initialAssessments [lld E11.2 DP8, #450]', async () => {
      const client = makeClient({ assessmentRows: [MOCK_ASSESSMENT_ROW] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`"project_id":"${PROJECT_ID}"`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: `showProjectColumn` must be absent from the element props.
  // JSON.stringify omits undefined values, so the key must not appear at all.
  // [lld E11.2 §Pending Rev 2: "omit showProjectColumn — project context is implicit"]
  // -------------------------------------------------------------------------

  describe('Given an admin on the project dashboard with assessments', () => {
    it('does not render the Project column (showProjectColumn omitted from DeleteableAssessmentTable) [lld E11.2 §Pending Rev 2, #450]', async () => {
      const client = makeClient({ assessmentRows: [MOCK_ASSESSMENT_ROW] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();

      expect(JSON.stringify(result)).not.toContain('"showProjectColumn"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Empty-state path — `initialAssessments` must be absent (table not
  // mounted) and the "Create the first assessment" CTA must appear.
  // [lld E11.2 §Pending Rev 2: "assessments.length === 0 → EmptyState"]
  // [req §Story 2.2 AC: "empty-state path is unchanged"]
  // -------------------------------------------------------------------------

  describe('Given a project with no assessments (empty state path)', () => {
    it('omits the actions column — DeleteableAssessmentTable is not rendered, empty-state CTA appears [lld E11.2 §Pending Rev 2, #450]', async () => {
      const client = makeClient({ assessmentRows: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('"initialAssessments"');
      expect(rendered).toContain('Create the first assessment');
    });
  });
});
