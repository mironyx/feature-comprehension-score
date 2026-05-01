// Tests for the project/assessment mismatch guard on project-scoped assessment pages.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.3
// Requirements: docs/requirements/v11-requirements.md §Epic 2, Stories 2.4, 4.5 (Invariant I4)
// Issue: #412

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockNotFound = vi.mocked(notFound);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'project-aaa';
const OTHER_PROJECT_ID = 'project-bbb';
const ASSESSMENT_ID = 'assessment-xyz';

// ---------------------------------------------------------------------------
// Supabase client mock builder
//
// Provides a chainable builder that satisfies:
//   supabase.from('assessments').select(...).eq(...).maybeSingle()
// The detail page also calls supabase.auth.getUser() before the guard.
// ---------------------------------------------------------------------------

function makeSupabaseClient(row: { id: string; project_id: string } | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-001', user_metadata: { provider_id: '99999' } } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  };
}

function makeParams(projectId: string, aid: string) {
  return Promise.resolve({ id: projectId, aid });
}

// ---------------------------------------------------------------------------
// Tests — Project-scoped assessment URL guard (Issue #412)
// ---------------------------------------------------------------------------

describe('Project-scoped assessment URL guard (Issue #412)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // Detail page — /projects/[id]/assessments/[aid]
  // -------------------------------------------------------------------------

  describe('Detail page — /projects/[id]/assessments/[aid]', () => {
    async function importDetailPage() {
      const { default: Page } = await import(
        '@/app/(authenticated)/projects/[id]/assessments/[aid]/page'
      );
      return Page;
    }

    // I4 [lld §B.3, req §Story 2.4]: mismatch → notFound()
    it('returns 404 when assessment.project_id does not match projectId', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseClient({ id: ASSESSMENT_ID, project_id: OTHER_PROJECT_ID }) as never,
      );
      const Page = await importDetailPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });

    // I4 [lld §B.3, req §Story 2.4]: null row → notFound()
    it('returns 404 when assessment does not exist (null row)', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseClient(null) as never);
      const Page = await importDetailPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });

    // I4 [lld §B.3, req §Story 2.4]: matching project_id → guard passes, notFound NOT called
    it('does NOT call notFound when assessment.project_id === projectId', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseClient({ id: ASSESSMENT_ID, project_id: PROJECT_ID }) as never,
      );
      const Page = await importDetailPage();
      // The page renders content beyond the guard (may throw for other reasons);
      // we only assert that notFound was not called.
      try {
        await Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) });
      } catch {
        // Any throw other than NEXT_NOT_FOUND is acceptable — the guard passed.
      }
      expect(mockNotFound).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Results page — /projects/[id]/assessments/[aid]/results
  // -------------------------------------------------------------------------

  describe('Results page — /projects/[id]/assessments/[aid]/results', () => {
    async function importResultsPage() {
      const { default: Page } = await import(
        '@/app/(authenticated)/projects/[id]/assessments/[aid]/results/page'
      );
      return Page;
    }

    // I4 [lld §B.3, req §Story 2.4]: mismatch → notFound()
    it('returns 404 when assessment.project_id does not match projectId', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseClient({ id: ASSESSMENT_ID, project_id: OTHER_PROJECT_ID }) as never,
      );
      const Page = await importResultsPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });

    // I4 [lld §B.3, req §Story 2.4]: null row → notFound()
    it('returns 404 when assessment does not exist (null row)', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseClient(null) as never);
      const Page = await importResultsPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Submitted page — /projects/[id]/assessments/[aid]/submitted
  // -------------------------------------------------------------------------

  describe('Submitted page — /projects/[id]/assessments/[aid]/submitted', () => {
    async function importSubmittedPage() {
      const { default: Page } = await import(
        '@/app/(authenticated)/projects/[id]/assessments/[aid]/submitted/page'
      );
      return Page;
    }

    // I4 [lld §B.3, req §Story 2.4]: mismatch → notFound()
    it('returns 404 when assessment.project_id does not match projectId', async () => {
      mockCreateServer.mockResolvedValue(
        makeSupabaseClient({ id: ASSESSMENT_ID, project_id: OTHER_PROJECT_ID }) as never,
      );
      const Page = await importSubmittedPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });

    // I4 [lld §B.3, req §Story 2.4]: null row → notFound()
    it('returns 404 when assessment does not exist (null row)', async () => {
      mockCreateServer.mockResolvedValue(makeSupabaseClient(null) as never);
      const Page = await importSubmittedPage();
      await expect(Page({ params: makeParams(PROJECT_ID, ASSESSMENT_ID) })).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      expect(mockNotFound).toHaveBeenCalled();
    });
  });
});
