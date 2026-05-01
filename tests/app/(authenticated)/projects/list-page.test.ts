// Tests for /projects list page — server component.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.5
// Requirements: docs/requirements/v1-requirements.md §Story 1.2
// Issue: #398

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede all imports that trigger module evaluation.
//
// Pattern: identical to tests/app/(authenticated)/assessments.test.ts
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
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Turn <Link> into a plain object so JSON.stringify assertions work on the
// serialised React element tree. Same pattern as organisation.test.ts.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

// Stub UI leaf components that have no observable properties in these tests.
vi.mock('@/components/ui/page-header', () => ({
  PageHeader: 'PageHeader',
}));

vi.mock('@/components/ui/card', () => ({
  Card: 'Card',
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockRedirect = vi.mocked(redirect);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-001';
const USER_ID = 'user-uuid-001';
const mockCookieStore = {};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'project-uuid-001',
    org_id: ORG_ID,
    name: 'Payment Service',
    description: 'Handles all payment processing',
    created_at: '2026-04-30T10:00:00Z',
    updated_at: '2026-04-30T10:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock client factory
//
// The list page is expected to:
//   1. Read auth.getUser() to establish caller identity.
//   2. Query user_organisations to read github_role + admin_repo_github_ids.
//   3. Query projects table if caller passes the guard.
//
// The factory builds a mock Supabase client whose `from()` dispatches by table
// name, mirroring the pattern in tests/app/(authenticated)/assessments.test.ts.
// ---------------------------------------------------------------------------

type MembershipRow = {
  github_role: 'admin' | 'member';
  admin_repo_github_ids: number[];
};

function makeMockClient(
  membership: MembershipRow | null,
  projects: ProjectRow[],
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: membership, error: null });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const selectMembership = vi.fn().mockReturnValue({ eq: eqOrgId });

  const order = vi.fn().mockResolvedValue({ data: projects, error: null });
  const eqProjectsOrgId = vi.fn().mockReturnValue({ order });
  const selectProjects = vi.fn().mockReturnValue({ eq: eqProjectsOrgId });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'user_organisations') {
      return { select: selectMembership };
    }
    if (table === 'projects') {
      return { select: selectProjects };
    }
    return { select: vi.fn().mockReturnThis() };
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }),
    },
    from,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/projects list page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  // -------------------------------------------------------------------------
  // Guard: Org Member (github_role=member, admin_repo_github_ids=[])
  // [lld §B.5 "Org Member → redirect('/assessments')", invariant I8]
  // [issue #398 BDD spec: "Org Member is redirected to /assessments"]
  // -------------------------------------------------------------------------

  describe('Given an Org Member (github_role=member, empty admin_repo_github_ids)', () => {
    it('then it redirects to /assessments [lld §B.5, I8, issue #398]', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'member', admin_repo_github_ids: [] },
          [],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      await expect(ProjectsPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
      expect(mockRedirect).toHaveBeenCalledWith('/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Guard inverse: Repo Admin (github_role=member, admin_repo_github_ids non-empty)
  // [lld §B.5 "Both pages: …on false redirect('/assessments')"]
  // [issue #398 AC: "Repo Admin sees the same list"]
  // -------------------------------------------------------------------------

  describe('Given a Repo Admin (github_role=member, non-empty admin_repo_github_ids)', () => {
    it('then it does NOT redirect to /assessments [lld §B.5, issue #398 AC]', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'member', admin_repo_github_ids: [101] },
          [],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state: Org Admin, no projects
  // [lld §B.5 "show empty-state 'Create project' CTA when no rows"]
  // [issue #398 BDD spec: "Admin sees empty-state CTA when org has no projects"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin and the org has no projects', () => {
    it('then it renders a "Create project" link to /projects/new [lld §B.5, issue #398]', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('/projects/new');
    });

    it('then the "Create project" CTA is rendered as a link element [lld §B.5]', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();
      const rendered = JSON.stringify(result);

      // The empty-state CTA must be a navigable link, not just text.
      // The next/link mock produces { type: 'a', props: { href: '/projects/new', ... } }.
      expect(rendered).toMatch(/"href":"\/projects\/new"/);
    });

    it('then it does NOT render a project list table [lld §B.5 — empty state]', async () => {
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();
      const rendered = JSON.stringify(result);

      // No project names should appear in the DOM when the list is empty.
      expect(rendered).not.toContain('Payment Service');
    });
  });

  // -------------------------------------------------------------------------
  // Project list: Org Admin with projects
  // [lld §B.5 "render table; name, description, created_at"]
  // [issue #398 BDD spec: "Admin sees list of projects with name, description, creation date"]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin and the org has projects', () => {
    it('then each project name is rendered [lld §B.5, req §Story 1.2]', async () => {
      const project = makeProject({ name: 'Auth Overhaul' });
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [project],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();

      expect(JSON.stringify(result)).toContain('Auth Overhaul');
    });

    it('then each project description is rendered [lld §B.5, req §Story 1.2]', async () => {
      const project = makeProject({
        name: 'Auth Overhaul',
        description: 'Replaces legacy session tokens',
      });
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [project],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();

      expect(JSON.stringify(result)).toContain('Replaces legacy session tokens');
    });

    it('then each project creation date is rendered [lld §B.5, req §Story 1.2]', async () => {
      const project = makeProject({
        name: 'Auth Overhaul',
        created_at: '2026-04-30T10:00:00Z',
      });
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [project],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();

      // The page must surface created_at in some form — exact format TBD by implementation.
      expect(JSON.stringify(result)).toContain('2026-04-30');
    });

    it('then all projects from the org are rendered (multiple rows) [lld §B.5, req §Story 1.2]', async () => {
      const projects = [
        makeProject({ id: 'p-001', name: 'Auth Overhaul' }),
        makeProject({ id: 'p-002', name: 'Payment Service' }),
      ];
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          projects,
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Auth Overhaul');
      expect(rendered).toContain('Payment Service');
    });

    it('then a null description does not throw and the page renders [lld §B.5 — nullable field]', async () => {
      const project = makeProject({ description: null });
      mockCreateServer.mockResolvedValue(
        makeMockClient(
          { github_role: 'admin', admin_repo_github_ids: [] },
          [project],
        ) as never,
      );

      const { default: ProjectsPage } = await import(
        '@/app/(authenticated)/projects/page'
      );

      const result = await ProjectsPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });
  });
});
