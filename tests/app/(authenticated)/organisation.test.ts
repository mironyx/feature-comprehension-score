// Tests for /organisation page — admin-only route protection + context panel.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62, #158

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn(),
}));

vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: vi.fn(),
}));

// Stub the secret Supabase client so the page does not try to read the
// SUPABASE_SECRET_KEY env var and connect to a real instance.
vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// Stub the repository list service — covered by its own test file.
vi.mock('@/app/api/organisations/[id]/repositories/service', () => ({
  listRepositories: vi.fn().mockResolvedValue({ registered: [], accessible: [] }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Stub the new assessment loader so pre-existing tests are not affected.
// Individual describe blocks override this as needed.
vi.mock('@/app/(authenticated)/organisation/load-assessments', () => ({
  loadOrgAssessmentsOverview: vi.fn().mockResolvedValue([]),
}));

// Turn <Link> into a plain object so JSON.stringify assertions work.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

// Stub child client-component forms to avoid pulling in their deps.
// We use string-typed defaults (rather than functional components that
// return a marker string) because React JSX creates elements with the
// function reference as `type` — JSON.stringify strips function types,
// so the marker would not appear in the serialised output. A string
// `type` is preserved verbatim by JSON.stringify, matching the pattern
// used by the `next/link` mock above.
vi.mock(
  '@/app/(authenticated)/organisation/org-context-form',
  () => ({ default: 'OrgContextForm' }),
);

vi.mock(
  '@/app/(authenticated)/organisation/retrieval-settings-form',
  () => ({ default: 'RetrievalSettingsForm' }),
);

// Stub the presentational table for page-level tests; tested in isolation below.
// Uses a string-typed named export (same pattern as next/link and the form
// mocks above) so JSX in the page produces an element with `type: 'Assessment
// OverviewTable'` that serialises verbatim through JSON.stringify, and the
// assessments prop is preserved in the serialised output for assertion.
vi.mock(
  '@/app/(authenticated)/organisation/assessment-overview-table',
  () => ({ AssessmentOverviewTable: 'AssessmentOverviewTable' }),
);

// The page renders DeleteableAssessmentTable (issue #319), which wraps the
// overview table. Stub it with a string-typed named export so the page test
// assertions can verify the wrapper is rendered and the initialAssessments
// prop reaches it verbatim via JSON.stringify.
vi.mock(
  '@/app/(authenticated)/organisation/deleteable-assessment-table',
  () => ({ DeleteableAssessmentTable: 'DeleteableAssessmentTable' }),
);

// Stub the RepositoriesTab so page tests don't depend on its render output.
vi.mock(
  '@/app/(authenticated)/organisation/repositories-tab',
  () => ({ RepositoriesTab: 'RepositoriesTab' }),
);

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { loadOrgRetrievalSettings } from '@/lib/supabase/org-retrieval-settings';
import { redirect, forbidden } from 'next/navigation';
import { cookies } from 'next/headers';
import { loadOrgAssessmentsOverview } from '@/app/(authenticated)/organisation/load-assessments';
import { listRepositories } from '@/app/api/organisations/[id]/repositories/service';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockLoadContext = vi.mocked(loadOrgPromptContext);
const mockLoadRetrieval = vi.mocked(loadOrgRetrievalSettings);
const mockLoadAssessments = vi.mocked(loadOrgAssessmentsOverview);
const mockListRepositories = vi.mocked(listRepositories);

const DEFAULT_RETRIEVAL = {
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
};
const mockRedirect = vi.mocked(redirect);
const mockForbidden = vi.mocked(forbidden);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ORG_ID = 'org-001';
const mockCookieStore = {};

function makeClient(role: 'admin' | 'member' | null) {
  const user = role === null
    ? null
    : { id: USER_ID, user_metadata: { user_name: 'alice', provider_id: '42' } };

  const membership = role ? [{ org_id: ORG_ID, github_role: role }] : [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: membership, error: null }),
        }),
      }),
    }),
  };
}

