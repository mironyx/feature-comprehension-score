import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/middleware', () => ({
  createMiddlewareSupabaseClient: vi.fn(),
}));

import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

const mockCreateMiddleware = vi.mocked(createMiddlewareSupabaseClient);

describe('Session middleware', () => {
  const mockGetUser = vi.fn();

  function makeMockClient() {
    return { auth: { getUser: mockGetUser } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMiddleware.mockImplementation((req, res) => ({
      supabase: makeMockClient() as never,
      response: res,
    }));
  });

  describe('Given no session cookie on a protected route', () => {
    it('then it redirects to /auth/sign-in', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest('http://localhost/assessments');

      const { middleware } = await import('@/middleware');
      const response = await middleware(request, {} as never);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/auth/sign-in');
    });
  });

  describe('Given a valid session cookie', () => {
    it('then it allows the request to proceed', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest('http://localhost/assessments');

      const { middleware } = await import('@/middleware');
      const response = await middleware(request, {} as never);

      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('Given a request to /api/webhooks/github', () => {
    it('then the middleware matcher excludes the webhook path', async () => {
      // The webhook route is excluded from the matcher entirely so the
      // middleware function is never invoked for it in production.
      // Verify the exported matcher pattern reflects this.
      const { config } = await import('@/middleware');
      const pattern = config.matcher[0];
      expect(pattern).toBeDefined();

      // Verify the pattern string includes the public path exclusions
      expect(pattern).toContain('api/webhooks/');
      expect(pattern).toContain('auth/');
    });
  });
});
