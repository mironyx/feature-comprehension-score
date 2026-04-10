// Adversarial evaluation tests for issue #179 — sign-in cutover.
// Design reference: docs/design/lld-onboarding-auth-cutover.md §7 and §8.
//
// Probes gaps in the implementation's own test suite. Failures are findings —
// do NOT fix the implementation in this file.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks must be declared before any imports that resolve those paths.
// ---------------------------------------------------------------------------
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
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);
const mockResolve = vi.mocked(resolveUserOrgsViaApp);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_USER = {
  id: 'user-123',
  user_metadata: { provider_id: '42', user_name: 'alice' },
};

function mockSession(user: typeof TEST_USER = TEST_USER) {
  return { data: { session: { user } }, error: null };
}

async function makeRequest(path = '/auth/callback?code=valid') {
  const { NextRequest } = await import('next/server');
  return new NextRequest(`http://localhost${path}`);
}

async function importGET() {
  const mod = await import('@/app/auth/callback/route');
  return mod.GET;
}

// ---------------------------------------------------------------------------
// AC §4.3 — Missing or malformed provider_id / user_name must redirect to
// auth_failed, not fall through to resolveUserOrgsViaApp with NaN/0 values.
// LLD: "if either field is missing or malformed, redirect to /auth/sign-in?error=auth_failed"
// ---------------------------------------------------------------------------
describe('/auth/callback — malformed metadata edge cases (LLD §4.3)', () => {
  const mockExchangeCode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
  });

  it('redirects to auth_failed when provider_id is missing from user_metadata', async () => {
    const userMissingId = { ...TEST_USER, user_metadata: { user_name: 'alice' } };
    mockExchangeCode.mockResolvedValue(mockSession(userMissingId as never));

    const GET = await importGET();
    const response = await GET(await makeRequest());

    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('redirects to auth_failed when user_name is missing from user_metadata', async () => {
    const userMissingLogin = { ...TEST_USER, user_metadata: { provider_id: '42' } };
    mockExchangeCode.mockResolvedValue(mockSession(userMissingLogin as never));

    const GET = await importGET();
    const response = await GET(await makeRequest());

    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('redirects to auth_failed when provider_id is an empty string (Number("") === 0, ambiguous)', async () => {
    // Number('') === 0, which is a valid-looking user id and silently misleads the resolver.
    const userEmptyId = { ...TEST_USER, user_metadata: { provider_id: '', user_name: 'alice' } };
    mockExchangeCode.mockResolvedValue(mockSession(userEmptyId as never));

    const GET = await importGET();
    const response = await GET(await makeRequest());

    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('redirects to auth_failed when provider_id is non-numeric (NaN)', async () => {
    const userNanId = { ...TEST_USER, user_metadata: { provider_id: 'not-a-number', user_name: 'alice' } };
    mockExchangeCode.mockResolvedValue(mockSession(userNanId as never));

    const GET = await importGET();
    const response = await GET(await makeRequest());

    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

