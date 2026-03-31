// Tests for (authenticated)/assessments landing page — pending assessments list.
// Auth enforcement is delegated to the (authenticated) layout; this page only
// guards for a missing orgId (defensive fallback).
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issues: #62, #121

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

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
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

function makeClient(assessments: unknown[], githubRole: string | null = 'member') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
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
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: assessments, error: null }),
            }),
          }),
        }),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Assessments landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
  });

  describe('Given no org is selected (defensive fallback)', () => {
    it('then it redirects to /org-select', async () => {
      mockGetOrgId.mockReturnValue(null);
      mockCreateServer.mockResolvedValue(makeClient([]) as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      await expect(AssessmentsPage({})).rejects.toThrow(
        'NEXT_REDIRECT:/org-select',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/org-select');
    });
  });

  describe('Given an authenticated user with an org', () => {
    it('then it renders the assessments list without redirecting', async () => {
      mockCreateServer.mockResolvedValue(makeClient([]) as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({});

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    it('then it shows pending assessments heading', async () => {
      mockCreateServer.mockResolvedValue(makeClient([]) as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({});
      expect(JSON.stringify(result)).toContain('Assessments');
    });
  });

  describe('Given the user is an org admin', () => {
    it('then a "New Assessment" link is shown', async () => {
      mockCreateServer.mockResolvedValue(makeClient([], 'admin') as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({});
      expect(JSON.stringify(result)).toContain('/assessments/new');
    });
  });

  describe('Given the user is not an org admin', () => {
    it('then no "New Assessment" link is shown', async () => {
      mockCreateServer.mockResolvedValue(makeClient([], 'member') as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({});
      expect(JSON.stringify(result)).not.toContain('/assessments/new');
    });
  });

  describe('Given a created search param is present', () => {
    it('then it renders a success banner', async () => {
      mockCreateServer.mockResolvedValue(makeClient([], 'admin') as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({ created: 'assess-123' }),
      });
      const rendered = JSON.stringify(result);
      expect(rendered).toContain('Assessment created');
    });
  });

  describe('Given no created search param', () => {
    it('then no success banner is rendered', async () => {
      mockCreateServer.mockResolvedValue(makeClient([], 'admin') as never);

      const { default: AssessmentsPage } = await import(
        '@/app/(authenticated)/assessments/page'
      );

      const result = await AssessmentsPage({
        searchParams: Promise.resolve({}),
      });
      const rendered = JSON.stringify(result);
      expect(rendered).not.toContain('Assessment created');
    });
  });
});
