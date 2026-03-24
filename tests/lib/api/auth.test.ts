// Tests for auth extraction and enforcement helpers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api/errors';

// ---------------------------------------------------------------------------
// Mock Supabase SSR client
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

import { extractUser, requireAuth, requireOrgAdmin } from '@/lib/api/auth';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_AUTH_USER = {
  id: 'user-uuid-001',
  email: 'alice@example.com',
  user_metadata: {
    provider_id: '12345',
    user_name: 'alice',
  },
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/test');
}

function mockAuthSuccess() {
  mockGetUser.mockResolvedValue({ data: { user: VALID_AUTH_USER }, error: null });
}

function mockAuthFailure() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function mockAuthError() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Network failure' } });
}

function mockOrgAdminQuery(role: string | null) {
  const selectMock = vi.fn().mockReturnThis();
  const eqUserMock = vi.fn().mockReturnThis();
  const eqOrgMock = vi.fn().mockResolvedValue({
    data: role ? [{ github_role: role }] : [],
    error: null,
  });

  mockFrom.mockReturnValue({
    select: selectMock,
    eq: eqUserMock,
  });

  // Chain: from().select().eq().eq()
  selectMock.mockReturnValue({ eq: eqUserMock });
  eqUserMock.mockReturnValue({ eq: eqOrgMock });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractUser', () => {
  describe('Given a request with a valid session', () => {
    it('then it returns the AuthUser', async () => {
      mockAuthSuccess();
      const user = await extractUser(makeRequest());
      expect(user).toEqual({
        id: 'user-uuid-001',
        email: 'alice@example.com',
        githubUserId: 12345,
        githubUsername: 'alice',
      });
    });
  });

  describe('Given a request with no session', () => {
    it('then it returns null', async () => {
      mockAuthFailure();
      const user = await extractUser(makeRequest());
      expect(user).toBeNull();
    });
  });

  describe('Given a Supabase auth error', () => {
    it('then it throws ApiError with status 500', async () => {
      mockAuthError();
      await expect(extractUser(makeRequest())).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });
});

describe('requireAuth', () => {
  describe('Given a request with valid session', () => {
    it('then it returns the AuthUser', async () => {
      mockAuthSuccess();
      const user = await requireAuth(makeRequest());
      expect(user.id).toBe('user-uuid-001');
      expect(user.email).toBe('alice@example.com');
    });
  });

  describe('Given a request with no session', () => {
    it('then it throws ApiError with status 401', async () => {
      mockAuthFailure();
      await expect(requireAuth(makeRequest())).rejects.toThrow(ApiError);
      await expect(requireAuth(makeRequest())).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});

describe('requireOrgAdmin', () => {
  describe('Given an org admin user', () => {
    it('then it returns the AuthUser', async () => {
      mockAuthSuccess();
      mockOrgAdminQuery('admin');
      const user = await requireOrgAdmin(makeRequest(), 'org-uuid-001');
      expect(user.id).toBe('user-uuid-001');
    });
  });

  describe('Given a non-admin user', () => {
    it('then it throws ApiError with status 403', async () => {
      mockAuthSuccess();
      mockOrgAdminQuery('member');
      await expect(requireOrgAdmin(makeRequest(), 'org-uuid-001')).rejects.toThrow(ApiError);
      await expect(requireOrgAdmin(makeRequest(), 'org-uuid-001')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('Given a user not in the org', () => {
    it('then it throws ApiError with status 403', async () => {
      mockAuthSuccess();
      mockOrgAdminQuery(null);
      await expect(requireOrgAdmin(makeRequest(), 'org-uuid-001')).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });
});
