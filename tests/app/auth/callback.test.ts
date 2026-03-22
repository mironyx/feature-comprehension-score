import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase clients
vi.mock('@/lib/supabase/route-handler', () => ({
  createRouteHandlerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(),
}));

import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

const mockCreateRouteHandler = vi.mocked(createRouteHandlerSupabaseClient);
const mockCreateSecret = vi.mocked(createSecretSupabaseClient);

describe('Auth callback route', () => {
  const mockExchangeCode = vi.fn();
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateRouteHandler.mockReturnValue({
      auth: { exchangeCodeForSession: mockExchangeCode },
    } as never);

    mockCreateSecret.mockReturnValue({
      rpc: mockRpc,
    } as never);
  });

  describe('Given a valid OAuth callback with auth code', () => {
    it('then it exchanges for session and redirects to /assessments', async () => {
      mockExchangeCode.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' },
            provider_token: 'gh-token-xyz',
          },
        },
        error: null,
      });
      mockRpc.mockResolvedValue({ error: null });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest(
        'http://localhost/auth/callback?code=valid-code',
      );

      const { GET } = await import('@/app/auth/callback/route');
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/assessments');
      expect(mockExchangeCode).toHaveBeenCalledWith('valid-code');
    });
  });

  describe('Given a provider token in the session', () => {
    it('then it encrypts and stores the token in user_github_tokens', async () => {
      mockExchangeCode.mockResolvedValue({
        data: {
          session: {
            user: { id: 'user-123' },
            provider_token: 'gh-token-xyz',
          },
        },
        error: null,
      });
      mockRpc.mockResolvedValue({ error: null });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest(
        'http://localhost/auth/callback?code=valid-code',
      );

      const { GET } = await import('@/app/auth/callback/route');
      await GET(request);

      expect(mockRpc).toHaveBeenCalledWith('store_github_token', {
        p_user_id: 'user-123',
        p_token: 'gh-token-xyz',
      });
    });
  });

  describe('Given a code exchange failure', () => {
    it('then it redirects to /auth/sign-in with error', async () => {
      mockExchangeCode.mockResolvedValue({
        data: { session: null },
        error: { message: 'invalid grant' },
      });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest(
        'http://localhost/auth/callback?code=bad-code',
      );

      const { GET } = await import('@/app/auth/callback/route');
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain(
        '/auth/sign-in?error=auth_failed',
      );
    });
  });

  describe('Given a missing auth code', () => {
    it('then it redirects to /auth/sign-in with error', async () => {
      const { NextRequest } = await import('next/server');
      const request = new NextRequest('http://localhost/auth/callback');

      const { GET } = await import('@/app/auth/callback/route');
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain(
        '/auth/sign-in?error=missing_code',
      );
      expect(mockExchangeCode).not.toHaveBeenCalled();
    });
  });
});
