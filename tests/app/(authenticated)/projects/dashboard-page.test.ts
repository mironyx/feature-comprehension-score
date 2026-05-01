// Tests for /projects/[id] dashboard page — server component access control and rendering.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Requirements: docs/requirements/v11-requirements.md Stories 1.3, 1.5
// Issue: #399
//
// DeleteButton client component tests are in delete-button.test.ts (separate file
// required because vi.mock applies file-wide and this file mocks the module).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Stub child components so JSON.stringify of the React element tree exposes
// prop values for assertion. The page mounts these as JSX elements whose props
// appear in the serialised output even though the function bodies never run.
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { cookies } from 'next/headers';
import ProjectDashboardPage from '@/app/(authenticated)/projects/[id]/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Constants
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
// Factories
// ---------------------------------------------------------------------------

/**
 * Builds a mock Supabase client that chains:
 *   auth.getUser() → user
 *   .from('user_organisations').select().eq().eq().maybeSingle() → membership
 *   .from('projects').select().eq().eq().maybeSingle() → project
 */
function makeClient({
  membership = { github_role: 'admin', admin_repo_github_ids: [] as number[] } as { github_role: string; admin_repo_github_ids: number[] } | null,
  project = MOCK_PROJECT as typeof MOCK_PROJECT | null,
}: {
  membership?: { github_role: string; admin_repo_github_ids: number[] } | null;
  project?: typeof MOCK_PROJECT | null;
} = {}) {
  const makeMaybySingle = (data: unknown) =>
    ({ maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) });
  const makeEq2 = (data: unknown) =>
    ({ eq: vi.fn().mockReturnValue(makeMaybySingle(data)) });
  const makeEq1 = (data: unknown) =>
    ({ eq: vi.fn().mockReturnValue(makeEq2(data)) });
  const makeSelectChain = (data: unknown) =>
    ({ select: vi.fn().mockReturnValue(makeEq1(data)) });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_organisations') return makeSelectChain(membership);
      if (table === 'projects') return makeSelectChain(project);
      return makeSelectChain(null);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/projects/[id] dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  // -------------------------------------------------------------------------
  // Property: Org Member (non-admin, no admin repos) → redirect to /assessments
  // [req §Story 1.3 AC5] [lld §B.6 invariant I8]
  // -------------------------------------------------------------------------

  describe('Given an Org Member (github_role=member, empty admin_repo_github_ids)', () => {
    it('is redirected to /assessments', async () => {
      const client = makeClient({
        membership: { github_role: 'member', admin_repo_github_ids: [] },
      });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) }),
      ).rejects.toThrow('NEXT_REDIRECT:/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property: No membership row → 404
  // [req §Story 1.3 AC3] [lld §B.6 invariant I5]
  // -------------------------------------------------------------------------

  describe('Given the user has no membership row in the org', () => {
    it('calls notFound() — throws NEXT_NOT_FOUND', async () => {
      const client = makeClient({ membership: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Project not found or wrong org_id → 404
  // [req §Story 1.3 AC3] [lld §B.6 "404 on missing/cross-org/deleted"]
  // -------------------------------------------------------------------------

  describe('Given a project ID that does not exist or belongs to another org', () => {
    it('calls notFound() — throws NEXT_NOT_FOUND', async () => {
      const client = makeClient({ project: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        ProjectDashboardPage({ params: Promise.resolve({ id: 'nonexistent-id' }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Deleted project → 404 (hard delete = row absent)
  // [req §Story 1.3 AC4] "deleted projects do not render"
  // -------------------------------------------------------------------------

  describe('Given a project ID that has been deleted (row absent from DB)', () => {
    it('calls notFound() — throws NEXT_NOT_FOUND', async () => {
      // Hard-deleted projects have no row — same DB outcome as non-existent
      const client = makeClient({ project: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(
        ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Org Admin → DeleteButton included (action prop non-null)
  // [req §Story 1.5] "Org Admin invokes delete"; [lld §B.6 "visible iff github_role === 'admin'"]
  //
  // The page renders <PageHeader action={<DeleteButton projectId={id} />} />.
  // Serialising the JSX tree: admin case → action element has a non-null props
  // object; "action":null absent. Repo Admin case → action={null}, so the
  // serialised output contains "action":null.
  // -------------------------------------------------------------------------

  describe('Given an Org Admin (github_role=admin)', () => {
    it('passes a non-null DeleteButton element as action to PageHeader', async () => {
      const client = makeClient({
        membership: { github_role: 'admin', admin_repo_github_ids: [] },
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);

      // When action is non-null the serialised tree does NOT contain "action":null
      expect(rendered).not.toContain('"action":null');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Repo Admin (member + non-empty admin_repo_github_ids) → no DeleteButton
  // [req §Story 1.5 AC3] "Repo Admin → 403"; [lld §B.6 "visible iff github_role === 'admin'"]
  // -------------------------------------------------------------------------

  describe('Given a Repo Admin (github_role=member, non-empty admin_repo_github_ids)', () => {
    it('passes null action to PageHeader — DeleteButton not rendered', async () => {
      const client = makeClient({
        membership: { github_role: 'member', admin_repo_github_ids: [42, 99] },
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);

      // Repo Admin: isAdmin=false → action={null} → serialised as "action":null
      expect(rendered).toContain('"action":null');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Project name appears in rendered output
  // [req §Story 1.3 AC1] "shows the project name"
  // -------------------------------------------------------------------------

  describe('Given an active project with name "Payment Service"', () => {
    it('renders the project name in the page output', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Payment Service');
    });
  });

  // -------------------------------------------------------------------------
  // Property: Project description appears when non-null
  // [req §Story 1.3 AC1] "shows the project … description"
  // -------------------------------------------------------------------------

  describe('Given an active project with a non-null description', () => {
    it('renders the project description in the page output', async () => {
      const client = makeClient({
        project: { ...MOCK_PROJECT, description: 'Handles all payment flows' },
      });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Handles all payment flows');
    });
  });

  // -------------------------------------------------------------------------
  // Property: InlineEditHeader receives initialName and initialDescription
  // [req §Story 1.3 AC1] "inline edit affordance"; [lld §B.6]
  //
  // The InlineEditHeader element props appear in the serialised React tree.
  // "initialName" is a prop name unique to InlineEditHeader in this page.
  // -------------------------------------------------------------------------

  describe('Given an active project', () => {
    it('passes initialName and initialDescription props to InlineEditHeader', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await ProjectDashboardPage({ params: Promise.resolve({ id: PROJECT_ID }) });
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"initialName"');
      expect(rendered).toContain(MOCK_PROJECT.name);
      expect(rendered).toContain('"initialDescription"');
    });
  });
});