/** Minimal AssessmentListItem fixture for use in multiple describe blocks. */
function makeAssessmentItem(overrides: Partial<{
  id: string;
  type: string;
  status: string;
  repository_name: string;
  pr_number: number | null;
  feature_name: string | null;
  aggregate_score: number | null;
  conclusion: string | null;
  config_comprehension_depth: string | null;
  participant_count: number;
  completed_count: number;
  created_at: string;
  rubric_error_code: string | null;
  rubric_retry_count: number;
  rubric_error_retryable: boolean | null;
  project_id: string | null;
}> = {}) {
  return {
    id: 'assess-001',
    type: 'fcs',
    status: 'completed',
    repository_name: 'acme/backend',
    pr_number: null,
    feature_name: 'Auth Overhaul',
    aggregate_score: 0.82,
    conclusion: null,
    config_comprehension_depth: null,
    participant_count: 4,
    completed_count: 3,
    created_at: '2026-04-01T10:00:00Z',
    rubric_error_code: null,
    rubric_retry_count: 0,
    rubric_error_retryable: null,
    project_id: 'proj-1',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pre-existing tests (must remain intact — #62, #158)
// ---------------------------------------------------------------------------

describe('Organisation page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockLoadContext.mockResolvedValue(undefined);
    mockLoadRetrieval.mockResolvedValue(DEFAULT_RETRIEVAL);
    mockLoadAssessments.mockResolvedValue([]);
  });

  describe('Given I am a regular user visiting /organisation', () => {
    it('then it returns 403 Forbidden', async () => {
      mockCreateServer.mockResolvedValue(makeClient('member') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await expect(OrganisationPage()).rejects.toThrow('NEXT_FORBIDDEN');
      expect(mockForbidden).toHaveBeenCalled();
    });
  });

  describe('Given I am an org admin visiting /organisation', () => {
    it('then I see the org overview with context form', async () => {
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);
      mockLoadContext.mockResolvedValue({ focus_areas: ['API design'] });

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
      // Verify loadOrgPromptContext was called with the org ID
      expect(mockLoadContext).toHaveBeenCalledWith(expect.anything(), ORG_ID);
    });
  });

  describe('Given an unauthenticated user visiting /organisation', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeClient(null) as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await expect(OrganisationPage()).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  // -------------------------------------------------------------------------
  // §2 — New Assessment action [lld §2, issue #296 AC1]
  // -------------------------------------------------------------------------

  describe('New Assessment action', () => {
    it('shows "New Assessment" button in the page header', async () => {
      // AC1: Organisation page shows "New Assessment" button in the page header.
      // [lld §2 "Add New Assessment action to the PageHeader"]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(JSON.stringify(result)).toContain('New Assessment');
    });

    it('links the "New Assessment" button to /assessments/new', async () => {
      // AC1 (cont.): The button must link to /assessments/new.
      // [lld §2 "same link as previously on My Assessments: /assessments/new"]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(JSON.stringify(result)).toContain('/assessments/new');
    });
  });

  // -------------------------------------------------------------------------
  // §2 — Assessment overview table: page integration [lld §2, issue #296 AC2–5]
  // -------------------------------------------------------------------------

  describe('assessment overview table (page integration)', () => {
    it('renders the DeleteableAssessmentTable component when an admin loads the page', async () => {
      // AC2: Page shows a table of all assessments for the org.
      // [lld §2 "Add assessment overview table between header and settings forms"]
      // [lld §3.2 "Replace AssessmentOverviewTable with DeleteableAssessmentTable" — issue #319]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);
      mockLoadAssessments.mockResolvedValue([makeAssessmentItem()]);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(JSON.stringify(result)).toContain('DeleteableAssessmentTable');
    });

    it('passes the loaded assessments to DeleteableAssessmentTable', async () => {
      // AC2: All assessments for the org must reach the table component.
      // [lld §2 "Data fetching — query assessments for the org"]
      // [lld §3.2 page wires initialAssessments through the wrapper — issue #319]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);
      mockLoadAssessments.mockResolvedValue([
        makeAssessmentItem({ id: 'assess-001' }),
        makeAssessmentItem({ id: 'assess-002' }),
      ]);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      // String-typed mock preserves the `initialAssessments` prop verbatim; assert
      // both loaded ids reach the wrapper.
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('"id":"assess-001"');
      expect(rendered).toContain('"id":"assess-002"');
    });

    it('calls loadOrgAssessmentsOverview with the supabase client and org id', async () => {
      // AC2 (internal): loader must be invoked with the correct scoped client and org id.
      // [lld §2 data query section]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await OrganisationPage();
      expect(mockLoadAssessments).toHaveBeenCalledWith(
        expect.anything(),
        ORG_ID,
      );
    });

    it('renders settings forms below the overview table', async () => {
      // AC6: Settings forms remain below the overview table.
      // [lld §2 current state + changes; issue #296 AC6]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('OrgContextForm');
      expect(rendered).toContain('RetrievalSettingsForm');
    });

    it('renders overview table before settings forms in the output', async () => {
      // AC6 (ordering): table must appear before settings forms.
      // [lld §2 "between the header and the settings forms"]
      // [lld §3.2 wrapper is DeleteableAssessmentTable — issue #319]
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      const rendered = JSON.stringify(result);
      const tablePos = rendered.indexOf('DeleteableAssessmentTable');
      const formsPos = Math.min(
        rendered.indexOf('OrgContextForm'),
        rendered.indexOf('RetrievalSettingsForm'),
      );
      expect(tablePos).toBeGreaterThanOrEqual(0);
      expect(formsPos).toBeGreaterThanOrEqual(0);
      expect(tablePos).toBeLessThan(formsPos);
    });
  });

  // -------------------------------------------------------------------------
  // Repositories tab — page integration [lld §T1 AC, issue #365]
  // -------------------------------------------------------------------------
  // These tests confirm the page wires the fourth tab correctly: that the
  // RepositoriesTab component appears in the output and that listRepositories
  // is invoked with the correct orgId. The service itself is covered by its
  // own test file; these tests guard the page-level integration only.

  describe('Repositories tab (page integration)', () => {
    it('renders RepositoriesTab in the page output when admin loads the page', async () => {
      // [lld §T1 AC] "A Repositories tab appears as the fourth tab on the org page."
      // [issue #365 AC] "Repositories tab appears as the fourth tab on org page"
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(JSON.stringify(result)).toContain('RepositoriesTab');
    });

    it('calls listRepositories with the selected orgId', async () => {
      // [lld §T1 org page changes] The page must invoke listRepositories(ctx, orgId)
      // so the Repositories tab receives live data.
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await OrganisationPage();
      expect(mockListRepositories).toHaveBeenCalledWith(
        expect.anything(),
        ORG_ID,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// AssessmentOverviewTable — isolated component tests [lld §2, issue #296 AC3–5]
// ---------------------------------------------------------------------------
// These tests exercise the presentational component directly. Because vi.mock
// at the top of this file stubs out the component for the page-level tests,
// we use vi.importActual here to import the real implementation.

describe('AssessmentOverviewTable', () => {
  async function renderTable(assessments: ReturnType<typeof makeAssessmentItem>[]) {
    const { AssessmentOverviewTable: RealTable } = await vi.importActual<
      typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
    >('@/app/(authenticated)/organisation/assessment-overview-table');
    return RealTable({ assessments });
  }

  // -------------------------------------------------------------------------
  // AC3 — Table columns
  // -------------------------------------------------------------------------

  describe('Given a list with one assessment', () => {
    it('displays the feature name in the row', async () => {
      // AC3: feature name column [lld §2 Table columns "Feature / PR"]
      const item = makeAssessmentItem({ feature_name: 'Auth Overhaul', pr_number: null });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('Auth Overhaul');
    });

    it('displays a PR label when feature_name is null', async () => {
      // AC3: feature/PR column falls back to PR number when feature_name absent.
      // [lld §2 Table columns "PR #${pr_number}"]
      const item = makeAssessmentItem({ feature_name: null, pr_number: 42 });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('42');
    });

    it('displays the repository name', async () => {
      // AC3: repository column [lld §2 Table columns "Repository"]
      const item = makeAssessmentItem({ repository_name: 'acme/backend' });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('acme/backend');
    });

    it('displays the assessment type', async () => {
      // AC3: type column [lld §2 Table columns "Type"]
      const item = makeAssessmentItem({ type: 'fcs' });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('fcs');
    });

    it('displays the assessment status', async () => {
      // AC3: status column [lld §2 Table columns "Status"]
      const item = makeAssessmentItem({ status: 'awaiting_responses' });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('awaiting_responses');
    });

    it('displays the aggregate score when present', async () => {
      // AC3: score column [lld §2 Table columns "Score — aggregate_score (percentage or —)"]
      const item = makeAssessmentItem({ aggregate_score: 0.82 });
      const result = await renderTable([item]);
      // Score must be rendered; the exact format (0.82 or 82%) is up to the impl,
      // but the numeric value must be visible.
      expect(JSON.stringify(result)).toMatch(/82/);
    });

    it('displays a dash or empty placeholder when aggregate_score is null', async () => {
      // AC3: score column — null score shows "—" [lld §2 Table columns]
      const item = makeAssessmentItem({ aggregate_score: null });
      const result = await renderTable([item]);
      // The spec says "—" for missing score; assert the en-dash or the literal text appears.
      expect(JSON.stringify(result)).toContain('—');
    });

    it('displays the completion ratio (completed/total participants)', async () => {
      // AC3: completion column [lld §2 Table columns "completed/total participants"]
      const item = makeAssessmentItem({ completed_count: 3, participant_count: 4 });
      const result = await renderTable([item]);
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('3');
      expect(rendered).toContain('4');
    });

    it('displays the creation date', async () => {
      // AC3: date column [lld §2 Table columns "Date — created_at (formatted)"]
      const item = makeAssessmentItem({ created_at: '2026-04-01T10:00:00Z' });
      const result = await renderTable([item]);
      // The formatted date must contain the year at minimum.
      expect(JSON.stringify(result)).toContain('2026');
    });
  });

  // -------------------------------------------------------------------------
  // AC4 — Row links to /assessments/[id]/results
  // -------------------------------------------------------------------------

  describe('Given a list with one assessment', () => {
    it('links each row to /assessments/[id]/results', async () => {
      // AC4 [lld §2 "Each row links to /assessments/[id]/results", issue #296 AC4]
      const item = makeAssessmentItem({ id: 'assess-xyz' });
      const result = await renderTable([item]);
      expect(JSON.stringify(result)).toContain('/projects/proj-1/assessments/assess-xyz/results');
    });
  });

  describe('Given two assessments with distinct IDs', () => {
    it('generates distinct result links for each row', async () => {
      // AC4 (multiple rows): each row must carry its own link.
      const items = [
        makeAssessmentItem({ id: 'assess-aaa' }),
        makeAssessmentItem({ id: 'assess-bbb' }),
      ];
      const result = await renderTable(items);
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('/projects/proj-1/assessments/assess-aaa/results');
      expect(rendered).toContain('/projects/proj-1/assessments/assess-bbb/results');
    });
  });

  // -------------------------------------------------------------------------
  // AC5 — Empty state
  // -------------------------------------------------------------------------

  describe('Given an empty assessment list', () => {
    it('shows the "No assessments yet" empty state message', async () => {
      // AC5 [lld §2 "Empty state: No assessments yet", issue #296 AC5]
      const result = await renderTable([]);
      expect(JSON.stringify(result)).toContain('No assessments yet');
    });

    it('includes a prompt to create the first assessment in the empty state', async () => {
      // AC5: empty state includes a prompt to create one [issue #296 AC5]
      const result = await renderTable([]);
      // The prompt should mention creating or starting an assessment.
      const rendered = JSON.stringify(result);
      expect(rendered).toMatch(/creat|start|new/i);
    });

    it('does not render any table rows in the empty state', async () => {
      // Prohibition: empty list must not render stale/fabricated row data.
      const result = await renderTable([]);
      const rendered = JSON.stringify(result);
      // No result links should appear when the list is empty.
      expect(rendered).not.toContain('/results');
    });
  });

  // -------------------------------------------------------------------------
  // Prohibition — no individual developer names or scores [req §6.3]
  // -------------------------------------------------------------------------

  describe('Given an assessment with participant data', () => {
    it('does not render individual participant names', async () => {
      // [req §6.3 "No individual developer names or scores on this page"]
      const item = makeAssessmentItem({ participant_count: 3, completed_count: 2 });
      const result = await renderTable([item]);
      // The only user-identifying string in our fixture is USER_ID — must not appear.
      expect(JSON.stringify(result)).not.toContain(USER_ID);
    });
  });
});
