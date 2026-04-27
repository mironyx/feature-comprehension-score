// Adversarial evaluation tests for issue #366 — Add repository (POST API + button).
// Design reference: docs/design/lld-v8-repository-management.md §T2
// Requirements:    docs/requirements/v8-requirements.md — Epic 2, Story 2.2
//
// Coverage gap identified:
//   The feature test file (tests/app/api/organisations/[id].repositories.test.ts)
//   verifies the *response shape* of a successful addRepository call, but does not
//   assert which arguments are passed to adminSupabase.insert(). The LLD §T2 sequence
//   diagram and the service code both specify that the INSERT must include
//   `status: 'active'` and the correct `org_id`. If the implementation omitted
//   `status: 'active'`, the inserted row would be filtered out by the GET endpoint's
//   status='active' filter (LLD §I4) and never appear in the registered list —
//   a silent correctness failure with no API-level error signal.
//
// Why a new file rather than folding into the sibling test:
//   The existing T2 describe block's makeChainWithInsert mock ignores insert() args.
//   Rather than retrofitting that complex mock (risking import-side-effect ordering
//   issues with vi.mock hoisting), we call addRepository directly via a purpose-built
//   mock that captures insert arguments, keeping the eval file self-contained.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that trigger module resolution.
// We need to stub getInstallationToken (imported by service) so importing the
// service module does not require GITHUB_APP_PRIVATE_KEY env vars.
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/app-auth', () => ({
  getInstallationToken: vi.fn(async () => 'stub-token'),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { addRepository } from '@/app/api/organisations/[id]/repositories/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-eval-001';
const USER_ID = 'user-eval-001';

const BODY = {
  github_repo_id: 777,
  github_repo_name: 'acme/eval-service',
};

const INSERTED_ROW = {
  id: 'inserted-row-uuid',
  github_repo_name: BODY.github_repo_name,
};

// ---------------------------------------------------------------------------
// Minimal mock client factories
//
// makeAdminClientCapturingInsert:
//   - SELECT on repositories (dedup): returns { data: null, error: null } (not found)
//   - INSERT on repositories: captures the argument passed to .insert() and returns INSERTED_ROW
//   - All other tables: no-ops
//
// makeUserClientAllowAdmin:
//   - SELECT on user_organisations: returns admin membership
// ---------------------------------------------------------------------------

function makeSelectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn(() => chain);
  chain['eq'] = vi.fn(() => chain);
  chain['single'] = vi.fn(() => Promise.resolve(result));
  chain['maybeSingle'] = vi.fn(() => Promise.resolve(result));
  return chain;
}

function makeAdminClientCapturingInsert(
  onInsert: (args: unknown) => void,
) {
  return {
    from: vi.fn((table: string) => {
      if (table !== 'repositories') {
        return makeSelectChain({ data: null, error: null });
      }

      // Dedup SELECT chain (returns not-found by default)
      const selectChain = makeSelectChain({ data: null, error: null });

      // INSERT chain — captures arguments, returns the inserted row
      const insertChain: Record<string, unknown> = {};
      insertChain['select'] = vi.fn(() => insertChain);
      insertChain['single'] = vi.fn(() => Promise.resolve({ data: INSERTED_ROW, error: null }));

      // Attach insert to the base chain so .from('repositories').insert(...) works
      (selectChain as Record<string, unknown>)['insert'] = vi.fn((insertArgs: unknown) => {
        onInsert(insertArgs);
        return insertChain;
      });

      return selectChain;
    }),
  };
}

function makeUserClientAllowAdmin() {
  return {
    from: vi.fn(() => makeSelectChain({ data: { github_role: 'admin' }, error: null })),
  };
}

// ---------------------------------------------------------------------------
// Gap 1: INSERT payload includes status='active'
//
// LLD §T2 sequence: "INSERT repositories (org_id, repo_id, repo_name, status=active)"
// If status is omitted or wrong, the row is created but immediately invisible to
// the GET endpoint (which filters on status='active'), with no error signal.
// ---------------------------------------------------------------------------

describe('addRepository service — INSERT payload (LLD §T2)', () => {

  let capturedInsertArgs: unknown;

  beforeEach(() => {
    capturedInsertArgs = undefined;
    vi.clearAllMocks();
  });

  describe('Given an admin caller and a new repo body', () => {
    it('then the INSERT payload includes status="active"', async () => {
      // [lld §T2 sequence] INSERT must include status='active' so the new repo
      // immediately appears in the registered list (which filters on status='active').
      const adminClient = makeAdminClientCapturingInsert((args) => {
        capturedInsertArgs = args;
      });
      const userClient = makeUserClientAllowAdmin();

      const ctx = {
        supabase: userClient,
        adminSupabase: adminClient,
        user: { id: USER_ID, email: 'admin@example.com', githubUserId: 1, githubUsername: 'admin' },
      };

      await addRepository(ctx as Parameters<typeof addRepository>[0], ORG_ID, BODY);

      expect(capturedInsertArgs).toMatchObject({ status: 'active' });
    });

    it('then the INSERT payload includes the correct org_id', async () => {
      // [lld §T2 sequence] INSERT must bind the row to the org the caller specified.
      // An incorrect org_id would silently register the repo under a different org.
      const adminClient = makeAdminClientCapturingInsert((args) => {
        capturedInsertArgs = args;
      });
      const userClient = makeUserClientAllowAdmin();

      const ctx = {
        supabase: userClient,
        adminSupabase: adminClient,
        user: { id: USER_ID, email: 'admin@example.com', githubUserId: 1, githubUsername: 'admin' },
      };

      await addRepository(ctx as Parameters<typeof addRepository>[0], ORG_ID, BODY);

      expect(capturedInsertArgs).toMatchObject({ org_id: ORG_ID });
    });

    it('then the INSERT payload includes github_repo_id and github_repo_name from the request body', async () => {
      // [lld §T2] All four fields (org_id, github_repo_id, github_repo_name, status)
      // must be present in the INSERT. Missing either repo field would produce a row
      // that references no real repository.
      const adminClient = makeAdminClientCapturingInsert((args) => {
        capturedInsertArgs = args;
      });
      const userClient = makeUserClientAllowAdmin();

      const ctx = {
        supabase: userClient,
        adminSupabase: adminClient,
        user: { id: USER_ID, email: 'admin@example.com', githubUserId: 1, githubUsername: 'admin' },
      };

      await addRepository(ctx as Parameters<typeof addRepository>[0], ORG_ID, BODY);

      expect(capturedInsertArgs).toMatchObject({
        github_repo_id: BODY.github_repo_id,
        github_repo_name: BODY.github_repo_name,
      });
    });
  });
});
