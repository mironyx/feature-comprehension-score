// Tests for /assessments page — query filter includes rubric_generation.
// Design reference: docs/design/lld-phase-2-demo-ready.md §2a.1
// Issue: #130

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
  PollingStatusBadge: ({ assessmentId }: { assessmentId: string }) =>
    `PollingStatusBadge:${assessmentId}`,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockIsOrgAdmin = vi.mocked(isOrgAdmin);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';

function makeClient({
  assessments = [],
}: {
  assessments?: unknown[];
} = {}) {
  const mockIn = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({
      data: assessments,
      error: null,
    }),
  });

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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: mockIn,
          }),
        }),
      };
    }),
    _mockIn: mockIn,
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

  describe('Given visible assessments', () => {
    it('queries rubric_generation, rubric_failed, and awaiting_responses', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(client._mockIn).toHaveBeenCalledWith(
        'status',
        ['rubric_generation', 'rubric_failed', 'awaiting_responses'],
      );
    });

    // Property 1 — query selects the three new error/retry columns [lld §18.2]
    it('selects rubric_error_code, rubric_retry_count, and rubric_error_retryable from assessments', async () => {
      let capturedSelectArg = '';
      const mockIn = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
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
            select: vi.fn().mockImplementation((cols: string) => {
              capturedSelectArg = cols;
              return { eq: vi.fn().mockReturnValue({ in: mockIn }) };
            }),
          };
        }),
        _mockIn: mockIn,
      };
      mockCreateServer.mockResolvedValue(client as never);

      await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(capturedSelectArg).toContain('rubric_error_code');
      expect(capturedSelectArg).toContain('rubric_retry_count');
      expect(capturedSelectArg).toContain('rubric_error_retryable');
    });

    it('renders assessments as a list', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'a1',
            feature_name: 'Feature A',
            status: 'awaiting_responses',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });

      expect(result).toBeTruthy();
    });

    it('renders retry button for rubric_failed assessments when admin', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'a1',
            feature_name: 'Failed Feature',
            status: 'rubric_failed',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);
      mockIsOrgAdmin.mockReturnValue(true);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('assessmentId');
    });

    // Property 5 — RetryButton receives correct guardrail props [lld §18.2]
    it('passes retryCount, maxRetries=3, and errorRetryable to RetryButton', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'a2',
            feature_name: 'Failed Feature',
            status: 'rubric_failed',
            created_at: '2026-01-01',
            rubric_error_code: 'malformed_response',
            rubric_retry_count: 2,
            rubric_error_retryable: true,
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);
      mockIsOrgAdmin.mockReturnValue(true);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      // assessmentId forwarded from assessment row
      expect(rendered).toContain('"assessmentId":"a2"');
      // retryCount from rubric_retry_count
      expect(rendered).toContain('"retryCount":2');
      // maxRetries is always 3 (MAX_RETRIES constant)
      expect(rendered).toContain('"maxRetries":3');
      // errorRetryable from rubric_error_retryable
      expect(rendered).toContain('"errorRetryable":true');
    });

    it('uses PollingStatusBadge for newly created rubric_generation assessment', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'new-assessment',
            feature_name: 'New Feature',
            status: 'rubric_generation',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({ created: 'new-assessment' }),
      });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"initialStatus":"rubric_generation"');
      expect(rendered).toContain('"assessmentId":"new-assessment"');
    });

    // Regression test for #281 — polling was gated on ?created=<id> param;
    // a rubric_generation row without the param fell through to static StatusBadge.
    it('uses PollingStatusBadge for rubric_generation assessment even without created param', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'a1',
            feature_name: 'Existing Feature',
            status: 'rubric_generation',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({}),
      });
      const rendered = JSON.stringify(result);

      // Property A: PollingStatusBadge must be rendered for any rubric_generation row,
      // regardless of whether ?created is present.
      expect(rendered).toContain('"assessmentId":"a1"');
      expect(rendered).toContain('"initialStatus":"rubric_generation"');
    });

    // Property C: multiple rubric_generation rows each get their own PollingStatusBadge.
    it('Given multiple rubric_generation assessments, When page renders, Then each row has its own PollingStatusBadge with distinct assessmentId', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'row-1',
            feature_name: 'Feature One',
            status: 'rubric_generation',
            created_at: '2026-01-01',
          },
          {
            id: 'row-2',
            feature_name: 'Feature Two',
            status: 'rubric_generation',
            created_at: '2026-01-02',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({}),
      });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"assessmentId":"row-1"');
      expect(rendered).toContain('"assessmentId":"row-2"');
      // Both must carry initialStatus, confirming PollingStatusBadge is used for each.
      const matchCount = (rendered.match(/"initialStatus":"rubric_generation"/g) ?? []).length;
      expect(matchCount).toBe(2);
    });

    // Property B: terminal-status rows render static StatusBadge, NOT PollingStatusBadge.
    it('Given awaiting_responses assessment, When page renders, Then PollingStatusBadge is not used for that row', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'terminal-1',
            feature_name: 'Ready Feature',
            status: 'awaiting_responses',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({}),
      });
      const rendered = JSON.stringify(result);

      // No PollingStatusBadge props should appear for a non-rubric_generation row.
      expect(rendered).not.toContain('"initialStatus"');
    });

    it('Given rubric_failed assessment, When page renders, Then PollingStatusBadge is not used for that row', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'failed-1',
            feature_name: 'Failed Feature',
            status: 'rubric_failed',
            created_at: '2026-01-01',
            rubric_error_code: null,
            rubric_retry_count: 0,
            rubric_error_retryable: null,
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({}),
      });
      const rendered = JSON.stringify(result);

      expect(rendered).not.toContain('"initialStatus"');
    });

    // Property D: the ?created param still triggers the flash message (unchanged behaviour).
    it('Given created param is set, When page renders, Then assessment-created flash message appears', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'brand-new',
            feature_name: 'New Feature',
            status: 'rubric_generation',
            created_at: '2026-01-01',
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({ created: 'brand-new' }),
      });
      const rendered = JSON.stringify(result);

      // The flash message text must be present when ?created is supplied.
      expect(rendered).toContain('Assessment created successfully');
    });

    it('shows empty message when no assessments', async () => {
      const client = makeClient({ assessments: [] });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('No pending assessments');
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2, 3, 4 — rubric_failed error code display [lld §18.2]
  // ---------------------------------------------------------------------------

  describe('rubric_failed error display', () => {
    // Property 2 — error code string is visible when status=rubric_failed and code is set
    it('Given rubric_failed with rubric_error_code set, When page renders, Then error code text appears in the output', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'b1',
            feature_name: 'Bad Generation',
            status: 'rubric_failed',
            created_at: '2026-01-01',
            rubric_error_code: 'malformed_response',
            rubric_retry_count: 0,
            rubric_error_retryable: true,
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('malformed_response');
    });

    // Property 3 — no error code text when rubric_error_code is null
    it('Given rubric_failed with rubric_error_code=null, When page renders, Then no error code text appears', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'b2',
            feature_name: 'Bad Generation',
            status: 'rubric_failed',
            created_at: '2026-01-01',
            rubric_error_code: null,
            rubric_retry_count: 0,
            rubric_error_retryable: null,
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      // The rendered output should not contain any error code literal (null encodes as JSON null)
      // We verify none of the known error-code sentinel strings appear as text content
      expect(rendered).not.toContain('"malformed_response"');
      // And the rubric_error_code field value itself should be null in output
      expect(rendered).not.toMatch(/"rubric_error_code":"[^"]+"/);
    });

    // Property 4 — error code display is gated on status=rubric_failed; non-failed rows suppress it
    it('Given awaiting_responses with a non-null rubric_error_code (stale data), When page renders, Then error code text is not shown', async () => {
      const client = makeClient({
        assessments: [
          {
            id: 'b3',
            feature_name: 'Active Assessment',
            status: 'awaiting_responses',
            created_at: '2026-01-01',
            rubric_error_code: 'malformed_response',
            rubric_retry_count: 0,
            rubric_error_retryable: null,
          },
        ],
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await AssessmentsPage({ searchParams: Promise.resolve({}) });
      const rendered = JSON.stringify(result);

      // The error code must not appear as a rendered text node for a non-failed assessment
      // (the RetryButton is also not rendered for non-rubric_failed rows)
      expect(rendered).not.toContain('"malformed_response"');
    });
  });
});
