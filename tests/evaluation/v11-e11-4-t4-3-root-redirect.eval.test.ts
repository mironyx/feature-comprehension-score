// Adversarial evaluation tests for issue #434 — root redirect + last-visited project.
//
// Two genuine gaps found in the test-author's suite:
//
// GAP-1 (AC8 / I8): No test asserts that the legacy `/assessments/[aid]` route
//   file does not exist.  The LLD states "verified by absence of route file"
//   (I8), and the issue BDD spec lists `it('Legacy /assessments/[aid] returns 404')`.
//   A test-author oversight: the spec explicitly requested a BDD spec for this
//   and none was written.
//
// GAP-2 (AC1 variant): The root page server component treats any non-null
//   OrgRole as admin-path (renders AdminRootRedirect).  OrgRole has two
//   non-null values: 'admin' and 'repo_admin'.  The existing root-redirect
//   tests only exercise 'admin'.  The spec says "Org Admin or Repo Admin"
//   throughout Story 4.4.  The test-author covered the common case and missed
//   the Repo Admin variant — a process signal (test-author prompt could be
//   tighter about exhausting the OrgRole union).
//
// Failures here are findings.  Do NOT modify the implementation.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// GAP-1: Legacy route file absence — Story 4.5 AC4 / LLD I8
// ---------------------------------------------------------------------------

describe('Legacy /assessments/[aid] route absence (Story 4.5 AC4, LLD I8)', () => {
  const ROOT = resolve(__dirname, '../..');

  describe('Given no legacy /assessments/[aid] route exists', () => {
    it('then src/app/(authenticated)/assessments/[aid]/page.tsx does not exist', () => {
      // [req §Story 4.5 AC4] "request to the legacy shape /assessments/[aid] … returns 404"
      // [lld I8] "Verified by absence of route file"
      // Next.js returns 404 for any path with no matching route file.
      const legacyAuthedPath = resolve(
        ROOT,
        'src/app/(authenticated)/assessments/[aid]/page.tsx',
      );
      expect(existsSync(legacyAuthedPath)).toBe(false);
    });

    it('then src/app/(authenticated)/assessments/[id]/page.tsx does not exist (pre-V11 shape)', () => {
      // Guard against the pre-V11 variant which used [id] not [aid].
      const legacyOldPath = resolve(
        ROOT,
        'src/app/(authenticated)/assessments/[id]/page.tsx',
      );
      expect(existsSync(legacyOldPath)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// GAP-2: Repo Admin on root page renders AdminRootRedirect — Story 4.4 AC1
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
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/app/admin-root-redirect', () => ({
  AdminRootRedirect: vi.fn(({ projectIds }: { projectIds: string[] }) => ({
    type: 'AdminRootRedirect',
    props: { projectIds },
  })),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetSelectedOrgId = vi.mocked(getSelectedOrgId);
const mockGetOrgRole = vi.mocked(getOrgRole);

function makeSupabaseMock(
  user: { id: string } | null,
  projectRows: { id: string }[] = [],
) {
  const projectsQuery = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: projectRows, error: null }),
    }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error('no session'),
      }),
    },
    from: vi.fn().mockReturnValue(projectsQuery),
  };
}

describe('Root redirect — Repo Admin path (Story 4.4 AC1, LLD §A.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Given an authenticated Repo Admin (getOrgRole returns "repo_admin") visits /', () => {
    it('then it does NOT redirect to /assessments (must follow admin path)', async () => {
      // [req §Story 4.4] "Org Admin or Repo Admin … redirected to /projects/[id]"
      // Repo Admins must get AdminRootRedirect, not the member redirect.
      mockCreateServer.mockResolvedValue(
        makeSupabaseMock({ id: 'u-repo' }, [{ id: 'proj-r1' }]) as never,
      );
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('repo_admin');

      const { default: Home } = await import('@/app/page');

      // Must not throw NEXT_REDIRECT:/assessments
      await expect(Home()).resolves.not.toThrow();
    });

    it('then it renders AdminRootRedirect with the org project IDs', async () => {
      // [req §Story 4.4 AC1] "admin has lastVisitedProjectId … redirected to /projects/[id]"
      // [lld §A.2] "admin / repo_admin" branch renders AdminRootRedirect
      mockCreateServer.mockResolvedValue(
        makeSupabaseMock({ id: 'u-repo' }, [{ id: 'proj-r1' }, { id: 'proj-r2' }]) as never,
      );
      mockGetSelectedOrgId.mockReturnValue('org-001');
      mockGetOrgRole.mockResolvedValue('repo_admin');

      const { default: Home } = await import('@/app/page');
      const result = await Home();

      const element = result as { type: unknown; props: Record<string, unknown> };
      const projectIds = element.props.projectIds as string[];
      expect(projectIds).toContain('proj-r1');
      expect(projectIds).toContain('proj-r2');
    });
  });
});
