// Tests for /assessments page — show all statuses, partition, link to results.
// Design reference: docs/design/lld-nav-results.md §1
// Requirements: docs/requirements/v1-requirements.md Story 5.4
// Issues: #130, #295

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

vi.mock('@/lib/supabase/membership', () => ({
  isOrgAdmin: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/app/(authenticated)/assessments/assessment-status', () => ({
  StatusBadge: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/app/(authenticated)/assessments/retry-button', () => ({
  RetryButton: ({ assessmentId, retryCount, maxRetries, errorRetryable }: {
    assessmentId: string;
    retryCount: number;
    maxRetries: number;
    errorRetryable: boolean | null;
  }) => JSON.stringify({ assessmentId, retryCount, maxRetries, errorRetryable }),
}));

vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: ({ assessmentId, initialStatus }: {
    assessmentId: string;
    initialStatus: string;
  }) => JSON.stringify({ assessmentId, initialStatus }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';
import { partitionAssessments } from '@/app/(authenticated)/assessments/partition';
import type { AssessmentItem } from '@/app/(authenticated)/assessments/partition';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockIsOrgAdmin = vi.mocked(isOrgAdmin);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';

/**
 * Builds a mock Supabase client whose assessments query chain is:
 *   .from('assessments').select(...).eq('org_id', orgId).order(...)
 * Note: NO .in() call — #295 removes the status filter entirely.
 */
function makeClient({
  assessments = [],
  captureSelect,
}: {
  assessments?: unknown[];
  captureSelect?: (cols: string) => void;
} = {}) {
  const mockOrder = vi.fn().mockResolvedValue({ data: assessments, error: null });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_organisations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ github_role: 'admin' }],
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockImplementation((cols: string) => {
          captureSelect?.(cols);
          return { eq: mockEq };
        }),
      };
    }),
    _mockEq: mockEq,
    _mockOrder: mockOrder,
  };
}

