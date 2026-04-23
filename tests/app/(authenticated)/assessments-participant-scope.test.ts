// Regression tests for issue #306: My Assessments page was showing all org assessments
// for admin users instead of only the assessments they personally participate in.
//
// The fix adds an assessment_participants!inner join and filters by user_id in the
// application-layer query (no RLS change required).
//
// Design reference: docs/design/lld-nav-results.md §1
// Requirements: docs/requirements/v1-requirements.md Story 5.4

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must mirror page.test.ts so the same page module resolves
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
  RetryButton: () => null,
}));

vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: () => null,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';
import type { AssessmentItem } from '@/app/(authenticated)/assessments/partition';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockIsOrgAdmin = vi.mocked(isOrgAdmin);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-admin-001';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

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

/**
 * Builds a mock Supabase client that models the post-fix query chain:
 *   .from('assessments')
 *   .select('..., assessment_participants!inner(user_id)')
 *   .eq('org_id', orgId)
 *   .eq('assessment_participants.user_id', user.id)
 *   .order('created_at', { ascending: false })
 *
 * The `captureSelect` callback receives the raw select string.
 * The `captureEqCalls` array accumulates [column, value] pairs from every eq() call
 * on the assessments chain.
 */
function makeClient({
  assessments = [] as unknown[],
  captureSelect,
  captureEqCalls,
}: {
  assessments?: unknown[];
  captureSelect?: (cols: string) => void;
  captureEqCalls?: Array<[string, unknown]>;
} = {}) {
  const mockOrder = vi.fn().mockResolvedValue({ data: assessments, error: null });

  // Each .eq() call on the assessments chain must return an object that exposes
  // both another .eq() and an .order() so the chain composes correctly regardless
  // of how many eq() calls the implementation makes.
  function makeEqChain(): { eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } {
    const chainObj: { eq: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn> } = {
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        captureEqCalls?.push([col, val]);
        return makeEqChain();
      }),
      order: mockOrder,
    };
    return chainObj;
  }

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
      // assessments table
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
// Helpers — reduce duplication across test bodies
// ---------------------------------------------------------------------------

async function renderPage(
  assessments: unknown[] = [],
  admin = true,
  opts: { captureSelect?: (cols: string) => void; captureEqCalls?: Array<[string, unknown]> } = {},
): Promise<string> {
  const client = makeClient({ assessments, ...opts });
  mockCreateServer.mockResolvedValue(client as never);
  mockIsOrgAdmin.mockReturnValue(admin);
  const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('My Assessments page — participant scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockIsOrgAdmin.mockReturnValue(true);
  });

  // -------------------------------------------------------------------------
  // Query shape [issue #306]
  // -------------------------------------------------------------------------

  describe('Given the assessments query', () => {
    it('includes assessment_participants!inner(user_id) so only participant rows are returned', async () => {
      let capturedSelect = '';
      await renderPage([], true, { captureSelect: (cols) => { capturedSelect = cols; } });
      expect(capturedSelect).toContain('assessment_participants!inner(user_id)');
    });

    it('applies eq("assessment_participants.user_id", user.id) to restrict to participants', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], true, { captureEqCalls: eqCalls });
      const filter = eqCalls.find(([col, val]) => col === 'assessment_participants.user_id' && val === USER_ID);
      expect(filter).toBeDefined();
    });

    it('still filters by org_id to restrict to the selected organisation', async () => {
      const eqCalls: Array<[string, unknown]> = [];
      await renderPage([], true, { captureEqCalls: eqCalls });
      const filter = eqCalls.find(([col, val]) => col === 'org_id' && val === ORG_ID);
      expect(filter).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Behavioural: admin sees only assessments they participate in
  // [issue #306 — "Org admin on My Assessments page sees only assessments they participate in"]
  // -------------------------------------------------------------------------

  describe('Given an org admin who is a participant on one assessment but not another', () => {
    it('shows only assessments where the user is a participant, not all org assessments', async () => {
      const rendered = await renderPage([makeItem({ feature_name: 'Feature I Work On' })]);
      expect(rendered).toContain('Feature I Work On');
    });

    it('does not show assessments the admin created but is not a participant of', async () => {
      const rendered = await renderPage([]);
      expect(rendered).toContain('No pending assessments');
      expect(rendered).toContain('No completed assessments');
    });

    it('shows assessments the admin is a participant of', async () => {
      const rendered = await renderPage([makeItem({ feature_name: 'Auth Refactor' })]);
      expect(rendered).toContain('Auth Refactor');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: non-admin participants still see their own assessments
  // [issue #306 — "Non-admin participants still see only their own assessments (no regression)"]
  // -------------------------------------------------------------------------

  describe('Given a non-admin participant', () => {
    it('still sees their own assessments after the participant-scope fix', async () => {
      const rendered = await renderPage([makeItem({ feature_name: 'Backend API Overhaul' })], false);
      expect(rendered).toContain('Backend API Overhaul');
    });

    it('does not see assessments they are not a participant of (DB-level scoping holds for non-admins)', async () => {
      const rendered = await renderPage([], false);
      expect(rendered).toContain('No pending assessments');
      expect(rendered).toContain('No completed assessments');
    });
  });
});
