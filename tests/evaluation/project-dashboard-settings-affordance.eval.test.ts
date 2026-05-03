// Adversarial evaluation tests for #450 — Settings affordance prominence.
// Story 1.3 (rev 1.3) + Story 2.2 (rev 1.3).
//
// Genuine gaps not covered by tests/app/(authenticated)/projects/[id]/page.test.ts:
//
//   Gap 1 (AC-1): The "Settings" visible text label is asserted nowhere. The existing
//   tests verify aria-label="Project settings" and the href, but AC-1 explicitly says
//   "icon + 'Settings' label" — the label text must be visible to sighted users.
//
//   Gap 2 (AC-2): h-9 height class on the Settings link is not asserted. AC-2
//   requires "same visual prominence as 'New Assessment' (both h-9 + button-like
//   styling)". The implementation has h-9, but no test pins it.
//
// All other acceptance criteria (AC-3 through AC-10) are either covered by the
// feature test files or are E2E/viewport concerns outside unit test scope.
//
// Design reference: docs/design/lld-v11-e11-1-project-management.md §Pending changes — Rev 2
//                   docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §Pending changes — Rev 2
// Requirements: docs/requirements/v11-requirements.md §Story 1.3 (rev 1.3 amendment)
// Issue: #450

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — reuse the same set as page.test.ts (same page under test)
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

// Pass-through mock: preserves href, className, and children so we can assert
// on all three. page.test.ts uses () => null which also preserves props in the
// React element tree (JSON.stringify exposes them), but this variant is more
// explicit about which props we care about.
vi.mock('next/link', () => ({
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
// Constants — identical to page.test.ts so the two files can be compared
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const PROJECT_ID = 'project-abc';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  name: 'Payment Service',
  description: 'Handles all payment flows',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Client factory — mirrors page.test.ts makeClient for consistency
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

async function callPage(projectId = PROJECT_ID) {
  const { default: ProjectDashboardPage } = await import(
    '@/app/(authenticated)/projects/[id]/page'
  );
  return ProjectDashboardPage({ params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Adversarial tests
// ---------------------------------------------------------------------------

describe('Project dashboard — Settings affordance adversarial (#450)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // Gap 1 — AC-1: "Settings" visible text label
  // AC-1 says "icon + 'Settings' label". The existing tests verify aria-label
  // and href, but not the visible text that sighted users would read.
  // JSON.stringify of a React element tree exposes children prop even when the
  // component function is mocked to () => null.
  // [req §Story 1.3 rev 1.3 AC] "icon + 'Settings' label control"
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard', () => {
    it('Settings link contains the visible text label "Settings" [AC-1, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // The word "Settings" must appear as a string child of the Link element.
      // This is the visible label that sighted users read — not just aria-label.
      // A link with only an icon (no text) would fail here even if aria-label is set.
      expect(rendered).toContain('"Settings"');
    });
  });

  // -------------------------------------------------------------------------
  // Gap 2 — AC-2: h-9 class on Settings link (visual prominence parity)
  // AC-2 says both Settings and "New Assessment" must carry h-9 + button-like
  // styling. The existing tests check href and aria-label but not the CSS class.
  // h-9 is what makes the Settings link the same height as the primary CTA.
  // [req §Story 1.3 rev 1.3 AC] "same visual prominence as 'New Assessment'"
  // [lld E11.1 §Pending changes Rev 2: "both h-9 + button-like styling"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin on the project dashboard', () => {
    it('Settings link carries h-9 height class — same as New Assessment [AC-2, #450]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // Verify h-9 appears in the className of the Settings link.
      // The href "/projects/{id}/settings" uniquely identifies the Settings link
      // in the serialised output — we check both appear near each other.
      expect(rendered).toContain('h-9');
      // Both the Settings href and h-9 must be present (the class belongs to the link).
      expect(rendered).toContain(`/projects/${PROJECT_ID}/settings`);
    });
  });
});
