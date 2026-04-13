// Unit tests for /auth/callback route — sign-in cutover.
// Design reference: docs/design/lld-onboarding-auth-cutover.md §7

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/route-handler', () => ({
  createRouteHandlerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-membership', () => ({
  resolveUserOrgsViaApp: vi.fn(),
}));

vi.mock('@/lib/observability/signin-events', () => ({
  emitSigninEvent: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import { emitSigninEvent } from '@/lib/observability/signin-events';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);
const mockRpc = vi.fn().mockResolvedValue({ data: 0, error: null });
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);
const mockResolve = vi.mocked(resolveUserOrgsViaApp);
const mockEmit = vi.mocked(emitSigninEvent);

const TEST_USER = {
  id: 'user-123',
  user_metadata: { provider_id: '42', user_name: 'alice' },
};

function mockSession(user = TEST_USER) {
  return { data: { session: { user } }, error: null };
}

describe('/auth/callback', () => {
  const mockExchangeCode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
  });

  it('redirects to /assessments on successful sign-in with matching orgs', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/assessments');
    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'user-123', githubUserId: 42, githubLogin: 'alice' },
      {},
    );
    expect(mockEmit).toHaveBeenCalledWith('success', expect.objectContaining({
      user_id: 'user-123',
      matched_org_count: 1,
    }));
  });

  it('redirects to /assessments with no_access event when user has no matching orgs', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockResolvedValue([]);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/assessments');
    expect(mockEmit).toHaveBeenCalledWith('no_access', expect.objectContaining({
      matched_org_count: 0,
    }));
  });

  it('redirects to /auth/sign-in?error=missing_code when no code is present', async () => {
    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/sign-in?error=missing_code');
  });

  it('redirects to /auth/sign-in?error=auth_failed when exchangeCodeForSession fails', async () => {
    mockExchangeCode.mockResolvedValue({
      data: { session: null },
      error: { message: 'invalid grant' },
    });

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=bad');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
  });

  it('redirects to /auth/sign-in?error=auth_failed when resolveUserOrgsViaApp throws', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockRejectedValue(new Error('GitHub API down'));

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
    expect(mockEmit).toHaveBeenCalledWith('error', expect.objectContaining({
      user_id: 'user-123',
      matched_org_count: 0,
    }));
  });

  it('calls link_all_participants to bulk-link unlinked participant records', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    await GET(request);

    expect(mockRpc).toHaveBeenCalledWith('link_all_participants', {
      p_user_id: 'user-123',
      p_github_user_id: 42,
    });
  });

  it('logs a warning when link_all_participants returns a Supabase error', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB failure' } });

    const { logger } = await import('@/lib/logger');
    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/assessments');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: { message: 'DB failure' } }),
      'link_all_participants failed',
    );
  });

  it('does not read session.provider_token', async () => {
    const userWithToken = { ...TEST_USER };
    const session = { user: userWithToken, provider_token: 'should-be-ignored' };
    mockExchangeCode.mockResolvedValue({ data: { session }, error: null });
    mockResolve.mockResolvedValue([]);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    await GET(request);

    // resolveUserOrgsViaApp should NOT receive the provider_token
    const callArgs = mockResolve.mock.calls[0];
    expect(callArgs?.[1]).not.toHaveProperty('providerToken');
  });

  it('does not call syncOrgMembership or /user/orgs (both removed)', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockResolvedValue([]);

    const { NextRequest } = await import('next/server');
    const request = new NextRequest('http://localhost/auth/callback?code=valid');
    const { GET } = await import('@/app/auth/callback/route');
    await GET(request);

    // syncOrgMembership module should not exist at all
    await expect(import('@/lib/supabase/org-sync')).rejects.toThrow();
  });
});
