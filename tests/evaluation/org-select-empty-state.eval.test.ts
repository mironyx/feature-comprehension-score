// Adversarial evaluation tests for issue #181 — /org-select non-member empty state.
// Design reference: docs/design/lld-onboarding-auth-empty-state.md §6
//
// AC-1: /org-select empty state shows the exact copy from req O.3.
// AC-2: Install link is present and points to the configured URL.
// AC-3: Sign out button visible, triggers POST to /auth/sign-out.
// AC-4: /auth/sign-out clears the session and redirects to /auth/sign-in.
// AC-5: NonMemberEmptyState component test passes (covered by unit tests).
// AC-6: page.tsx empty-state branch is ≤ 3 lines.
// AC-7/8/9: tsc/vitest/lint pass (verified externally).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NonMemberEmptyState } from '@/app/org-select/NonMemberEmptyState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(): string {
  return renderToStaticMarkup(NonMemberEmptyState());
}

// Exact copy mandated by req O.3.
const O3_COPY =
  'You do not have access to any organisation using FCS. Ask your admin to install the app or add you to an org where it is installed.';

// ---------------------------------------------------------------------------
// AC-1: Exact copy from req O.3, including the <h1> heading text
// ---------------------------------------------------------------------------

describe('AC-1 — /org-select empty state shows exact copy from req O.3', () => {
  it('renders the required paragraph text verbatim (whitespace-collapsed)', () => {
    const html = render();
    // renderToStaticMarkup collapses JSX whitespace to a single space between tokens.
    // We strip tags then normalise whitespace for an unambiguous string comparison.
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(textContent).toContain(O3_COPY);
  });

  it('renders the heading "No access" exactly — not the old placeholder copy', () => {
    const html = render();
    expect(html).toContain('<h1>No access</h1>');
    expect(html).not.toContain('No organisations found');
    expect(html).not.toContain('Select Organisation');
  });
});

// ---------------------------------------------------------------------------
// AC-2: Install link present, correct URL, env-var override and fallback
// ---------------------------------------------------------------------------

describe('AC-2 — install link points to configured URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the env var when set to a non-empty value', () => {
    vi.stubEnv('NEXT_PUBLIC_GITHUB_APP_INSTALL_URL', 'https://github.com/apps/my-app/installations/new');
    const html = render();
    expect(html).toContain('href="https://github.com/apps/my-app/installations/new"');
  });

  it('falls back to default URL when env var is absent (undefined)', () => {
    // vi.stubEnv cannot unset a var — delete from process.env directly then restore.
    const saved = process.env['NEXT_PUBLIC_GITHUB_APP_INSTALL_URL'];
    delete process.env['NEXT_PUBLIC_GITHUB_APP_INSTALL_URL'];
    try {
      const html = render();
      expect(html).toContain('href="https://github.com/apps/fcs-app/installations/new"');
    } finally {
      if (saved !== undefined) {
        process.env['NEXT_PUBLIC_GITHUB_APP_INSTALL_URL'] = saved;
      }
    }
  });

  it('falls back to default URL when env var is empty string', () => {
    vi.stubEnv('NEXT_PUBLIC_GITHUB_APP_INSTALL_URL', '');
    const html = render();
    expect(html).toContain('href="https://github.com/apps/fcs-app/installations/new"');
  });

  it('the install link has visible anchor text', () => {
    const html = render();
    expect(html).toContain('>Install the GitHub App<');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Sign out button visible, form targets /auth/sign-out via POST
// ---------------------------------------------------------------------------

describe('AC-3 — sign out button visible and posts to /auth/sign-out', () => {
  it('renders a form with action="/auth/sign-out" and method="post"', () => {
    const html = render();
    expect(html).toMatch(/action="\/auth\/sign-out"/);
    expect(html).toMatch(/method="post"/);
  });

  it('renders a submit button labelled "Sign out"', () => {
    const html = render();
    expect(html).toContain('<button type="submit">Sign out</button>');
  });
});

// ---------------------------------------------------------------------------
// AC-4: /auth/sign-out handler — clears session and redirects to /auth/sign-in
// The LLD §5 BDD spec mandates three verifiable behaviours:
//   1. calls supabase.auth.signOut()
//   2. redirects to /auth/sign-in
//   3. does not delete auth.users or user_organisations rows
// There are NO existing tests for the sign-out route.
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/route-handler', () => ({
  createRouteHandlerSupabaseClient: vi.fn(),
}));

import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);

describe('AC-4 — /auth/sign-out route handler', () => {
  const mockSignOut = vi.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { signOut: mockSignOut },
    } as never);
  });

  it('calls supabase.auth.signOut()', async () => {
    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/sign-out');
    const { POST } = await import('@/app/auth/sign-out/route');
    await POST(request);
    expect(mockSignOut).toHaveBeenCalledOnce();
  });

  it('redirects to /auth/sign-in', async () => {
    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/sign-out');
    const { POST } = await import('@/app/auth/sign-out/route');
    const response = await POST(request);
    expect(response.headers.get('location')).toContain('/auth/sign-in');
  });

  it('does not call supabase.from() — no row deletion', async () => {
    const mockFrom = vi.fn();
    mockCreateRouteHandler.mockReturnValue({
      auth: { signOut: mockSignOut },
      from: mockFrom,
    } as never);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/sign-out');
    const { POST } = await import('@/app/auth/sign-out/route');
    await POST(request);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-6: page.tsx empty-state branch — delegates to NonMemberEmptyState
// The existing test only checks the result is truthy; this verifies the
// NonMemberEmptyState component is actually rendered (not old placeholder HTML).
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';

const mockCreateServer = vi.mocked(createServerSupabaseClient);

describe('AC-6 — page.tsx empty-state branch renders NonMemberEmptyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders a result that includes the "No access" heading when user has zero orgs', async () => {
    mockCreateServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u-001' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as never);

    const { default: OrgSelectPage } = await import('@/app/org-select/page');
    const result = await OrgSelectPage();

    // The rendered JSX tree should carry the NonMemberEmptyState content.
    const html = renderToStaticMarkup(result as React.ReactElement);
    expect(html).toContain('<h1>No access</h1>');
    expect(html).toContain(O3_COPY);
  });

  it('does not render old placeholder copy when user has zero orgs', async () => {
    mockCreateServer.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u-001' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as never);

    const { default: OrgSelectPage } = await import('@/app/org-select/page');
    const result = await OrgSelectPage();
    const html = renderToStaticMarkup(result as React.ReactElement);
    expect(html).not.toContain('No organisations found');
    expect(html).not.toContain('Ask your organisation admin to install the app');
  });
});
