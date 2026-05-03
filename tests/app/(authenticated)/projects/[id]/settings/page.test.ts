// Tests for /projects/[id]/settings — server component access control and form hydration.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.1
// Requirements:    docs/requirements/v11-requirements.md §Epic 3, Story 3.1
// Issue:           #421

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must precede component imports (vitest hoisting rules)
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({
    href,
    'aria-label': ariaLabel,
    children,
  }: {
    href: string;
    'aria-label'?: string;
    children?: unknown;
  }) => ({ type: 'a', props: { href, 'aria-label': ariaLabel, children } }),
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => ({ type: 'svg', props: { 'data-testid': 'icon-arrow-left' } }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/membership', () => ({
  getOrgRole: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

// Stub SettingsForm so the server component completes. Prop values are
// inspectable via JSON.stringify on the returned JSX element.
vi.mock(
  '@/app/(authenticated)/projects/[id]/settings/settings-form',
  () => ({
    SettingsForm: () => null,
  }),
);

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrgRole } from '@/lib/supabase/membership';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgRole = vi.mocked(getOrgRole);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-settings-001';
const ORG_ID = 'org-settings-abc';
const USER_ID = 'user-settings-001';
const DEFAULT_QUESTION_COUNT = 4; // lld §B.1 const DEFAULT_QUESTION_COUNT = 4

const MOCK_PROJECT = { id: PROJECT_ID, org_id: ORG_ID, name: 'Payment Service' };

const CONTEXT_ROW = {
  context: {
    glob_patterns: ['docs/adr/*.md', '**/*.ts'],
    domain_notes: 'Use British English throughout.',
    question_count: 6,
  },
};

// ---------------------------------------------------------------------------
// Chain builder helpers — mirrors assessments/new/page.test.ts pattern
// ---------------------------------------------------------------------------

/** Builds a select chain ending with .maybeSingle(), supporting up to two .eq() calls. */
function makeMaybeSingleChain(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  return { select };
}

/** Builds the full Supabase client for the settings page.
 *
 * The page makes three awaited queries in order:
 *   1. projects.select('id, org_id, name').eq('id', projectId).maybeSingle()
 *   2. auth.getUser()
 *   3. organisation_contexts.select('context').eq('org_id', …).eq('project_id', …).maybeSingle()
 */
function makeClient({
  project = MOCK_PROJECT as typeof MOCK_PROJECT | null,
  userId = USER_ID as string | null,
  contextRow = CONTEXT_ROW as { context: Record<string, unknown> } | null,
} = {}) {
  const projectChain = makeMaybeSingleChain(project);
  const contextChain = makeMaybeSingleChain(contextRow);

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'projects') return projectChain;
      if (table === 'organisation_contexts') return contextChain;
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Convenience invocation
// ---------------------------------------------------------------------------

