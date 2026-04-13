// Adversarial evaluation tests for issue #206 — participant discovery fix.
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
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import { emitSigninEvent } from '@/lib/observability/signin-events';
import { logger } from '@/lib/logger';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);
const mockResolve = vi.mocked(resolveUserOrgsViaApp);
const mockEmit = vi.mocked(emitSigninEvent);
const mockLogger = vi.mocked(logger);

// ---------------------------------------------------------------------------
// Helpers — reuse constants from the feature test file shape, do not copy helpers
// ---------------------------------------------------------------------------
const TEST_USER = {
  id: 'user-123',
  user_metadata: { provider_id: '42', user_name: 'alice' },
};

function mockSession(user = TEST_USER) {
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
// AC-1: link_all_participants is NOT called when metadata validation fails early.
// If it were called with NaN/0 it could corrupt participants for github_user_id 0.
// ---------------------------------------------------------------------------
describe('AC-1 — link_all_participants is skipped on bad metadata', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
  });

  it('does not call link_all_participants when provider_id is missing', async () => {
    const userMissingId = { ...TEST_USER, user_metadata: { user_name: 'alice' } };
    mockExchangeCode.mockResolvedValue(mockSession(userMissingId as never));

    const GET = await importGET();
    await GET(await makeRequest());

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not call link_all_participants when user_name is missing', async () => {
    const userMissingName = { ...TEST_USER, user_metadata: { provider_id: '42' } };
    mockExchangeCode.mockResolvedValue(mockSession(userMissingName as never));

    const GET = await importGET();
    await GET(await makeRequest());

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('does not call link_all_participants when provider_id is 0 (empty string coerces to 0)', async () => {
    const userZeroId = { ...TEST_USER, user_metadata: { provider_id: '', user_name: 'alice' } };
    mockExchangeCode.mockResolvedValue(mockSession(userZeroId as never));

    const GET = await importGET();
    await GET(await makeRequest());

    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-2: link_all_participants RPC error (non-thrown Supabase error object) is
// handled and does NOT silently succeed the login without any signal.
// The current implementation awaits the RPC but never inspects { error }.
// ---------------------------------------------------------------------------
describe('AC-2 — link_all_participants Supabase error handling', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);
    mockExchangeCode.mockResolvedValue(mockSession());
  });

  it('logs a warning or error when link_all_participants returns a Supabase error', async () => {
    // Supabase client returns { data: null, error: {...} } — does NOT throw.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "assessment_participants" does not exist' } });

    const GET = await importGET();
    await GET(await makeRequest());

    // Finding: the route does not inspect the error field, so this passes
    // without any log. The test assertion below will FAIL if the implementation
    // silently discards the error, confirming the gap.
    const errorCalled = mockLogger.error.mock.calls.some(
      (args) => JSON.stringify(args).includes('link_all_participants'),
    );
    const warnCalled = (mockLogger.warn as ReturnType<typeof vi.fn>).mock.calls.some(
      (args: unknown[]) => JSON.stringify(args).includes('link_all_participants'),
    );
    expect(errorCalled || warnCalled).toBe(true);
  });

  it('still redirects to /assessments (not auth_failed) when link_all_participants returns a non-fatal error', async () => {
    // A DB error in linking should be non-fatal — the user can still log in.
    // Current implementation: rpc error is not inspected so this passes,
    // but the intent should be explicit in code.
    mockRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    const GET = await importGET();
    const response = await GET(await makeRequest());

    expect(response.headers.get('location')).toContain('/assessments');
    expect(response.headers.get('location')).not.toContain('auth_failed');
  });
});

// ---------------------------------------------------------------------------
// AC-3: link_all_participants throwing (network-level error) causes auth_failed.
// This means a transient DB outage blocks login entirely — a design risk.
// The test documents the actual behaviour so it is visible to reviewers.
// ---------------------------------------------------------------------------
describe('AC-3 — link_all_participants throw causes login failure (design risk)', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);
    mockExchangeCode.mockResolvedValue(mockSession());
  });

  it('redirects to auth_failed when link_all_participants throws a network error', async () => {
    // Current behaviour: rpc throw is caught by the outer try/catch, causing
    // auth_failed. This means DB outage blocks login. Documents actual behaviour.
    mockRpc.mockRejectedValue(new Error('ECONNRESET'));

    const GET = await importGET();
    const response = await GET(await makeRequest());

    // This PASSES — but the behaviour itself is the finding.
    // A non-fatal linking failure should not block login.
    expect(response.headers.get('location')).toContain('/auth/sign-in?error=auth_failed');
  });
});

