// Tests for /organisation page — admin-only route protection + context panel.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62, #158

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

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn(),
}));

vi.mock('@/lib/supabase/org-thresholds', () => ({
  loadOrgThresholds: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { loadOrgThresholds } from '@/lib/supabase/org-thresholds';
import { redirect, forbidden } from 'next/navigation';
import { cookies } from 'next/headers';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockLoadContext = vi.mocked(loadOrgPromptContext);
const mockLoadThresholds = vi.mocked(loadOrgThresholds);
const mockRedirect = vi.mocked(redirect);
const mockForbidden = vi.mocked(forbidden);
const mockCookies = vi.mocked(cookies);

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const USER_ID = 'user-001';
const ORG_ID = 'org-001';
const mockCookieStore = {};

function makeClient(role: 'admin' | 'member' | null) {
  const user = role === null
    ? null
    : { id: USER_ID, user_metadata: { user_name: 'alice', provider_id: '42' } };

  const membership = role ? [{ org_id: ORG_ID, github_role: role }] : [];

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: membership, error: null }),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Organisation page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCookies.mockResolvedValue(mockCookieStore as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockLoadContext.mockResolvedValue(undefined);
    mockLoadThresholds.mockResolvedValue({
      artefact_quality_threshold: 0.6,
      fcs_low_threshold: 60,
    });
  });

  describe('Given I am a regular user visiting /organisation', () => {
    it('then it returns 403 Forbidden', async () => {
      mockCreateServer.mockResolvedValue(makeClient('member') as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await expect(OrganisationPage()).rejects.toThrow('NEXT_FORBIDDEN');
      expect(mockForbidden).toHaveBeenCalled();
    });
  });

  describe('Given I am an org admin visiting /organisation', () => {
    it('then I see the org overview with context form', async () => {
      mockCreateServer.mockResolvedValue(makeClient('admin') as never);
      mockLoadContext.mockResolvedValue({ focus_areas: ['API design'] });

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      const result = await OrganisationPage();
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeTruthy();
      // Verify loadOrgPromptContext was called with the org ID
      expect(mockLoadContext).toHaveBeenCalledWith(expect.anything(), ORG_ID);
    });
  });

  describe('Given an unauthenticated user visiting /organisation', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockCreateServer.mockResolvedValue(makeClient(null) as never);

      const { default: OrganisationPage } = await import(
        '@/app/(authenticated)/organisation/page'
      );

      await expect(OrganisationPage()).rejects.toThrow(
        'NEXT_REDIRECT:/auth/sign-in',
      );
      expect(mockRedirect).toHaveBeenCalledWith('/auth/sign-in');
    });
  });
});
