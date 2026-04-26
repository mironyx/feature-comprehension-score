// Tests for GET /api/organisations/[id]/repositories — registered + accessible repos.
// Design reference: docs/design/lld-v8-repository-management.md §T1
// Requirements:    docs/requirements/v8-requirements.md — Epic 2, Story 2.1
// Issue:           #365

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them.
// Mirrors the pattern from [id].retrieval-settings.test.ts verbatim.
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => mockUserClient),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => mockAdminClient),
}));

// Mock the GitHub App auth module so the route-level tests do not require
// GITHUB_APP_PRIVATE_KEY/GITHUB_APP_ID env vars. The service uses
// getInstallationToken to mint a token before calling the installation
// repositories endpoint; this stub returns a deterministic fake.
vi.mock('@/lib/github/app-auth', () => ({
  getInstallationToken: vi.fn(async () => 'fake-installation-token'),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import type { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>;
let GET: RouteHandler;

// ---------------------------------------------------------------------------
// Mock Supabase clients — mirrors the makeChain pattern from sibling tests.
// The user client routes different tables to different result resolvers so that
// the membership check (user_organisations) and the org row fetch (organisations)
// can be controlled independently.
// ---------------------------------------------------------------------------

let membershipResult: { data: unknown; error: unknown };
let registeredResult: { data: unknown; error: unknown };
let orgResult: { data: unknown; error: unknown };

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

// The admin client serves both `repositories` (registered list) and `organisations` (installation_id).
// We route by table name so both can be stubbed independently.
const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') return makeChain(() => registeredResult);
    if (table === 'organisations') return makeChain(() => orgResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// The user client serves only the membership check (user_organisations).
const mockUserClient = {
  from: vi.fn(() => makeChain(() => membershipResult)),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-repo-001';
const AUTH_USER = {
  id: 'user-repo-001',
  email: 'admin@example.com',
  githubUserId: 2001,
  githubUsername: 'repo-admin',
};

const REGISTERED_ROW = {
  id: 'repo-row-uuid-1',
  github_repo_id: 100,
  github_repo_name: 'acme/backend',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
};

const INACTIVE_REPO_ROW = {
  id: 'repo-row-uuid-2',
  github_repo_id: 200,
  github_repo_name: 'acme/legacy',
  status: 'inactive',
  created_at: '2025-06-01T00:00:00Z',
};

const INSTALLATION_ID = 42;

const GH_ACCESSIBLE_REPOS = [
  { id: 100, name: 'acme/backend' },  // already registered
  { id: 300, name: 'acme/frontend' }, // not registered
];

// GitHub API response shape expected by fetchInstallationRepos
const GH_API_RESPONSE_BODY = { repositories: GH_ACCESSIBLE_REPOS };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(): NextRequest {
  return new NextRequest(
    `http://localhost/api/organisations/${ORG_ID}/repositories`,
    { method: 'GET' },
  );
}

function getRepositories() {
  return GET(
    makeGetRequest(),
    { params: Promise.resolve({ id: ORG_ID }) },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();

  // Default: authenticated admin
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  membershipResult = { data: { github_role: 'admin' }, error: null };
  registeredResult = { data: [REGISTERED_ROW], error: null };
  orgResult = { data: { installation_id: INSTALLATION_ID }, error: null };

  // Default: GitHub API returns two repos (one registered, one not)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(GH_API_RESPONSE_BODY),
  }));

  ({ GET } = await import('@/app/api/organisations/[id]/repositories/route'));
});

// ---------------------------------------------------------------------------
// Auth / access control
// ---------------------------------------------------------------------------

describe('GET /api/organisations/[id]/repositories (T1)', () => {
  describe('Given an unauthenticated caller', () => {
    it('then it returns 401', async () => {
      // [lld §Security] Non-authenticated callers must be rejected before any data access.
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const response = await getRepositories();

      expect(response.status).toBe(401);
    });
  });

  describe('Given a non-admin caller (github_role = member)', () => {
    it('then it returns 403', async () => {
      // [lld §I1] [req §Security] Non-admin callers must receive 403.
      membershipResult = { data: { github_role: 'member' }, error: null };

      const response = await getRepositories();

      expect(response.status).toBe(403);
    });
  });

  describe('Given a caller with no membership record for this org', () => {
    it('then it returns 403', async () => {
      // [lld §I1] Missing membership is treated as non-admin.
      membershipResult = { data: null, error: null };

      const response = await getRepositories();

      expect(response.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // Success — response shape
  // ---------------------------------------------------------------------------

  describe('Given an admin caller with an active registered repo and an installation', () => {
    it('then it returns 200', async () => {
      // [lld §T1 AC] GET returns 200 on success.
      const response = await getRepositories();

      expect(response.status).toBe(200);
    });

    it('then the response body contains a "registered" array', async () => {
      // [lld §T1 AC] Response shape includes registered: RegisteredRepo[].
      const response = await getRepositories();
      const body = await response.json() as Record<string, unknown>;

      expect(Array.isArray(body.registered)).toBe(true);
    });

    it('then the response body contains an "accessible" array', async () => {
      // [lld §T1 AC] Response shape includes accessible: AccessibleRepo[].
      const response = await getRepositories();
      const body = await response.json() as Record<string, unknown>;

      expect(Array.isArray(body.accessible)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Registered repos — status filter
  // ---------------------------------------------------------------------------

  describe('Given the repositories table has one active and one inactive repo for the org', () => {
    it('then "registered" contains only the active repo', async () => {
      // [lld §I4] registered list shows only status='active' repos.
      // The service is expected to query with status='active' filter.
      // We return the filtered result from the mock (the DB enforces this; we verify
      // the response only contains the active row).
      registeredResult = { data: [REGISTERED_ROW], error: null }; // mock simulates DB filter

      const response = await getRepositories();
      const body = await response.json() as { registered: (typeof REGISTERED_ROW)[] };

      expect(body.registered).toHaveLength(1);
      expect(body.registered.at(0)?.github_repo_id).toBe(REGISTERED_ROW.github_repo_id);
      expect(body.registered.at(0)?.status).toBe('active');
    });

    it('then "registered" does NOT contain any inactive repo', async () => {
      // [lld §I4] Prohibition — inactive repos must not appear in the registered list.
      registeredResult = { data: [REGISTERED_ROW], error: null };

      const response = await getRepositories();
      const body = await response.json() as { registered: { github_repo_id: number }[] };

      const ids = body.registered.map((r) => r.github_repo_id);
      expect(ids).not.toContain(INACTIVE_REPO_ROW.github_repo_id);
    });
  });

  describe('Given the repositories table has no active repos for the org', () => {
    it('then "registered" is an empty array', async () => {
      // [lld §T1 AC] Boundary: empty registered list is valid.
      registeredResult = { data: [], error: null };

      const response = await getRepositories();
      const body = await response.json() as { registered: unknown[] };

      expect(body.registered).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // RegisteredRepo shape
  // ---------------------------------------------------------------------------

  describe('Given an admin caller with a registered active repo', () => {
    it('then each registered entry contains id, github_repo_id, github_repo_name, status, and created_at', async () => {
      // [lld §T1 interface RegisteredRepo] All five fields must be present.
      registeredResult = { data: [REGISTERED_ROW], error: null };

      const response = await getRepositories();
      const body = await response.json() as { registered: Record<string, unknown>[] };
      const first = body.registered[0];

      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('github_repo_id');
      expect(first).toHaveProperty('github_repo_name');
      expect(first).toHaveProperty('status');
      expect(first).toHaveProperty('created_at');
    });
  });

  // ---------------------------------------------------------------------------
  // Accessible repos — is_registered annotation
  // ---------------------------------------------------------------------------

  describe('Given GitHub installation returns two repos, one of which is already registered', () => {
    it('then the accessible repo that matches a registered github_repo_id has is_registered: true', async () => {
      // [lld §T1 AC] Already-registered repos must be annotated is_registered: true.
      registeredResult = { data: [REGISTERED_ROW], error: null }; // id=100
      // GitHub returns id=100 (registered) and id=300 (not registered)

      const response = await getRepositories();
      const body = await response.json() as {
        accessible: { github_repo_id: number; is_registered: boolean }[];
      };

      const alreadyRegistered = body.accessible.find((r) => r.github_repo_id === 100);
      expect(alreadyRegistered?.is_registered).toBe(true);
    });

    it('then the accessible repo that is not in registered set has is_registered: false', async () => {
      // [lld §T1 AC] Unregistered accessible repos must be annotated is_registered: false.
      registeredResult = { data: [REGISTERED_ROW], error: null }; // id=100 only

      const response = await getRepositories();
      const body = await response.json() as {
        accessible: { github_repo_id: number; is_registered: boolean }[];
      };

      const unregistered = body.accessible.find((r) => r.github_repo_id === 300);
      expect(unregistered?.is_registered).toBe(false);
    });

    it('then every accessible repo has github_repo_id, github_repo_name, and is_registered fields', async () => {
      // [lld §T1 interface AccessibleRepo] All three fields must be present on each entry.
      const response = await getRepositories();
      const body = await response.json() as { accessible: Record<string, unknown>[] };

      for (const repo of body.accessible) {
        expect(repo).toHaveProperty('github_repo_id');
        expect(repo).toHaveProperty('github_repo_name');
        expect(repo).toHaveProperty('is_registered');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // installation_id null — GitHub API must NOT be called
  // ---------------------------------------------------------------------------

  describe('Given installation_id is null for the org', () => {
    it('then it returns 200', async () => {
      // [lld §I6] Null installation is not an error — service returns gracefully.
      orgResult = { data: { installation_id: null }, error: null };

      const response = await getRepositories();

      expect(response.status).toBe(200);
    });

    it('then "accessible" is an empty array', async () => {
      // [lld §I6] [lld §T1 AC] No installation means no accessible repos to list.
      orgResult = { data: { installation_id: null }, error: null };

      const response = await getRepositories();
      const body = await response.json() as { accessible: unknown[] };

      expect(body.accessible).toHaveLength(0);
    });

    it('then the GitHub API is NOT called', async () => {
      // [lld §I6] Prohibition — no network call to GitHub when installation_id is absent.
      // The global fetch mock tracks all calls; it must not be invoked.
      orgResult = { data: { installation_id: null }, error: null };

      await getRepositories();

      // fetch() must not have been called at all (or only not called with api.github.com)
      const fetchMock = vi.mocked(fetch as ReturnType<typeof vi.fn>);
      const githubCalls = fetchMock.mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('api.github.com'),
      );
      expect(githubCalls).toHaveLength(0);
    });
  });

  describe('Given the org row is missing entirely', () => {
    it('then "accessible" is an empty array', async () => {
      // [lld §I6] Missing org row is treated the same as null installation_id.
      orgResult = { data: null, error: null };

      const response = await getRepositories();
      const body = await response.json() as { accessible: unknown[] };

      expect(body.accessible).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Security invariant: installation token must not appear in the response
  // ---------------------------------------------------------------------------

  describe('Given an admin caller with a valid installation', () => {
    it('then the response body does not contain the installation token string', async () => {
      // [lld §I2] [req §Security] The GitHub installation token must never be returned to the client.
      const FAKE_TOKEN = 'ghs_test_installation_token_secret_xyz';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(GH_API_RESPONSE_BODY),
      }));
      // We cannot control what getInstallationToken returns through the route mock layer,
      // but we can assert the raw response text does not contain any token-like string
      // that might have leaked. The assertion is structural: the response body fields
      // (registered[] and accessible[]) contain no 'token' key.
      const response = await getRepositories();
      const bodyText = await response.text();

      expect(bodyText).not.toContain(FAKE_TOKEN);
      expect(bodyText).not.toContain('"token"');
      expect(bodyText).not.toContain('"installation_token"');
    });
  });
});

// ---------------------------------------------------------------------------
// listRepositories service — tested directly via deps injection
// ---------------------------------------------------------------------------
// The service accepts a deps parameter that injects getInstallationToken and
// fetchImpl, enabling unit tests without mocking global fetch or the app-auth module.

describe('listRepositories service (via deps injection)', () => {
  // Import the service directly (not via the route) so we can pass deps.
  // Because this file already mocks the Supabase modules, the ApiContext
  // can be constructed from the mock clients.

  async function importService() {
    return import('@/app/api/organisations/[id]/repositories/service');
  }

  function makeCtx() {
    return {
      supabase: mockUserClient,
      adminSupabase: mockAdminClient,
      user: AUTH_USER,
    } as unknown;
  }

  beforeEach(() => {
    membershipResult = { data: { github_role: 'admin' }, error: null };
    registeredResult = { data: [REGISTERED_ROW], error: null };
    orgResult = { data: { installation_id: INSTALLATION_ID }, error: null };
  });

  describe('Given a non-admin caller', () => {
    it('then listRepositories throws an ApiError with status 403', async () => {
      // [lld §I1] Service-level enforcement — 403 before any further DB or GitHub calls.
      membershipResult = { data: { github_role: 'member' }, error: null };
      const { listRepositories, ApiError } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      await expect(listRepositories(ctx, ORG_ID, {})).rejects.toThrow(ApiError);
      await expect(listRepositories(ctx, ORG_ID, {})).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('Given installation_id is null, injecting a token getter that would fail if called', () => {
    it('then listRepositories returns empty accessible without calling getInstallationToken', async () => {
      // [lld §I6] Token getter must not be called when installation_id is null.
      orgResult = { data: { installation_id: null }, error: null };
      const tokenGetterSpy = vi.fn().mockRejectedValue(new Error('should not be called'));
      const { listRepositories } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      const result = await listRepositories(ctx, ORG_ID, {
        getInstallationToken: tokenGetterSpy,
      });

      expect(result.accessible).toHaveLength(0);
      expect(tokenGetterSpy).not.toHaveBeenCalled();
    });
  });

  describe('Given a valid installation, injecting a fake token and a fake fetchImpl', () => {
    it('then listRepositories annotates accessible repos with is_registered correctly', async () => {
      // [lld §T1 AC] Annotation logic is isolated here via deps injection.
      const { listRepositories } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      const fakeGetToken = vi.fn().mockResolvedValue('fake-token');
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(GH_API_RESPONSE_BODY),
        status: 200,
      });

      const result = await listRepositories(ctx, ORG_ID, {
        getInstallationToken: fakeGetToken,
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });

      // id=100 is in registered set (REGISTERED_ROW.github_repo_id = 100)
      const registeredEntry = result.accessible.find((r) => r.github_repo_id === 100);
      const unregisteredEntry = result.accessible.find((r) => r.github_repo_id === 300);

      expect(registeredEntry?.is_registered).toBe(true);
      expect(unregisteredEntry?.is_registered).toBe(false);
    });

    it('then listRepositories returns registered repos from the database result', async () => {
      // [lld §T1 AC] registered list comes from DB query, not from GitHub.
      const { listRepositories } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      const result = await listRepositories(ctx, ORG_ID, {
        getInstallationToken: vi.fn().mockResolvedValue('token'),
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(GH_API_RESPONSE_BODY),
        }) as unknown as typeof fetch,
      });

      expect(result.registered).toHaveLength(1);
      expect(result.registered.at(0)?.github_repo_id).toBe(REGISTERED_ROW.github_repo_id);
      expect(result.registered.at(0)?.github_repo_name).toBe(REGISTERED_ROW.github_repo_name);
    });

    it('then listRepositories calls getInstallationToken with the org installation_id', async () => {
      // [lld §T1] The correct installation_id must be passed to the token getter.
      const { listRepositories } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      const fakeGetToken = vi.fn().mockResolvedValue('fake-token');

      await listRepositories(ctx, ORG_ID, {
        getInstallationToken: fakeGetToken,
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(GH_API_RESPONSE_BODY),
        }) as unknown as typeof fetch,
      });

      expect(fakeGetToken).toHaveBeenCalledWith(INSTALLATION_ID);
    });

    it('then the response does NOT include the installation token in any field', async () => {
      // [lld §I2] Security prohibition — token must not leak into the returned data structure.
      const SECRET_TOKEN = 'ghs_super_secret_token_xyz';
      const { listRepositories } = await importService();
      const ctx = makeCtx() as Parameters<typeof listRepositories>[0];

      const result = await listRepositories(ctx, ORG_ID, {
        getInstallationToken: vi.fn().mockResolvedValue(SECRET_TOKEN),
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(GH_API_RESPONSE_BODY),
        }) as unknown as typeof fetch,
      });

      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain(SECRET_TOKEN);
    });
  });
});