async function callPage(projectId = PROJECT_ID) {
  const { default: ProjectSettingsPage } = await import(
    '@/app/(authenticated)/projects/[id]/settings/page'
  );
  return ProjectSettingsPage({ params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/projects/[id]/settings page [#421, lld §B.1, req §Story 3.1]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Default: Org Admin
    mockGetOrgRole.mockResolvedValue('admin');
  });

  // -------------------------------------------------------------------------
  // Property 1: Org Admin sees the form prefilled from the existing row
  // [req §Story 3.1 AC1, lld §B.1, #421]
  // -------------------------------------------------------------------------

  describe('Given an Org Admin and an existing organisation_contexts row', () => {
    it('When the page renders, Then the JSX carries initial.glob_patterns from the row [req §Story 3.1, lld §B.1]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('docs/adr/*.md');
      expect(rendered).toContain('**/*.ts');
    });

    it('When the page renders, Then the JSX carries initial.domain_notes from the row [req §Story 3.1, lld §B.1]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('Use British English throughout.');
    });

    it('When the page renders, Then the JSX carries initial.question_count from the row [req §Story 3.1, lld §B.1]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      // question_count = 6 from the context row
      expect(rendered).toContain('"question_count":6');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Project with no context row → empty inputs + system-default question count
  // [req §Story 3.1 AC2: "form renders with empty glob patterns, empty domain notes,
  //   and the system default question count selected"]
  // [lld §B.1: DEFAULT_QUESTION_COUNT = 4]
  // -------------------------------------------------------------------------

  describe('Given a project with no organisation_contexts row', () => {
    it('When the page renders, Then the JSX carries empty glob_patterns [req §Story 3.1, lld §B.1]', async () => {
      const client = makeClient({ contextRow: null });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"glob_patterns":[]');
    });

    it('When the page renders, Then the JSX carries empty domain_notes [req §Story 3.1, lld §B.1]', async () => {
      const client = makeClient({ contextRow: null });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain('"domain_notes":""');
    });

    it(`When the page renders, Then the JSX carries question_count = ${DEFAULT_QUESTION_COUNT} (system default) [req §Story 3.1, lld §B.1]`, async () => {
      const client = makeClient({ contextRow: null });
      mockCreateServer.mockResolvedValue(client as never);

      const result = await callPage();
      const rendered = JSON.stringify(result);

      expect(rendered).toContain(`"question_count":${DEFAULT_QUESTION_COUNT}`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Repo Admin can render the form — role !== null branch
  // [req §Story 3.1 AC5: "Repo Admins can configure project context"]
  // -------------------------------------------------------------------------

  describe('Given a Repo Admin (getOrgRole returns "repo_admin")', () => {
    it('When the page renders, Then it completes without redirect or 404 [req §Story 3.1]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);
      mockGetOrgRole.mockResolvedValue('repo_admin');

      await expect(callPage()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Org Member is redirected to /assessments
  // [req §Story 3.1 AC6, lld §B.1 Invariant I3, #421]
  // I3: settings is admin-only; non-admins reaching /projects/[id]/settings via
  //     direct URL get sent to /assessments (a page they have access to) rather
  //     than back to /projects/[id], which would be a no-op redirect loop.
  // -------------------------------------------------------------------------

  describe('Given an Org Member (getOrgRole returns null)', () => {
    it('When the page renders, Then it redirects to /assessments [I3, req §Story 3.1 AC6, #421]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);
      mockGetOrgRole.mockResolvedValue(null);

      await expect(callPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
    });

    it('When the page renders, Then it does NOT redirect back to /projects/[id] (no-op loop) [I3, #421]', async () => {
      const client = makeClient();
      mockCreateServer.mockResolvedValue(client as never);
      mockGetOrgRole.mockResolvedValue(null);

      let thrownMessage = '';
      try {
        await callPage();
      } catch (e) {
        thrownMessage = (e as Error).message;
      }

      expect(thrownMessage).not.toContain(`NEXT_REDIRECT:/projects/${PROJECT_ID}`);
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Unknown projectId returns 404
  // [req §Story 1.3, lld §B.1 Invariant I4, #421]
  // -------------------------------------------------------------------------

  describe('Given an unknown projectId (project query returns null)', () => {
    it('When the page renders, Then notFound() is called — throws NEXT_NOT_FOUND [I4, #421]', async () => {
      const client = makeClient({ project: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(callPage('nonexistent-project-id')).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: Unauthenticated user is redirected to /auth/sign-in
  // [lld §B.1 sketch: "if (!user) redirect('/auth/sign-in')"]
  // -------------------------------------------------------------------------

  describe('Given an unauthenticated user (auth.getUser returns null user)', () => {
    it('When the page renders, Then it redirects to /auth/sign-in [lld §B.1]', async () => {
      const client = makeClient({ userId: null });
      mockCreateServer.mockResolvedValue(client as never);

      await expect(callPage()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: "Back to project" link — Story 1.6, rev 1.3 (#451)
  // [lld §Pending changes — Rev 2 §Story 1.6, req §REQ-project-management-back-to-project-from-settings]
  // -------------------------------------------------------------------------

  describe('Project settings page — Back to project (Story 1.6, #451)', () => {
    describe('Given an Org Admin on the settings page', () => {
      it('renders an anchor pointing to /projects/[id] [lld §Story 1.6, #451]', async () => {
        const client = makeClient();
        mockCreateServer.mockResolvedValue(client as never);

        const result = await callPage();
        const children = (result as { props: { children: unknown[] } }).props.children;
        const backLink = children.find(
          (c) => (c as { props?: { href?: string } })?.props?.href === `/projects/${PROJECT_ID}`,
        );

        expect(backLink).toBeDefined();
      });

      it('uses an accessible name that identifies the destination by project name [lld §Story 1.6, #451]', async () => {
        const client = makeClient();
        mockCreateServer.mockResolvedValue(client as never);

        const result = await callPage();
        const rendered = JSON.stringify(result);

        expect(rendered).toContain(`Back to ${MOCK_PROJECT.name}`);
      });

      it('positions the link above the settings form in the component tree [lld §Story 1.6, #451]', async () => {
        const client = makeClient();
        mockCreateServer.mockResolvedValue(client as never);

        const result = await callPage();
        const children = (result as { props: { children: unknown[] } }).props.children;
        const linkIdx = children.findIndex(
          (c) => (c as { props?: { href?: string } })?.props?.href === `/projects/${PROJECT_ID}`,
        );
        const formIdx = children.findIndex(
          (c) => (c as { props?: { initial?: unknown } })?.props?.initial !== undefined,
        );

        expect(linkIdx).toBeGreaterThanOrEqual(0);
        expect(linkIdx).toBeLessThan(formIdx);
      });
    });

    describe('Given a Repo Admin on the settings page', () => {
      it('renders the back link for repo_admin role [lld §Story 1.6 AC4, #451]', async () => {
        const client = makeClient();
        mockCreateServer.mockResolvedValue(client as never);
        mockGetOrgRole.mockResolvedValue('repo_admin');

        const result = await callPage();
        const rendered = JSON.stringify(result);

        expect(rendered).toContain(`/projects/${PROJECT_ID}`);
        expect(rendered).toContain(`Back to ${MOCK_PROJECT.name}`);
      });
    });
  });
});
