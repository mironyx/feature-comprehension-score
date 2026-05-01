// Tests for /projects/[id]/assessments/new — server component access control and repo list.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.4
// Requirements: docs/requirements/v1-requirements.md
// Issue: #413

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/membership', () => ({
  readMembershipSnapshot: vi.fn(),
  snapshotToOrgRole: vi.fn(),
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

// Stub CreateAssessmentForm so the server component can complete without
// rendering a full client component tree, and so prop values are visible
// in the serialised JSX element output.
vi.mock(
  '@/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form',
  () => ({ default: () => null }),
);

// Stub PageHeader to expose title and action props in serialised output
vi.mock('@/components/ui/page-header', () => ({
  PageHeader: ({ title, action }: { title: string; action: unknown }) =>
    ({ type: 'div', props: { 'data-title': title, children: action } }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readMembershipSnapshot, snapshotToOrgRole } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockReadSnapshot = vi.mocked(readMembershipSnapshot);
const mockSnapshotToOrgRole = vi.mocked(snapshotToOrgRole);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'project-001';
const ORG_ID = 'org-abc';
const USER_ID = 'user-001';

const MOCK_PROJECT = { id: PROJECT_ID, org_id: ORG_ID, name: 'My Feature Project' };

const ORG_REPOS = [
  { id: 'repo-001', github_repo_name: 'acme/backend', github_repo_id: 1001 },
  { id: 'repo-002', github_repo_name: 'acme/frontend', github_repo_id: 1002 },
];

const ADMIN_REPOS = [
  { id: 'repo-001', github_repo_name: 'acme/backend', github_repo_id: 1001 },
];

const ADMIN_SNAPSHOT = {
  githubRole: 'admin' as const,
  adminRepoGithubIds: [],
};

const REPO_ADMIN_SNAPSHOT = {
  githubRole: 'member' as const,
  adminRepoGithubIds: [1001],
};

// ---------------------------------------------------------------------------
// Chain builder helpers
// ---------------------------------------------------------------------------

/** Builds a terminal select chain ending with .maybeSingle() */
function makeMaybeSingleChain(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { select };
}

/** Builds a chained query for repositories:
 *  .select().eq('org_id', ...).order() — for Org Admin
 *  .select().eq('org_id', ...).order().in() — NOT the pattern used; for Org Admin: order() is terminal
 *  .select().eq('org_id', ...).in().order() — NOT used
 *
 * LLD sketch: org-admin uses .order(), repo-admin chains .in() after .order().
 * The page builds the query object and conditionally appends .in() before awaiting.
 * We model this by making order() and in() both return objects with a then()
 * so the page can await either branch.
 */
function makeRepoQueryChain(data: unknown) {
  const resolvedValue = { data, error: null };

  // Both order() and in() must be awaitable (have .then) so the page can `await q`
  // after optionally calling .in() on the result of .order().
  const inFn = vi.fn().mockResolvedValue(resolvedValue);
  const orderFn = vi.fn().mockReturnValue(
    Object.assign(Promise.resolve(resolvedValue), { in: inFn }),
  );
  const eqFn = vi.fn().mockReturnValue({ order: orderFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });

  return { selectFn, eqFn, orderFn, inFn };
}

/** Builds a Supabase client mock for the new-assessment page.
 *
 * Tables:
 *   'projects'      → maybeSingle()  → project or null
 *   'repositories'  → .select().eq().order()[.in()] → repos
 */
function makeClient({
  project = MOCK_PROJECT as typeof MOCK_PROJECT | null,
  repos = ORG_REPOS,
  userId = USER_ID,
}: {
  project?: typeof MOCK_PROJECT | null;
  repos?: unknown[];
  userId?: string | null;
} = {}) {
  const projectChain = makeMaybeSingleChain(project);
  const { selectFn, eqFn, orderFn, inFn } = makeRepoQueryChain(repos);

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') return projectChain;
      if (table === 'repositories') return { select: selectFn };
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    }),
    _repoChain: { selectFn, eqFn, orderFn, inFn },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Convenience invocation
// ---------------------------------------------------------------------------

async function callPage(projectId = PROJECT_ID) {
  const { default: NewAssessmentPage } = await import(
    '@/app/(authenticated)/projects/[id]/assessments/new/page'
  );
  return NewAssessmentPage({ params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/projects/[id]/assessments/new page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue({} as never);
    // Default to an Org Admin snapshot — overridden per test
    mockReadSnapshot.mockResolvedValue(ADMIN_SNAPSHOT);
    mockSnapshotToOrgRole.mockReturnValue('admin');
  });

  // -------------------------------------------------------------------------
  // Property 1: notFound() when project.id does not exist in DB
  // [lld §B.4 AC "404 if pid is unknown"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a project ID that does not exist in the database', () => {
    it('When the page renders, Then notFound() is called — throws NEXT_NOT_FOUND', async () => {
      const client = makeClient({ project: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(callPage('nonexistent-pid')).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: redirect('/auth/sign-in') when user is not authenticated
  // [lld §B.4 sketch: "if (!user) redirect('/auth/sign-in')"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given an unauthenticated request (auth.getUser returns null user)', () => {
    it('When the page renders, Then it redirects to /auth/sign-in', async () => {
      const client = makeClient({ userId: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(callPage()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: redirect('/assessments') when user role is null
  // [lld §B.4 AC "redirect Org Members to /assessments"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a user who is an Org Member (snapshotToOrgRole returns null)', () => {
    it('When the page renders, Then it redirects to /assessments', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue({ githubRole: 'member', adminRepoGithubIds: [] });
      mockSnapshotToOrgRole.mockReturnValue(null);

      await expect(callPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3b: redirect('/assessments') when user has no membership row at all
  // [lld §B.4 "role === null"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a user with no membership row in the org (readMembershipSnapshot returns null)', () => {
    it('When the page renders, Then it redirects to /assessments', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(null);
      mockSnapshotToOrgRole.mockReturnValue(null);

      await expect(callPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Org Admin (role='admin') sees ALL org repos — no .in() filter
  // [lld §B.4 "Org Admin: repo list = ALL repos in the org"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin (snapshotToOrgRole returns "admin")', () => {
    it('When the page renders, Then the repo query uses .order() without .in()', async () => {
      const client = makeClient({ repos: ORG_REPOS });
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(ADMIN_SNAPSHOT);
      mockSnapshotToOrgRole.mockReturnValue('admin');

      await callPage();

      // Org Admin path: .in() must NOT be called — all repos returned unfiltered
      expect(client._repoChain.inFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Property 4b: Org Admin — repositories are scoped to org_id from project
  // [lld §B.4 ".eq('org_id', project.org_id)"] [issue #413]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin and a project with a known org_id', () => {
    it('When the page renders, Then the repo query filters by the project org_id', async () => {
      const client = makeClient({ repos: ORG_REPOS });
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(ADMIN_SNAPSHOT);
      mockSnapshotToOrgRole.mockReturnValue('admin');

      await callPage();

      expect(client._repoChain.eqFn).toHaveBeenCalledWith('org_id', ORG_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Repo Admin sees only repos whose github_repo_id is in adminRepoGithubIds
  // [lld §B.4 "if (role === 'repo_admin') q = q.in('github_repo_id', adminRepoIds)"]
  // [issue #413]
  // -------------------------------------------------------------------------

  describe('Given a Repo Admin with adminRepoGithubIds = [1001]', () => {
    it('When the page renders, Then the repo query calls .in("github_repo_id", [1001])', async () => {
      const client = makeClient({ repos: ADMIN_REPOS });
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(REPO_ADMIN_SNAPSHOT);
      mockSnapshotToOrgRole.mockReturnValue('repo_admin');

      await callPage();

      expect(client._repoChain.inFn).toHaveBeenCalledWith('github_repo_id', [1001]);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Page renders <CreateAssessmentForm> with projectId prop (not orgId)
  // [lld §B.4 "return <CreateAssessmentForm projectId={projectId} repositories={...} />"]
  // [issue #413]
  // -------------------------------------------------------------------------

  describe('Given an authenticated Org Admin and a valid project', () => {
    it('When the page renders, Then the output encodes projectId (not orgId) in the form props', async () => {
      const client = makeClient({ repos: ORG_REPOS });
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(ADMIN_SNAPSHOT);
      mockSnapshotToOrgRole.mockReturnValue('admin');

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // Must carry the projectId
      expect(rendered).toContain(PROJECT_ID);
      // Must NOT carry the orgId as a prop — server resolved it internally
      expect(rendered).not.toContain(`"orgId"`);
      expect(rendered).not.toContain(`"org_id"`);
    });
  });

  // -------------------------------------------------------------------------
  // Regression #413 — page previously did not exist in the projects/ tree.
  // The page must resolve without throwing 'not implemented'.
  // -------------------------------------------------------------------------

  describe('Regression #413 — page stub was "throw not implemented"', () => {
    it('When the page renders for a valid Org Admin, Then it does NOT throw "not implemented"', async () => {
      const client = makeClient({ repos: ORG_REPOS });
      mockCreateServer.mockResolvedValue(client as never);
      mockReadSnapshot.mockResolvedValue(ADMIN_SNAPSHOT);
      mockSnapshotToOrgRole.mockReturnValue('admin');

      await expect(callPage()).resolves.not.toThrow();
    });
  });
});
