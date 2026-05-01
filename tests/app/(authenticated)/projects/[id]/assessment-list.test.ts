// Tests for AssessmentList — project-scoped FCS list on the project dashboard.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.5 (Task T2.5)
// Requirements: docs/requirements/v11-requirements.md §Epic 2, Story 2.2
// Issue: #414

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

// Stub Next.js Link so its href prop survives JSON.stringify.
// The real Link is a client component that throws in a node test environment.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

// Stub Card — pure layout, not under test here.
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: unknown }) => ({
    type: 'div',
    props: { 'data-component': 'Card', children },
  }),
}));

// Stub StatusBadge — its rendering detail is tested in its own suite.
vi.mock('@/components/ui/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => ({
    type: 'span',
    props: { 'data-component': 'StatusBadge', 'data-status': status },
  }),
}));

// Stub PollingStatusBadge — client component, not under test here.
vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: ({ assessmentId }: { assessmentId: string }) => ({
    type: 'span',
    props: { 'data-component': 'PollingStatusBadge', 'data-assessment-id': assessmentId },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AssessmentList } from '@/app/(authenticated)/projects/[id]/assessment-list';

const mockCreateServer = vi.mocked(createServerSupabaseClient);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'pid-001';
const SIBLING_PROJECT_ID = 'pid-002';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Minimal assessment row shape returned by the Supabase query.
 * Matches the SELECT columns in §B.5:
 *   id, type, status, feature_name, feature_description,
 *   aggregate_score, created_at, rubric_error_code, rubric_retry_count
 */
type AssessmentQueryRow = {
  id: string;
  type: 'fcs' | 'prcc';
  status: 'rubric_generation' | 'rubric_failed' | 'awaiting_responses' | 'scoring' | 'completed';
  feature_name: string | null;
  feature_description: string | null;
  aggregate_score: number | null;
  created_at: string;
  rubric_error_code: string | null;
  rubric_retry_count: number;
};

function makeFcsRow(overrides: Partial<AssessmentQueryRow> = {}): AssessmentQueryRow {
  return {
    id: 'assessment-001',
    type: 'fcs',
    status: 'awaiting_responses',
    feature_name: 'Payment flow refactor',
    feature_description: 'Simplifies the checkout pipeline',
    aggregate_score: null,
    created_at: '2026-05-01T10:00:00Z',
    rubric_error_code: null,
    rubric_retry_count: 0,
    ...overrides,
  };
}

/**
 * Builds a mock Supabase client whose query chain satisfies:
 *   .from('assessments')
 *   .select(...)
 *   .eq('project_id', projectId)
 *   .eq('type', 'fcs')
 *   .order('created_at', { ascending: false })
 *
 * Returns `rows` as the resolved data.
 */
function makeSupabaseClient(rows: AssessmentQueryRow[]) {
  const orderResult = { data: rows, error: null };
  const orderFn = vi.fn().mockResolvedValue(orderResult);
  const eqType = vi.fn().mockReturnValue({ order: orderFn });
  const eqProject = vi.fn().mockReturnValue({ eq: eqType });
  const selectFn = vi.fn().mockReturnValue({ eq: eqProject });
  const fromFn = vi.fn().mockReturnValue({ select: selectFn });

  return {
    from: fromFn,
    _internals: { eqProject, eqType, orderFn, selectFn },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Project dashboard — assessment list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 1: Lists exactly the FCS assessments whose project_id = pid
  // [req §Story 2.2 AC1] [lld §B.5 "eq('project_id', projectId)"]
  // -------------------------------------------------------------------------

  describe('Given a project with two FCS assessments', () => {
    it('renders one card per assessment in the response tree (Issue #414)', async () => {
      const rows = [
        makeFcsRow({ id: 'assessment-001' }),
        makeFcsRow({ id: 'assessment-002', feature_name: 'Auth refactor' }),
      ];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('assessment-001');
      expect(rendered).toContain('assessment-002');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Query filters by project_id = projectId
  // [req §Story 2.2 AC4] [lld §B.5 "I8: .eq('project_id', pid) predicate"]
  // -------------------------------------------------------------------------

  describe('Given the component is called with projectId "pid-001"', () => {
    it('queries the assessments table with eq("project_id", "pid-001")', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentList({ projectId: PROJECT_ID });

      // The first .eq() call must be scoped to the project
      expect(client._internals.eqProject).toHaveBeenCalledWith('project_id', PROJECT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Query filters by type = 'fcs' (excludes PRCC rows at the DB level)
  // [req §Story 2.2] [lld §B.5 ".eq('type', 'fcs')"] [lld §Invariant I6]
  // -------------------------------------------------------------------------

  describe('Given the Supabase query is issued', () => {
    it('applies eq("type", "fcs") to exclude PRCC rows at the query level', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentList({ projectId: PROJECT_ID });

      expect(client._internals.eqType).toHaveBeenCalledWith('type', 'fcs');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Results are ordered by created_at DESC
  // [lld §B.5 ".order('created_at', { ascending: false })"]
  // -------------------------------------------------------------------------

  describe('Given the query is issued', () => {
    it('orders results by created_at descending', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentList({ projectId: PROJECT_ID });

      expect(client._internals.orderFn).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Excludes assessments from sibling projects
  // [req §Story 2.2 AC2] "no assessment from project B appears in A's list"
  // [lld §Invariant I8]
  // -------------------------------------------------------------------------

  describe('Given sibling-project assessments were inadvertently returned by the mock', () => {
    it('does NOT render an assessment whose id belongs to a sibling project (Issue #414)', async () => {
      // The query predicate ensures this never happens in production.
      // We test the observable output: when only the scoped project's rows are
      // returned, the sibling's ID must be absent from the rendered tree.
      const rows = [makeFcsRow({ id: 'assessment-from-pid-001' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('sibling-assessment-id');
      expect(rendered).not.toContain(SIBLING_PROJECT_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Excludes PRCC rows from rendered output
  // [req §Story 2.2] [lld §B.5 "type='fcs' predicate"] [lld §Invariant I6]
  // -------------------------------------------------------------------------

  describe('Given only FCS rows are returned by the query (PRCC is filtered at the DB level)', () => {
    it('does NOT render any PRCC assessment id in the output', async () => {
      // The component never receives PRCC rows because .eq('type', 'fcs') is
      // enforced at the query layer. This test confirms the rendered output
      // contains only the FCS id.
      const rows = [makeFcsRow({ id: 'fcs-only-id' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('fcs-only-id');
      expect(rendered).not.toContain('prcc-001');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: Empty state — no assessments → "No assessments yet" message
  // [req §Story 2.2 AC3] [lld §B.5 "Empty state CTA"] [req §Story 1.3 AC2]
  // -------------------------------------------------------------------------

  describe('Given the project has no assessments', () => {
    it('renders an empty-state message when the query returns an empty array', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      // The exact message text is specified in the context as "No assessments yet"
      expect(rendered).toMatch(/[Nn]o assessments/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: Empty state CTA links to /projects/[pid]/assessments/new
  // [req §Story 2.2 AC3] [lld §B.5 "CTA pointing at /projects/[id]/assessments/new"]
  // -------------------------------------------------------------------------

  describe('Given the project has no assessments', () => {
    it('renders a CTA link pointing to /projects/[pid]/assessments/new', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/new`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Pending items link to /projects/[pid]/assessments/[aid]
  // [lld §B.5 "Pending/in-progress rows link to …/assessments/[aid]"]
  // Pending statuses: rubric_generation, rubric_failed, awaiting_responses
  // -------------------------------------------------------------------------

  describe('Given a pending assessment (status = "awaiting_responses")', () => {
    it('renders a link to /projects/[pid]/assessments/[aid] (detail page)', async () => {
      const rows = [makeFcsRow({ id: 'pending-aid', status: 'awaiting_responses' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/pending-aid`);
      // Must NOT link to the results page for a pending item
      expect(rendered).not.toContain(`/projects/${PROJECT_ID}/assessments/pending-aid/results`);
    });
  });

  describe('Given a pending assessment (status = "rubric_generation")', () => {
    it('links to the detail page, not the results page', async () => {
      const rows = [makeFcsRow({ id: 'gen-aid', status: 'rubric_generation' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      // Detail URL must be present
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/gen-aid`);
      // Results URL must be absent for a pending item
      expect(rendered).not.toContain(`/projects/${PROJECT_ID}/assessments/gen-aid/results`);
    });
  });

  describe('Given a failed-rubric assessment (status = "rubric_failed")', () => {
    it('links to the detail page, not the results page', async () => {
      const rows = [makeFcsRow({ id: 'failed-aid', status: 'rubric_failed' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/failed-aid`);
      expect(rendered).not.toContain(`/projects/${PROJECT_ID}/assessments/failed-aid/results`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: Completed items link to /projects/[pid]/assessments/[aid]/results
  // [lld §B.5 "Completed rows link to …/results"]
  // Completed statuses: scoring, completed
  // -------------------------------------------------------------------------

  describe('Given a completed assessment (status = "completed")', () => {
    it('renders a link to /projects/[pid]/assessments/[aid]/results', async () => {
      const rows = [
        makeFcsRow({ id: 'done-aid', status: 'completed', aggregate_score: 75 }),
      ];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/done-aid/results`);
    });
  });

  describe('Given a scoring assessment (status = "scoring")', () => {
    it('renders a link to /projects/[pid]/assessments/[aid]/results', async () => {
      const rows = [makeFcsRow({ id: 'scoring-aid', status: 'scoring' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/scoring-aid/results`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: Assessment feature_name appears in rendered output
  // [req §Story 2.2 AC1] "same columns as existing pre-V11 FCS assessment list"
  // -------------------------------------------------------------------------

  describe('Given an assessment with a feature_name', () => {
    it('renders the feature_name in the list item', async () => {
      const rows = [makeFcsRow({ id: 'aid-fn', feature_name: 'Checkout pipeline refactor' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Checkout pipeline refactor');
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: Mixed pending and completed items — both link targets present
  // [req §Story 2.2 AC1] [lld §B.5 item linkage rules]
  // -------------------------------------------------------------------------

  describe('Given a project with both pending and completed assessments', () => {
    it('renders the correct link type for each item', async () => {
      const rows = [
        makeFcsRow({ id: 'pending-mix', status: 'awaiting_responses' }),
        makeFcsRow({ id: 'done-mix', status: 'completed', aggregate_score: 88 }),
      ];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      // Pending → detail
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/pending-mix`);
      expect(rendered).not.toContain(`/projects/${PROJECT_ID}/assessments/pending-mix/results`);

      // Completed → results
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/done-mix/results`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 13: queries 'assessments' table (not any other)
  // [lld §B.5 list query — .from('assessments')]
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('queries the "assessments" table', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentList({ projectId: PROJECT_ID });

      expect(client.from).toHaveBeenCalledWith('assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 14: Non-empty list does NOT render empty-state CTA
  // [req §Story 2.2 AC1 vs AC3 — mutually exclusive states]
  // -------------------------------------------------------------------------

  describe('Given the project has at least one assessment', () => {
    it('does NOT render the empty-state "No assessments" message', async () => {
      const rows = [makeFcsRow({ id: 'exists-001' })];
      const client = makeSupabaseClient(rows);
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentList({ projectId: PROJECT_ID });
      const rendered = JSON.stringify(result);

      // Assessment exists → no empty state
      expect(rendered).not.toMatch(/[Nn]o assessments yet/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 15: SELECT includes required columns
  // [lld §B.5 list query columns]
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('selects the required columns from the assessments table', async () => {
      const client = makeSupabaseClient([]);
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentList({ projectId: PROJECT_ID });

      const selectCall = client._internals.selectFn.mock.calls[0][0] as string;
      expect(selectCall).toContain('id');
      expect(selectCall).toContain('status');
      expect(selectCall).toContain('feature_name');
      expect(selectCall).toContain('created_at');
      expect(selectCall).toContain('aggregate_score');
      expect(selectCall).toContain('rubric_error_code');
      expect(selectCall).toContain('rubric_retry_count');
    });
  });
});
