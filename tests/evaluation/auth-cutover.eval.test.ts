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
import { emitSigninEvent } from '@/lib/observability/signin-events';
import { buildMockClient, INPUT } from '../fixtures/org-membership-mocks';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);
const mockResolve = vi.mocked(resolveUserOrgsViaApp);
const mockEmit = vi.mocked(emitSigninEvent);

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

// ---------------------------------------------------------------------------
// AC — emitSigninEvent('success') fires when first-install fallback supplies the org.
// The callback test covers "no orgs → no_access" and "orgs → success" but does NOT
// exercise the branch where resolveUserOrgsViaApp returns 1 result that came from
// the first-install fallback (rather than the primary path). The event shape is the
// same — this test ensures the 'success' emit is not gated on some other flag.
// ---------------------------------------------------------------------------
describe('/auth/callback — emitSigninEvent with first-install fallback result', () => {
  const mockExchangeCode = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
  });

  it('emits success when resolveUserOrgsViaApp returns 1 org (fallback path)', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    // Simulates the fallback returning the installer's org
    mockResolve.mockResolvedValue([{ org_id: 'org-new', github_role: 'admin' }] as never);

    const GET = await importGET();
    await GET(await makeRequest());

    expect(mockEmit).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({ matched_org_count: 1 }),
    );
  });
});

// ---------------------------------------------------------------------------
// AC — first-install race: 5-minute window is enforced at the DB query level.
// The unit tests use mocks that return data unconditionally; this test verifies
// that findFirstInstallAsInstaller computes the timestamp correctly.
// It does so by checking the value passed to .gte() against the expected boundary.
// ---------------------------------------------------------------------------
describe('findFirstInstallAsInstaller — 5-minute window uses correct timestamp', () => {
  it('passes a created_at lower bound within ~1 second of 5 minutes ago', async () => {
    // vi.importActual bypasses the module mock so we call the real implementation.
    const { resolveUserOrgsViaApp: resolve } = await vi.importActual<
      typeof import('@/lib/supabase/org-membership')
    >('@/lib/supabase/org-membership');

    // Build a client that captures the gte() argument from the installer chain.
    let capturedGteArg: string | undefined;
    const installerChain = {
      eq: vi.fn().mockImplementation(() => {
        return installerChain;
      }),
      gte: vi.fn().mockImplementation((_field: string, value: string) => {
        capturedGteArg = value;
        return {
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };

    // First organisations query (matchOrgsForUser) returns empty so we enter the fallback.
    const primaryOrgChain = {
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    let orgSelectCallCount = 0;
    const fromSpy = vi.fn((table: string) => {
      if (table === 'organisations') {
        orgSelectCallCount++;
        if (orgSelectCallCount === 1) {
          return { select: vi.fn().mockReturnValue(primaryOrgChain) };
        }
        return { select: vi.fn().mockReturnValue(installerChain) };
      }
      if (table === 'user_organisations') {
        return {
          upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(
              Object.assign(Promise.resolve({ data: null, error: null }), {
                not: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            ),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const client = { from: fromSpy } as never;
    const before = Date.now();

    await resolve(client, INPUT, {}, { firstInstallFallback: true });

    const after = Date.now();

    expect(capturedGteArg).toBeDefined();
    const gteMs = new Date(capturedGteArg!).getTime();
    const expectedMs = before - 5 * 60 * 1000;
    // The gte value should be within 1 second of "5 minutes ago"
    expect(gteMs).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(gteMs).toBeLessThanOrEqual(after - 5 * 60 * 1000 + 1000);
  });
});

// ---------------------------------------------------------------------------
// AC — firstInstallFallback defaults to false (not set) when not passed.
// The callback always passes { firstInstallFallback: true }, but the default
// exported function must NOT activate fallback when called without opts.
// ---------------------------------------------------------------------------
describe('resolveUserOrgsViaApp — firstInstallFallback defaults to false', () => {
  it('does not query installer orgs when opts is omitted entirely', async () => {
    // vi.importActual bypasses the module mock so we call the real implementation.
    const { resolveUserOrgsViaApp: resolve } = await vi.importActual<
      typeof import('@/lib/supabase/org-membership')
    >('@/lib/supabase/org-membership');

    const { client, upsertSpy } = buildMockClient({
      installedOrgs: [],
      finalUserOrgs: [],
    });
    const fetchImpl = vi.fn();

    // If firstInstallFallback were true by default, the mock would need installerOrgs
    // and userOrgCount — without them the mock throws "Unexpected table".
    // The test passes if no second organisations query is issued.
    const fromSpy = vi.mocked(client.from);
    const callsBefore = fromSpy.mock.calls.length;

    const result = await resolve(
      client,
      INPUT,
      { fetchImpl: fetchImpl as unknown as typeof fetch, getInstallationToken: async () => 'ghs' },
      // opts intentionally omitted
    );

    expect(result).toHaveLength(0);
    // Only 1 organisations query (the primary matchOrgsForUser), not 2.
    const orgCalls = fromSpy.mock.calls
      .slice(callsBefore)
      .filter(([t]) => t === 'organisations');
    expect(orgCalls).toHaveLength(1);
    void upsertSpy; // suppress unused warning
  });
});
