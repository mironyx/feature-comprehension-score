// Tests for /assessments/new — admin-only create assessment page.
// Auth is enforced by the (authenticated) layout; this page guards for
// missing orgId and non-admin role.
// Issue: #121

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
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

vi.mock('@/app/(authenticated)/assessments/new/create-assessment-form', () => ({
  default: () => null,
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
// Factories
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const mockCookieStore = {};

const REPOS = [
  { id: 'repo-001', github_repo_name: 'acme/backend' },
  { id: 'repo-002', github_repo_name: 'acme/frontend' },
];

function makeClient({
  userId = USER_ID,
  githubRole = 'admin',
  repos = REPOS,
}: {
  userId?: string | null;
  githubRole?: string | null;
  repos?: unknown[];
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_organisations') {
        const rows = githubRole ? [{ github_role: githubRole }] : [];
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        };
      }
      // repositories
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: repos, error: null }),
          }),
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('New assessment page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  describe('Given no org is selected', () => {
    it('then it redirects to /org-select', async () => {
      mockGetOrgId.mockReturnValue(null);
      mockCreateServer.mockResolvedValue(makeClient() as never);

      const { default: NewAssessmentPage } = await import(
        '@/app/(authenticated)/assessments/new/page'
      );

      await expect(NewAssessmentPage()).rejects.toThrow('NEXT_REDIRECT:/org-select');
      expect(mockRedirect).toHaveBeenCalledWith('/org-select');
    });
  });

  describe('Given the user is not authenticated', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeClient({ userId: null }) as never);

      const { default: NewAssessmentPage } = await import(
        '@/app/(authenticated)/assessments/new/page'
      );

      await expect(NewAssessmentPage()).rejects.toThrow('NEXT_REDIRECT:/auth/sign-in');
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });

  describe('Given the user is not an org admin', () => {
    it('then it redirects to /assessments', async () => {
      mockCreateServer.mockResolvedValue(makeClient({ githubRole: 'member' }) as never);

      const { default: NewAssessmentPage } = await import(
        '@/app/(authenticated)/assessments/new/page'
      );

      await expect(NewAssessmentPage()).rejects.toThrow('NEXT_REDIRECT:/assessments');
      expect(mockRedirect).toHaveBeenCalledWith('/assessments');
    });
  });

  describe('Given the user is an org admin', () => {
    it('then it renders the page without redirecting', async () => {
      mockCreateServer.mockResolvedValue(makeClient() as never);

      const { default: NewAssessmentPage } = await import(
        '@/app/(authenticated)/assessments/new/page'
      );

      const result = await NewAssessmentPage();

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    it('then it renders a "New Assessment" heading', async () => {
      mockCreateServer.mockResolvedValue(makeClient() as never);

      const { default: NewAssessmentPage } = await import(
        '@/app/(authenticated)/assessments/new/page'
      );

      const result = await NewAssessmentPage();
      expect(JSON.stringify(result)).toContain('New Assessment');
    });
  });
});
