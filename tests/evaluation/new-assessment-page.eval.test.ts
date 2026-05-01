// Evaluation tests for issue #413 — /projects/[id]/assessments/new
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.4
//
// Gap: AC-6 — "The dashboard 'New assessment' CTA (currently disabled placeholder
// per #399) becomes enabled."
//
// The test-author covered 6 BDD specs for the new page and form. The one criterion
// not covered is that the dashboard page (also a changed_file for #413) renders an
// active, navigable link to /projects/${id}/assessments/new — not a disabled
// placeholder or href="#".
//
// Strategy: reuse the same mock pattern as tests/app/(authenticated)/projects/dashboard-page.test.ts.
// Factories for ProjectDashboardPage are re-declared here because they are module-scoped
// (not exported) in that sibling test file. This file is intentionally kept to one test.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports
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
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/app/(authenticated)/projects/[id]/inline-edit-header', () => ({
  InlineEditHeader: () => null,
}));

vi.mock('@/app/(authenticated)/projects/[id]/delete-button', () => ({
  DeleteButton: () => null,
}));

vi.mock('@/components/ui/page-header', () => ({
  PageHeader: ({ title, action }: { title: string; action: unknown }) =>
    ({ type: 'div', props: { 'data-title': title, children: action } }),
}));

// next/link renders a real React element that contains circular refs when serialised;
// stub it to return a plain serialisable object whose href prop is preserved.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: unknown }) =>
    ({ type: 'a', props: { href, children } }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import ProjectDashboardPage from '@/app/(authenticated)/projects/[id]/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockCookies = vi.mocked(cookies);
const mockGetOrgRole = vi.mocked(getOrgRole);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const PROJECT_ID = 'project-abc';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  name: 'Payment Service',
  description: 'Handles all payment flows',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Factory — mirrors the one in dashboard-page.test.ts
// ---------------------------------------------------------------------------

function makeClient(project: typeof MOCK_PROJECT | null = MOCK_PROJECT) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: project, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-001' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') return { select };
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard CTA — AC-6 (issue #413)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // AC-6: The "New assessment" CTA on the project dashboard becomes enabled.
  // The spec (issue #413) says the link was a disabled placeholder per #399.
  // After T2.4 it must be a live <Link href="/projects/[id]/assessments/new">.
  // [issue #413 AC-6] [lld §B.4 "The dashboard 'New assessment' CTA...becomes enabled"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin viewing the project dashboard', () => {
    it('When the page renders, Then the output contains a link to /projects/${id}/assessments/new', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({
        params: Promise.resolve({ id: PROJECT_ID }),
      });

      const rendered = JSON.stringify(result);
      expect(rendered).toContain(`/projects/${PROJECT_ID}/assessments/new`);
    });
  });
});
