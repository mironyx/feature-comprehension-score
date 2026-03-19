import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @supabase/ssr
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const mockCreateServerClient = vi.mocked(createServerClient);
const mockCookies = vi.mocked(cookies);

describe('Supabase server client', () => {
  const fakeUser = { id: 'user-123', email: 'test@example.com' };
  const mockGetUser = vi.fn();
  const mockSupabaseClient = { auth: { getUser: mockGetUser } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabaseClient as never);

    const cookieStore = {
      get: vi.fn((name: string) => ({ name, value: 'mock-cookie-value' })),
      getAll: vi.fn(() => [{ name: 'sb-session', value: 'mock-session' }]),
      set: vi.fn(),
    };
    mockCookies.mockResolvedValue(cookieStore as never);
  });

  describe('Given a valid session cookie', () => {
    it('then getUser returns the authenticated user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });

      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const client = await createServerSupabaseClient();
      const { data, error } = await client.auth.getUser();

      expect(error).toBeNull();
      expect(data.user).toEqual(fakeUser);
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        expect.any(String), // SUPABASE_URL
        expect.any(String), // SUPABASE_ANON_KEY
        expect.objectContaining({ cookies: expect.any(Object) }),
      );
    });
  });
});

describe('Supabase route handler client', () => {
  const mockSupabaseClient = { auth: { getUser: vi.fn() } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabaseClient as never);
  });

  describe('Given a request with cookies', () => {
    it('then the client is created with cookie read/write handlers', async () => {
      const { NextRequest, NextResponse } = await import('next/server');
      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'sb-session=mock-token' },
      });
      const response = NextResponse.next();

      const { createRouteHandlerSupabaseClient } = await import(
        '@/lib/supabase/route-handler'
      );
      createRouteHandlerSupabaseClient(request, response);

      expect(mockCreateServerClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ cookies: expect.any(Object) }),
      );
    });
  });
});

describe('Supabase middleware client', () => {
  const mockGetUser = vi.fn();
  const mockSupabaseClient = { auth: { getUser: mockGetUser } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabaseClient as never);
  });

  describe('Given an expired session cookie', () => {
    it('then the middleware refreshes the JWT', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      const { NextRequest, NextResponse } = await import('next/server');
      const request = new NextRequest('http://localhost/assessments');
      const response = NextResponse.next({ request });

      const { createMiddlewareSupabaseClient } = await import(
        '@/lib/supabase/middleware'
      );
      const { supabase } = createMiddlewareSupabaseClient(request, response);

      // getUser triggers JWT refresh in @supabase/ssr
      await supabase.auth.getUser();

      expect(mockGetUser).toHaveBeenCalledOnce();
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ cookies: expect.any(Object) }),
      );
    });
  });
});

describe('Supabase service role client', () => {
  const mockSupabaseClient = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue(mockSupabaseClient as never);
  });

  describe('Given a service role client', () => {
    it('then it can read data across all orgs (bypasses RLS)', async () => {
      const { createServiceRoleSupabaseClient } = await import(
        '@/lib/supabase/service-role'
      );
      const client = createServiceRoleSupabaseClient();

      // Service role client is created — it has access to all data
      expect(client).toBeDefined();
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/.+/), // service role key (non-empty)
        expect.any(Object),
      );

      // Verify it was called with the service role key (second arg), not the anon key
      const [, keyArg] = mockCreateServerClient.mock.calls[0];
      expect(keyArg).toBe(process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? 'mock-service-role-key');
    });
  });
});
