// Adversarial tests for #296 — Organisation Assessment Overview.
// Covers two genuine gaps not addressed by the feature test file:
//   1. formatFeature: double-null (feature_name=null, pr_number=null) → '—'
//   2. loadOrgAssessmentsOverview: query uses limit(50) and order(created_at DESC)
// Design reference: docs/design/lld-nav-results.md §2

import { describe, it, expect, vi } from 'vitest';

// AssessmentOverviewTable became a 'use client' component in #441 (added useState
// for the project filter). Stub useState so the component can be called as a plain
// function via vi.importActual in a node environment.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn((initial: unknown) => [initial, vi.fn()]), useEffect: vi.fn() };
});

// Match the mock pattern used in the sibling test file so JSX serialisation
// via JSON.stringify works the same way (plain objects, no circular refs).
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

// StatusBadge also uses JSX — stub it to a plain object so no circular refs.
vi.mock('@/components/ui/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => ({
    type: 'status-badge',
    props: { status },
  }),
}));

// ---------------------------------------------------------------------------
// Gap 1 — AssessmentOverviewTable: double-null feature/PR column
// ---------------------------------------------------------------------------
// The existing tests cover feature_name present, and feature_name=null with
// pr_number set. The LLD says "falls back to PR #${pr_number} when feature_name
// is null" but does not define the double-null case. The implementation returns
// '—' — verify it does not crash or produce undefined/null in the rendered tree.

describe('AssessmentOverviewTable — double-null feature/PR edge', () => {
  async function renderTable(assessments: Parameters<typeof import('@/app/(authenticated)/organisation/assessment-overview-table')['AssessmentOverviewTable']>[0]['assessments']) {
    const { AssessmentOverviewTable } = await vi.importActual<
      typeof import('@/app/(authenticated)/organisation/assessment-overview-table')
    >('@/app/(authenticated)/organisation/assessment-overview-table');
    return AssessmentOverviewTable({ assessments });
  }

  it('renders an em-dash when both feature_name and pr_number are null', async () => {
    // Given an assessment with no feature name and no PR number
    const item = {
      id: 'assess-null-null',
      type: 'fcs' as const,
      status: 'completed' as const,
      repository_name: 'acme/backend',
      pr_number: null,
      feature_name: null,
      aggregate_score: null,
      conclusion: null,
      config_comprehension_depth: null,
      participant_count: 2,
      completed_count: 1,
      created_at: '2026-04-01T10:00:00Z',
      rubric_error_code: null,
      rubric_retry_count: 0,
      rubric_error_retryable: null,
      project_id: null,
      project_name: null,
    };
    const result = await renderTable([item]);
    const rendered = JSON.stringify(result);
    // Must not contain 'undefined' or 'null' as rendered text
    expect(rendered).not.toContain('"undefined"');
    expect(rendered).not.toContain('"null"');
    // Must render the fallback dash
    expect(rendered).toContain('—');
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — loadOrgAssessmentsOverview: query contract (limit=50, order DESC)
// ---------------------------------------------------------------------------
// The LLD specifies limit=50 and created_at DESC as explicit query constraints.
// The implementation encodes this as ROW_LIMIT = 50 and .order/.limit calls.
// No existing test verifies these calls are made. We mock the supabase client
// passed to the loader and assert the query is constructed correctly.

vi.mock('@/app/api/assessments/helpers', () => ({
  fetchParticipantCounts: vi.fn().mockResolvedValue({}),
  toListItem: vi.fn().mockReturnValue({
    id: 'x', type: 'fcs', status: 'completed', repository_name: 'r',
    pr_number: null, feature_name: null, aggregate_score: null,
    conclusion: null, config_comprehension_depth: null,
    participant_count: 0, completed_count: 0, created_at: '2026-01-01T00:00:00Z',
    rubric_error_code: null, rubric_retry_count: 0, rubric_error_retryable: null,
  }),
}));

describe('loadOrgAssessmentsOverview — query contract', () => {
  function makeChain() {
    const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderMock = vi.fn(() => ({ limit: limitMock }));
    const eqMock = vi.fn(() => ({ order: orderMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return { fromMock, selectMock, eqMock, orderMock, limitMock };
  }

  it('queries assessments with limit 50', async () => {
    const { fromMock, limitMock } = makeChain();
    const supabase = { from: fromMock } as never;

    const { loadOrgAssessmentsOverview } = await import(
      '@/app/(authenticated)/organisation/load-assessments'
    );
    await loadOrgAssessmentsOverview(supabase, 'org-001');

    expect(limitMock).toHaveBeenCalledWith(50);
  });

  it('orders assessments by created_at descending', async () => {
    const { fromMock, orderMock } = makeChain();
    const supabase = { from: fromMock } as never;

    const { loadOrgAssessmentsOverview } = await import(
      '@/app/(authenticated)/organisation/load-assessments'
    );
    await loadOrgAssessmentsOverview(supabase, 'org-001');

    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('scopes query to the provided org_id', async () => {
    const { fromMock, eqMock } = makeChain();
    const supabase = { from: fromMock } as never;

    const { loadOrgAssessmentsOverview } = await import(
      '@/app/(authenticated)/organisation/load-assessments'
    );
    await loadOrgAssessmentsOverview(supabase, 'org-xyz');

    expect(eqMock).toHaveBeenCalledWith('org_id', 'org-xyz');
  });
});
