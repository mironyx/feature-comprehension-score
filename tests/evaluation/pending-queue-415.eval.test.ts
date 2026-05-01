// Adversarial evaluation tests for issue #415 — My Pending Assessments.
// Evaluator: feature-evaluator agent.
// Gap covered: the LLD §B.6 selects rubric_error_* fields specifically for
// conditional status badge rendering. The main test file (pending-queue.test.ts)
// does not verify that a `rubric_generation` item routes to PollingStatusBadge
// rather than StatusBadge inside the ProjectFilter list. This is a spec promise
// (project-filter.tsx lines 80-84 branch on a.status === 'rubric_generation').

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports
// ---------------------------------------------------------------------------

// Stub PollingStatusBadge so we can track when it's invoked without needing
// useStatusPoll / useRouter hooks in the test environment.
vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: vi.fn(({ assessmentId, initialStatus }: { assessmentId: string; initialStatus: string }) =>
    JSON.stringify({ pollingBadge: true, assessmentId, initialStatus }),
  ),
}));

// Stub assessment-status StatusBadge for symmetry.
vi.mock('@/app/(authenticated)/assessments/assessment-status', () => ({
  StatusBadge: vi.fn(({ status }: { status: string }) =>
    JSON.stringify({ statusBadge: true, status }),
  ),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn((initial: unknown) => [initial, vi.fn()]) };
});

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    JSON.stringify({ link: href, children }),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: unknown }) => children,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { PollingStatusBadge } from '@/app/(authenticated)/assessments/polling-status-badge';

// ---------------------------------------------------------------------------
// Helpers — reuse the same factory shape as pending-queue.test.ts
// ---------------------------------------------------------------------------

const PROJECT_A_ID = 'proj-aaa-0001';
const PROJECT_A_NAME = 'Alpha Project';

function makePendingItem(
  assessmentId: string,
  status: string,
) {
  return {
    href: `/projects/${PROJECT_A_ID}/assessments/${assessmentId}`,
    assessments: {
      id: assessmentId,
      status,
      feature_name: 'Test Feature',
      feature_description: null,
      rubric_error_code: null,
      rubric_retry_count: 0,
      rubric_error_retryable: null,
      project_id: PROJECT_A_ID,
      projects: { id: PROJECT_A_ID, name: PROJECT_A_NAME },
    },
  };
}

const singleProject = [{ id: PROJECT_A_ID, name: PROJECT_A_NAME }];

// ---------------------------------------------------------------------------
// Adversarial test — status badge routing inside ProjectFilter list
// ---------------------------------------------------------------------------
//
// Gap: pending-queue.test.ts verifies the query predicates and link URLs but
// does not verify that the status badge selection (PollingStatusBadge vs
// StatusBadge) matches the rubric_generation branch in project-filter.tsx.
// Spec reference: lld §B.6 — the query selects rubric_error_code,
// rubric_retry_count, rubric_error_retryable precisely for this rendering path.

describe('ProjectFilter — status badge routing [lld §B.6, gap]', () => {
  describe('Given an item with status rubric_generation', () => {
    it('When rendered, Then PollingStatusBadge is used (not StatusBadge)', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      const item = makePendingItem('aid-rubric', 'rubric_generation');

      renderToStaticMarkup(
        ProjectFilter({ items: [item], projects: singleProject }) as ReactElement,
      );

      const calls = vi.mocked(PollingStatusBadge).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toMatchObject({ assessmentId: 'aid-rubric', initialStatus: 'rubric_generation' });
    });
  });

  describe('Given an item with status awaiting_responses', () => {
    it('When rendered, Then PollingStatusBadge is NOT used', async () => {
      const { ProjectFilter } = await import(
        '@/app/(authenticated)/assessments/project-filter'
      );
      vi.mocked(PollingStatusBadge).mockClear();
      const item = makePendingItem('aid-awaiting', 'awaiting_responses');

      renderToStaticMarkup(
        ProjectFilter({ items: [item], projects: singleProject }) as ReactElement,
      );

      expect(vi.mocked(PollingStatusBadge)).not.toHaveBeenCalled();
    });
  });
});