// ---------------------------------------------------------------------------
// AC-4: link_all_participants is not called when resolveUserOrgsViaApp throws.
// Participants remain unlinked if org resolution fails — documents this gap.
// ---------------------------------------------------------------------------
describe('AC-4 — link_all_participants is skipped when resolveUserOrgsViaApp throws', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
  });

  it('does not call link_all_participants when resolveUserOrgsViaApp throws', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());
    mockResolve.mockRejectedValue(new Error('GitHub API timeout'));

    const GET = await importGET();
    await GET(await makeRequest());

    // Finding: if org resolution fails, participants are not linked at login.
    // The user must use the direct link flow (link_participant) instead.
    // This test documents current behaviour — not a correctness bug per spec,
    // but a gap in the fix's reliability.
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-5: link_all_participants passes the correct github_user_id type.
// The SQL function takes bigint; the route passes Number(provider_id).
// Verify the value is not coerced to a string or truncated.
// ---------------------------------------------------------------------------
describe('AC-5 — link_all_participants receives numeric github_user_id', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn().mockResolvedValue({ data: 1, error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
    mockResolve.mockResolvedValue([]);
  });

  it('passes github_user_id as a number, not a string', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());

    const GET = await importGET();
    await GET(await makeRequest());

    const rpcArgs = mockRpc.mock.calls[0];
    expect(rpcArgs).toBeDefined();
    expect(typeof rpcArgs[1].p_github_user_id).toBe('number');
    expect(rpcArgs[1].p_github_user_id).toBe(42);
  });

  it('passes user id as a string UUID, not a number', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());

    const GET = await importGET();
    await GET(await makeRequest());

    const rpcArgs = mockRpc.mock.calls[0];
    expect(typeof rpcArgs[1].p_user_id).toBe('string');
    expect(rpcArgs[1].p_user_id).toBe('user-123');
  });

  it('passes the correct values for a large GitHub user id (> 32-bit int)', async () => {
    const largeIdUser = {
      ...TEST_USER,
      user_metadata: { provider_id: '9999999999', user_name: 'biguser' },
    };
    mockExchangeCode.mockResolvedValue(mockSession(largeIdUser));

    const GET = await importGET();
    await GET(await makeRequest());

    const rpcArgs = mockRpc.mock.calls[0];
    expect(rpcArgs[1].p_github_user_id).toBe(9999999999);
  });
});

// ---------------------------------------------------------------------------
// AC-6: emitSigninEvent is called AFTER link_all_participants, not before.
// If the event fires before linking completes, metrics could be misleading.
// ---------------------------------------------------------------------------
describe('AC-6 — emitSigninEvent fires after link_all_participants', () => {
  const mockExchangeCode = vi.fn();
  const callOrder: string[] = [];
  const mockRpc = vi.fn().mockImplementation(() => {
    callOrder.push('rpc');
    return Promise.resolve({ data: 1, error: null });
  });

  beforeEach(() => {
    callOrder.length = 0;
    vi.clearAllMocks();
    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);
    mockCreateSecret.mockReturnValue({ rpc: mockRpc } as never);
    mockEmit.mockImplementation((..._args) => {
      callOrder.push('emit');
    });
    mockResolve.mockResolvedValue([{ org_id: 'org-1' }] as never);
  });

  it('calls rpc before emitSigninEvent', async () => {
    mockExchangeCode.mockResolvedValue(mockSession());

    const GET = await importGET();
    await GET(await makeRequest());

    const rpcIdx = callOrder.indexOf('rpc');
    const emitIdx = callOrder.indexOf('emit');
    expect(rpcIdx).toBeGreaterThanOrEqual(0);
    expect(emitIdx).toBeGreaterThan(rpcIdx);
  });
});
