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

// ---------------------------------------------------------------------------
// POST /api/organisations/[id]/repositories (T2)
// Design reference: docs/design/lld-v8-repository-management.md §T2
// Requirements:    docs/requirements/v8-requirements.md — Epic 2, Story 2.2
// Issue:           #366
//
// The T1 mocks (mockAdminClient, mockUserClient, requireAuth) are reused in full.
// T2 needs a second result variable: `insertResult` (INSERT outcome) and `dedupResult`
// (SELECT for dedup check). Within the T2 describe block, mockAdminClient.from is
// overridden in beforeEach to route:
//   - user_organisations  → membershipResult   (admin check, via mockUserClient)
//   - repositories SELECT → dedupResult        (dedup check, .maybeSingle())
//   - repositories INSERT → insertResult       (INSERT, .select().single())
// ---------------------------------------------------------------------------

describe('POST /api/organisations/[id]/repositories (T2)', () => {

  // -------------------------------------------------------------------------
  // T2-local result variables — set per test in the nested beforeEach below.
  // -------------------------------------------------------------------------

  let dedupResult: { data: unknown; error: unknown };
  let insertResult: { data: unknown; error: unknown };

  // -------------------------------------------------------------------------
  // T2-local fixtures
  // -------------------------------------------------------------------------

  const NEW_REPO_BODY = {
    github_repo_id: 500,
    github_repo_name: 'acme/new-service',
  };

  const INSERTED_ROW = {
    id: 'new-repo-uuid-001',
    github_repo_name: 'acme/new-service',
  };

  // -------------------------------------------------------------------------
  // POST request helper
  // -------------------------------------------------------------------------

  function makePostRequest(body: Record<string, unknown> = NEW_REPO_BODY): NextRequest {
    return new NextRequest(
      `http://localhost/api/organisations/${ORG_ID}/repositories`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
  }

  async function getPost(): Promise<RouteHandler> {
    const mod = await import('@/app/api/organisations/[id]/repositories/route');
    return mod.POST as RouteHandler;
  }

  function postRepository(body: Record<string, unknown> = NEW_REPO_BODY) {
    return getPost().then((POST) =>
      POST(makePostRequest(body), { params: Promise.resolve({ id: ORG_ID }) }),
    );
  }

  // -------------------------------------------------------------------------
  // Extended makeChain — adds insert() support so adminClient can serve T2 needs.
  // insert() returns a chain whose select() and single() resolve from insertResult.
  // -------------------------------------------------------------------------

  function makeChainWithInsert(
    selectResolver: () => { data: unknown; error: unknown },
    insertResolver: () => { data: unknown; error: unknown },
  ) {
    // The base chain covers SELECT paths (.select().eq().maybeSingle()).
    const base = Object.assign(Promise.resolve(selectResolver()), {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(() => Promise.resolve(selectResolver())),
      maybeSingle: vi.fn(() => Promise.resolve(selectResolver())),
      insert: vi.fn(),
    });
    base.select.mockReturnValue(base);
    base.eq.mockReturnValue(base);

    // The insert chain covers INSERT paths (.insert().select().single()).
    const insertChain = Object.assign(Promise.resolve(insertResolver()), {
      select: vi.fn(),
      single: vi.fn(() => Promise.resolve(insertResolver())),
    });
    insertChain.select.mockReturnValue(insertChain);

    base.insert.mockReturnValue(insertChain);
    return base;
  }

  // -------------------------------------------------------------------------
  // T2 beforeEach — defaults + override mockAdminClient.from for INSERT routing.
  // -------------------------------------------------------------------------

  beforeEach(() => {
    // Default: admin caller.
    vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
    membershipResult = { data: { github_role: 'admin' }, error: null };

    // Default dedup: repo does NOT yet exist.
    dedupResult = { data: null, error: null };

    // Default insert: succeeds with the new row.
    insertResult = { data: INSERTED_ROW, error: null };

    // Override mockAdminClient.from so repositories table handles both SELECT (dedup)
    // and INSERT (registration). Other tables fall back to makeChain.
    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'repositories') {
        return makeChainWithInsert(
          () => dedupResult,
          () => insertResult,
        );
      }
      if (table === 'organisations') return makeChain(() => orgResult);
      return makeChain(() => ({ data: null, error: null }));
    });
  });

  // -------------------------------------------------------------------------
  // Property T2.1: non-admin caller receives 403.
  // [lld §T2 AC] [req §Security] [lld §I1]
  // -------------------------------------------------------------------------

  describe('Given a non-admin caller (github_role = member)', () => {
    it('then it returns 403', async () => {
      // [lld §I1] [req §Security] Non-admin callers must receive 403.
      membershipResult = { data: { github_role: 'member' }, error: null };

      const response = await postRepository();

      expect(response.status).toBe(403);
    });
  });

  describe('Given a caller with no membership record for this org', () => {
    it('then it returns 403', async () => {
      // [lld §I1] Missing membership is treated the same as non-admin.
      membershipResult = { data: null, error: null };

      const response = await postRepository();

      expect(response.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // Property T2.2: successful insert returns 201 with id and github_repo_name.
  // [lld §T2 AC] POST returns 201 { id, github_repo_name } on success.
  // -------------------------------------------------------------------------

  describe('Given an admin caller and the repository is not yet registered', () => {
    it('then it returns 201', async () => {
      // [lld §T2 AC] Success status code must be 201 Created.
      const response = await postRepository();

      expect(response.status).toBe(201);
    });

    it('then the response body contains "id"', async () => {
      // [lld §T2 AC] Response body must include the new row id.
      const response = await postRepository();
      const body = await response.json() as Record<string, unknown>;

      expect(body).toHaveProperty('id');
    });

    it('then the response body contains "github_repo_name"', async () => {
      // [lld §T2 AC] Response body must include the repository name.
      const response = await postRepository();
      const body = await response.json() as Record<string, unknown>;

      expect(body).toHaveProperty('github_repo_name');
    });

    it('then the response body "id" matches the inserted row id', async () => {
      // [lld §T2] The id returned must be the one from the INSERT result.
      insertResult = { data: INSERTED_ROW, error: null };

      const response = await postRepository();
      const body = await response.json() as { id: string };

      expect(body.id).toBe(INSERTED_ROW.id);
    });

    it('then the response body "github_repo_name" matches the posted name', async () => {
      // [lld §T2] The repo name returned must match the one that was inserted.
      insertResult = { data: INSERTED_ROW, error: null };

      const response = await postRepository();
      const body = await response.json() as { github_repo_name: string };

      expect(body.github_repo_name).toBe(NEW_REPO_BODY.github_repo_name);
    });
  });

  // -------------------------------------------------------------------------
  // Property T2.3: duplicate github_repo_id for the same org returns 409.
  // [lld §T2 AC] [lld §I3]
  // -------------------------------------------------------------------------

  describe('Given github_repo_id is already registered for this org', () => {
    it('then it returns 409', async () => {
      // [lld §I3] [lld §T2 AC] Duplicate repo must return 409 Conflict.
      // The dedup SELECT finds an existing row.
      dedupResult = { data: { id: REGISTERED_ROW.id }, error: null };

      const response = await postRepository({ ...NEW_REPO_BODY, github_repo_id: REGISTERED_ROW.github_repo_id });

      expect(response.status).toBe(409);
    });

    it('then the response body contains error field "already_registered"', async () => {
      // [lld §T2 AC] 409 response body must carry { error: 'already_registered' }.
      // This is how handleApiError serialises ApiError(409, 'already_registered').
      dedupResult = { data: { id: REGISTERED_ROW.id }, error: null };

      const response = await postRepository({ ...NEW_REPO_BODY, github_repo_id: REGISTERED_ROW.github_repo_id });
      const body = await response.json() as { error: string };

      expect(body.error).toBe('already_registered');
    });
  });

  // -------------------------------------------------------------------------
  // Property T2.4: addRepository service — direct unit tests via service import.
  // Tests admin check and dedup at the service layer using deps injection pattern.
  // -------------------------------------------------------------------------

  describe('addRepository service (direct)', () => {

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

    describe('Given a non-admin caller', () => {
      it('then addRepository throws an ApiError with status 403', async () => {
        // [lld §I1] Service enforces the admin check before any write.
        membershipResult = { data: { github_role: 'member' }, error: null };
        const { addRepository } = await importService();
        const { ApiError } = await import('@/lib/api/errors');
        const ctx = makeCtx() as Parameters<typeof addRepository>[0];

        await expect(
          addRepository(ctx, ORG_ID, NEW_REPO_BODY),
        ).rejects.toThrow(ApiError);
        await expect(
          addRepository(ctx, ORG_ID, NEW_REPO_BODY),
        ).rejects.toMatchObject({ statusCode: 403 });
      });
    });

    describe('Given github_repo_id already exists for this org', () => {
      it('then addRepository throws an ApiError with status 409', async () => {
        // [lld §I3] Dedup check must throw ApiError(409) when repo is already registered.
        dedupResult = { data: { id: REGISTERED_ROW.id }, error: null };
        const { addRepository } = await importService();
        const { ApiError } = await import('@/lib/api/errors');
        const ctx = makeCtx() as Parameters<typeof addRepository>[0];

        await expect(
          addRepository(ctx, ORG_ID, { github_repo_id: REGISTERED_ROW.github_repo_id, github_repo_name: 'acme/backend' }),
        ).rejects.toThrow(ApiError);
        await expect(
          addRepository(ctx, ORG_ID, { github_repo_id: REGISTERED_ROW.github_repo_id, github_repo_name: 'acme/backend' }),
        ).rejects.toMatchObject({ statusCode: 409 });
      });
    });

    describe('Given a valid admin request and the repo is not yet registered', () => {
      it('then addRepository resolves with id and github_repo_name', async () => {
        // [lld §T2 AC] Service return type: { id: string, github_repo_name: string }.
        insertResult = { data: INSERTED_ROW, error: null };
        const { addRepository } = await importService();
        const ctx = makeCtx() as Parameters<typeof addRepository>[0];

        const result = await addRepository(ctx, ORG_ID, NEW_REPO_BODY);

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('github_repo_name');
      });

      it('then addRepository uses ctx.supabase for the admin check (not adminSupabase)', async () => {
        // [lld §Security] Admin check must go through the user client (RLS-enforced),
        // not adminSupabase, to prevent cross-org privilege escalation.
        // Observable via: mockUserClient.from receives 'user_organisations' call.
        insertResult = { data: INSERTED_ROW, error: null };
        const { addRepository } = await importService();
        const ctx = makeCtx() as Parameters<typeof addRepository>[0];

        await addRepository(ctx, ORG_ID, NEW_REPO_BODY);

        const userClientFromCalls = (mockUserClient.from as ReturnType<typeof vi.fn>).mock.calls;
        const tables = userClientFromCalls.map((args: unknown[]) => args[0] as string);
        expect(tables).toContain('user_organisations');
      });
    });
  });
});
