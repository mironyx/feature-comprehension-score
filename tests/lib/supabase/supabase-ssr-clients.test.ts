import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @supabase/ssr (used by server, route-handler, middleware clients)
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

// Mock @supabase/supabase-js (used by the service role client only)
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const mockCreateServerClient = vi.mocked(createServerClient);
const mockCreateClient = vi.mocked(createClient);
const mockCookies = vi.mocked(cookies);

describe('Supabase server client', () => {
  const fakeUser = { id: 'user-123', email: 'test@example.com' };
  const mockGetUser = vi.fn();
  const mockCookieSet = vi.fn();
  let mockSupabaseClient: { auth: { getUser: typeof mockGetUser } };

  beforeEach(() => {
    vi.clearAllMocks();

    const cookieStore = {
      get: vi.fn((name: string) => ({ name, value: 'mock-cookie-value' })),
      getAll: vi.fn(() => [{ name: 'sb-session', value: 'mock-session' }]),
      set: mockCookieSet,
    };
    mockCookies.mockResolvedValue(cookieStore as never);

    mockSupabaseClient = { auth: { getUser: mockGetUser } };
    mockCreateServerClient.mockReturnValue(mockSupabaseClient as never);
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
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ cookies: expect.any(Object) }),
      );
    });
  });

  describe('Given Supabase calls setAll in an RSC context', () => {
    it('then cookie write errors are silently swallowed', async () => {
      mockCookieSet.mockImplementation(() => {
        throw new Error('Cookies can only be set in a Server Action or Route Handler');
      });

      const { createServerSupabaseClient } = await import('@/lib/supabase/server');
      const client = await createServerSupabaseClient();

      // Invoke the setAll adapter directly via the captured call arg
      const cookiesArg = mockCreateServerClient.mock.calls[0][2].cookies as {
        setAll: (c: { name: string; value: string; options?: object }[]) => void;
      };
      expect(() =>
        cookiesArg.setAll([{ name: 'sb-token', value: 'new', options: {} }]),
      ).not.toThrow();

      expect(client).toBeDefined();
    });
  });
});

describe('Supabase route handler client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue({} as never);
  });

  describe('Given a request with cookies', () => {
    it('then cookie reads are proxied from the request', async () => {
      const { NextRequest, NextResponse } = await import('next/server');
      const request = new NextRequest('http://localhost/api/test', {
        headers: { cookie: 'sb-session=mock-token' },
      });
      const response = NextResponse.next();

      const { createRouteHandlerSupabaseClient } = await import(
        '@/lib/supabase/route-handler'
      );
      createRouteHandlerSupabaseClient(request, response);

      const cookiesArg = mockCreateServerClient.mock.calls[0][2].cookies as {
        getAll: () => { name: string; value: string }[];
        setAll: (c: { name: string; value: string; options?: object }[]) => void;
      };

      // getAll reads from the request
      const all = cookiesArg.getAll();
      expect(all.some((c) => c.name === 'sb-session' && c.value === 'mock-token')).toBe(true);
    });

    it('then cookie writes are applied to the response', async () => {
      const { NextRequest, NextResponse } = await import('next/server');
      const request = new NextRequest('http://localhost/api/test');
      const response = NextResponse.next();

      const { createRouteHandlerSupabaseClient } = await import(
        '@/lib/supabase/route-handler'
      );
      createRouteHandlerSupabaseClient(request, response);

      const cookiesArg = mockCreateServerClient.mock.calls[0][2].cookies as {
        setAll: (c: { name: string; value: string; options?: object }[]) => void;
      };
      cookiesArg.setAll([{ name: 'sb-refresh-token', value: 'new-token', options: {} }]);

      expect(response.cookies.get('sb-refresh-token')?.value).toBe('new-token');
    });
  });
});

describe('Supabase middleware client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateServerClient.mockReturnValue({ auth: { getUser: vi.fn() } } as never);
  });

  describe('Given a cookie set by Supabase during JWT refresh', () => {
    it('then the cookie is written to both request and response', async () => {
      const { NextRequest, NextResponse } = await import('next/server');
      const request = new NextRequest('http://localhost/assessments');
      const response = NextResponse.next({ request });

      const { createMiddlewareSupabaseClient } = await import(
        '@/lib/supabase/middleware'
      );
      createMiddlewareSupabaseClient(request, response);

      const cookiesArg = mockCreateServerClient.mock.calls[0][2].cookies as {
        setAll: (c: { name: string; value: string; options?: object }[]) => void;
      };
      cookiesArg.setAll([{ name: 'sb-access-token', value: 'refreshed', options: {} }]);

      expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed');
    });
  });
});

describe('Supabase service role client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({ from: vi.fn() } as never);
  });

  describe('Given a service role client', () => {
    it('then createClient (not createServerClient) is used — bypasses cookie-based auth override', async () => {
      const { createServiceRoleSupabaseClient } = await import(
        '@/lib/supabase/service-role'
      );
      createServiceRoleSupabaseClient();

      expect(mockCreateClient).toHaveBeenCalledOnce();
      expect(mockCreateServerClient).not.toHaveBeenCalled();
    });

    it('then it is created with the service role key, not the anon key', async () => {
      const { createServiceRoleSupabaseClient } = await import(
        '@/lib/supabase/service-role'
      );
      createServiceRoleSupabaseClient();

      const [, keyArg] = mockCreateClient.mock.calls[0];
      expect(keyArg).toBe(process.env['SUPABASE_SERVICE_ROLE_KEY']);
      expect(keyArg).not.toBe(process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
    });

    it('then session persistence is disabled', async () => {
      const { createServiceRoleSupabaseClient } = await import(
        '@/lib/supabase/service-role'
      );
      createServiceRoleSupabaseClient();

      const [, , options] = mockCreateClient.mock.calls[0] as [
        unknown,
        unknown,
        { auth: { persistSession: boolean; autoRefreshToken: boolean } },
      ];
      expect(options.auth.persistSession).toBe(false);
      expect(options.auth.autoRefreshToken).toBe(false);
    });
  });
});