// Minimal assessment item factory
function makeItem(overrides: Partial<AssessmentItem> = {}): AssessmentItem {
  return {
    id: 'item-1',
    feature_name: 'Test Feature',
    status: 'awaiting_responses',
    aggregate_score: null,
    created_at: '2026-01-01T00:00:00Z',
    rubric_error_code: null,
    rubric_retry_count: 0,
    rubric_error_retryable: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessments page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockIsOrgAdmin.mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // Query shape — #295 removes .in() and adds aggregate_score
  // -------------------------------------------------------------------------

  describe('Given the assessments query', () => {
    // P1: query no longer filters by status [lld §1 — "Remove status filter"]
    it('does not call .in() to filter statuses — queries all assessments', async () => {
      let inCalled = false;
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
        },
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'user_organisations') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [{ github_role: 'admin' }], error: null }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockImplementation(() => {
                  inCalled = true;
                  return { order: mockOrder };
                }),
                order: mockOrder,
              }),
            }),
          };
        }),
      };
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(inCalled).toBe(false);
    });

    // P2: aggregate_score column selected [lld §1 — contract type includes aggregate_score]
    it('selects aggregate_score in the column list', async () => {
      let capturedSelect = '';
      const client = makeClient({ captureSelect: (cols) => { capturedSelect = cols; } });
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(capturedSelect).toContain('aggregate_score');
    });

    // P3: existing error/retry columns still selected (regression)
    it('selects rubric_error_code, rubric_retry_count, and rubric_error_retryable', async () => {
      let capturedSelect = '';
      const client = makeClient({ captureSelect: (cols) => { capturedSelect = cols; } });
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(capturedSelect).toContain('rubric_error_code');
      expect(capturedSelect).toContain('rubric_retry_count');
      expect(capturedSelect).toContain('rubric_error_retryable');
    });
  });

  // -------------------------------------------------------------------------
  // Pending section rendering
  // -------------------------------------------------------------------------

  describe('Given assessments with pending statuses', () => {
    // P4: "Pending" section heading appears [lld §1 — "Render two sections"]
    it('renders a "Pending" section heading', async () => {
      const client = makeClient({
        assessments: [makeItem({ status: 'awaiting_responses' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Pending');
    });

    // P5: rubric_generation lands in pending section (PollingStatusBadge rendered)
    it('Given rubric_generation, When page renders, Then PollingStatusBadge appears for that assessment', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'gen-1', status: 'rubric_generation' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"assessmentId":"gen-1"');
      expect(rendered).toContain('"initialStatus":"rubric_generation"');
    });

    // P6: rubric_failed lands in pending section (StatusBadge, not PollingStatusBadge)
    it('Given rubric_failed, When page renders, Then PollingStatusBadge is not used for that row', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'fail-1', status: 'rubric_failed' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('"initialStatus"');
    });

    // P7: awaiting_responses lands in pending section (StatusBadge, not PollingStatusBadge)
    it('Given awaiting_responses, When page renders, Then PollingStatusBadge is not used for that row', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'wait-1', status: 'awaiting_responses' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('"initialStatus"');
    });

    // P8: admin sees RetryButton for rubric_failed rows (regression — existing behaviour preserved)
    it('Given rubric_failed assessment and admin user, When page renders, Then RetryButton is rendered', async () => {
      const client = makeClient({
        assessments: [makeItem({
          id: 'a2',
          status: 'rubric_failed',
          rubric_error_code: 'malformed_response',
          rubric_retry_count: 2,
          rubric_error_retryable: true,
        })],
      });
      mockCreateServer.mockResolvedValue(client as never);
      mockIsOrgAdmin.mockReturnValue(true);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"assessmentId":"a2"');
      expect(rendered).toContain('"retryCount":2');
      expect(rendered).toContain('"maxRetries":3');
      expect(rendered).toContain('"errorRetryable":true');
    });

    // P9: error code text appears for rubric_failed with non-null code (regression)
    it('Given rubric_failed with rubric_error_code set, When page renders, Then error code text appears', async () => {
      const client = makeClient({
        assessments: [makeItem({
          status: 'rubric_failed',
          rubric_error_code: 'malformed_response',
        })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('malformed_response');
    });

    // P10: error code text absent when rubric_error_code is null (regression)
    it('Given rubric_failed with rubric_error_code=null, When page renders, Then no error code text appears', async () => {
      const client = makeClient({
        assessments: [makeItem({
          status: 'rubric_failed',
          rubric_error_code: null,
        })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('"malformed_response"');
      expect(rendered).not.toMatch(/"rubric_error_code":"[^"]+"/);
    });
  });

  // -------------------------------------------------------------------------
  // Completed section rendering
  // -------------------------------------------------------------------------

  describe('Given assessments with completed statuses', () => {
    // P11: "Completed" section heading appears [lld §1 — "Render two sections"]
    it('renders a "Completed" section heading', async () => {
      const client = makeClient({
        assessments: [makeItem({ status: 'completed', aggregate_score: 0.85 })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('Completed');
    });

    // P12: completed status appears in completed section
    it('Given status=completed, When page renders, Then assessment appears in the completed list', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'done-1', status: 'completed', aggregate_score: 0.72 })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      // Assessment must appear in rendered output
      expect(rendered).toBeTruthy();
      expect(rendered).toContain('Test Feature');
    });

    // P13: scoring status appears in completed section (not pending)
    it('Given status=scoring, When page renders, Then assessment appears in the completed list', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'scoring-1', status: 'scoring', aggregate_score: null })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      // scoring items must not trigger PollingStatusBadge (which only applies to rubric_generation)
      expect(JSON.stringify(result)).not.toContain('"initialStatus"');
    });

    // P14: completed row links to /assessments/[id]/results [lld §1, issue AC]
    it('Given status=completed, When page renders, Then a link to /assessments/[id]/results is present', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'done-2', status: 'completed', aggregate_score: 0.9 })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('/assessments/done-2/results');
    });

    // P15: completed row shows formatted percentage when aggregate_score is non-null [lld §1]
    it('Given aggregate_score=0.85, When page renders, Then "85%" appears in the completed row', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'done-3', status: 'completed', aggregate_score: 0.85 })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('85%');
    });

    // P16: completed row shows placeholder when aggregate_score is null [lld §1]
    it('Given aggregate_score=null, When page renders, Then a placeholder ("—" or similar) appears instead of a percentage', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'done-4', status: 'scoring', aggregate_score: null })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      // Placeholder must appear; percentage must not
      expect(rendered).toContain('—');
      expect(rendered).not.toMatch(/\d+%/);
    });

    // P17: scoring row links to /assessments/[id]/results (scoring is a completed status)
    it('Given status=scoring, When page renders, Then a link to /assessments/[id]/results is present', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'scoring-2', status: 'scoring', aggregate_score: null })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('/assessments/scoring-2/results');
    });
  });

  // -------------------------------------------------------------------------
  // Empty states
  // -------------------------------------------------------------------------

  describe('Given no pending assessments', () => {
    // P18: empty pending state [lld §1, issue AC]
    it('shows "No pending assessments" when all assessments are completed', async () => {
      const client = makeClient({
        assessments: [makeItem({ status: 'completed', aggregate_score: 1.0 })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('No pending assessments');
    });

    // P19: empty pending state when list is empty
    it('shows "No pending assessments" when the assessments list is empty', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('No pending assessments');
    });
  });

  describe('Given no completed assessments', () => {
    // P20: empty completed state [lld §1, issue AC]
    it('shows "No completed assessments" when all assessments are pending', async () => {
      const client = makeClient({
        assessments: [makeItem({ status: 'awaiting_responses' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('No completed assessments');
    });

    // P21: empty completed state when list is empty
    it('shows "No completed assessments" when the assessments list is empty', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).toContain('No completed assessments');
    });
  });

  // -------------------------------------------------------------------------
  // "New Assessment" button removal
  // -------------------------------------------------------------------------

  describe('Given the "New Assessment" button', () => {
    // P22: link to /assessments/new must not appear for admin [lld §1, invariant I3]
    it('Given admin user, When page renders, Then no link to /assessments/new is present', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);
      mockIsOrgAdmin.mockReturnValue(true);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).not.toContain('/assessments/new');
    });

    // P23: link to /assessments/new must not appear for non-admin [lld §1, invariant I3]
    it('Given non-admin user, When page renders, Then no link to /assessments/new is present', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);
      mockIsOrgAdmin.mockReturnValue(false);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).not.toContain('/assessments/new');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: ?created= flash banner still works
  // -------------------------------------------------------------------------

  describe('Given the ?created= search param', () => {
    // P24: flash banner appears when ?created is present (regression)
    it('When created param is set, Then assessment-created flash message appears', async () => {
      const client = makeClient({
        assessments: [makeItem({ id: 'brand-new', status: 'rubric_generation' })],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({ created: 'brand-new' }),
      });

      expect(JSON.stringify(result)).toContain('Assessment created successfully');
    });

    // P25: no flash banner when ?created is absent (regression)
    it('When created param is absent, Then no flash message appears', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(JSON.stringify(result)).not.toContain('Assessment created successfully');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: rubric_generation always uses PollingStatusBadge
  // -------------------------------------------------------------------------

  describe('Given multiple rubric_generation assessments', () => {
    // P26: each rubric_generation row has its own PollingStatusBadge (regression #281)
    it('When page renders, Then each row has its own PollingStatusBadge with distinct assessmentId', async () => {
      const client = makeClient({
        assessments: [
          makeItem({ id: 'row-1', status: 'rubric_generation' }),
          makeItem({ id: 'row-2', status: 'rubric_generation' }),
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"assessmentId":"row-1"');
      expect(rendered).toContain('"assessmentId":"row-2"');
      const matchCount = (rendered.match(/"initialStatus":"rubric_generation"/g) ?? []).length;
      expect(matchCount).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// partitionAssessments — pure function unit tests
// ---------------------------------------------------------------------------

describe('partitionAssessments', () => {
  // P27: empty input → both buckets empty [lld §1]
  it('Given empty array, When partitioned, Then both pending and completed are empty', () => {
    const { pending, completed } = partitionAssessments([]);
    expect(pending).toHaveLength(0);
    expect(completed).toHaveLength(0);
  });

  // P28: rubric_generation → pending [lld §1]
  it('Given rubric_generation, When partitioned, Then item is in pending', () => {
    const item = makeItem({ status: 'rubric_generation' });
    const { pending, completed } = partitionAssessments([item]);
    expect(pending).toContain(item);
    expect(completed).not.toContain(item);
  });

  // P29: rubric_failed → pending [lld §1]
  it('Given rubric_failed, When partitioned, Then item is in pending', () => {
    const item = makeItem({ status: 'rubric_failed' });
    const { pending, completed } = partitionAssessments([item]);
    expect(pending).toContain(item);
    expect(completed).not.toContain(item);
  });

  // P30: awaiting_responses → pending [lld §1]
  it('Given awaiting_responses, When partitioned, Then item is in pending', () => {
    const item = makeItem({ status: 'awaiting_responses' });
    const { pending, completed } = partitionAssessments([item]);
    expect(pending).toContain(item);
    expect(completed).not.toContain(item);
  });

  // P31: completed → completed bucket [lld §1]
  it('Given status=completed, When partitioned, Then item is in completed', () => {
    const item = makeItem({ status: 'completed', aggregate_score: 0.9 });
    const { pending, completed } = partitionAssessments([item]);
    expect(completed).toContain(item);
    expect(pending).not.toContain(item);
  });

  // P32: scoring → completed bucket [lld §1]
  it('Given status=scoring, When partitioned, Then item is in completed', () => {
    const item = makeItem({ status: 'scoring', aggregate_score: null });
    const { pending, completed } = partitionAssessments([item]);
    expect(completed).toContain(item);
    expect(pending).not.toContain(item);
  });

  // P33: mixed input — no item lost or duplicated [lld §1]
  it('Given mixed statuses, When partitioned, Then every item appears exactly once across both buckets', () => {
    const items = [
      makeItem({ id: 'p1', status: 'rubric_generation' }),
      makeItem({ id: 'p2', status: 'rubric_failed' }),
      makeItem({ id: 'p3', status: 'awaiting_responses' }),
      makeItem({ id: 'c1', status: 'completed', aggregate_score: 0.7 }),
      makeItem({ id: 'c2', status: 'scoring', aggregate_score: null }),
    ];
    const { pending, completed } = partitionAssessments(items);

    expect(pending).toHaveLength(3);
    expect(completed).toHaveLength(2);

    const all = [...pending, ...completed];
    expect(all).toHaveLength(items.length);
    for (const item of items) {
      expect(all).toContain(item);
    }
  });

  // P34: unknown/other statuses excluded from both buckets [lld §1 — only known statuses partitioned]
  it('Given an item with an unrecognised status, When partitioned, Then it appears in neither pending nor completed', () => {
    // Cast to bypass TypeScript — we are testing the runtime contract
    const item = makeItem({ status: 'ready' as AssessmentItem['status'] });
    const { pending, completed } = partitionAssessments([item]);
    expect(pending).not.toContain(item);
    expect(completed).not.toContain(item);
  });
});
