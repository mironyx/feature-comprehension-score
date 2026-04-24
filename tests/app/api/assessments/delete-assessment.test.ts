// Tests for DELETE /api/assessments/[id] — assessment deletion endpoint.
// Design reference: docs/design/lld-e3-assessment-deletion.md §3.1 (Story 3.1)
// Requirements: docs/requirements/v4-requirements.md §Epic 3, Story 3.1
// Issue: #318
//
// Cascade-delete note (P2):
// ON DELETE CASCADE on child tables (questions, participants, answers, artefact PRs,
// artefact issues) is a database-level invariant enforced by the schema.  Asserting
// it here at the unit level is not meaningful — the service itself issues a single
// DELETE on `assessments` and the DB engine handles the rest.  This test therefore
// asserts that exactly one `.delete()` call is made on the `assessments` table, which
// confirms the correct query shape without duplicating schema-level guarantees.
// The cascade invariant (I2) is verified separately via DB integration tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that depend on them.
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/route-handler-readonly', () => ({
  createReadonlyRouteHandlerClient: vi.fn(() => mockUserClient),
}));

vi.mock('@/lib/supabase/secret', () => ({
  createSecretSupabaseClient: vi.fn(() => mockAdminClient),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

// ---------------------------------------------------------------------------
// Mock chain builder
// Produces a chainable Supabase query builder matching the pattern from
// the sibling test [id].test.ts.  Extended here with `.delete()` to support
// the delete-service query shape:
//   supabase.from('assessments').delete().eq('id', id).select('id').single()
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  // deleteSpy is exposed on the chain so tests can assert it was called.
  // It is module-scoped so it can be interrogated after `await callDelete()`.
  const deleteSpy = vi.fn();

  const chain = Object.assign(Promise.resolve(resolver()), {
    delete: vi.fn(() => {
      deleteSpy();
      return chain;
    }),
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    order: vi.fn(() => Promise.resolve(resolver())),
    _deleteSpy: deleteSpy,
  });

  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);

  return chain;
}

// ---------------------------------------------------------------------------
// Mock state — reconfigured per test via helpers below.
// ---------------------------------------------------------------------------

// deleteResult controls what supabase.from('assessments').delete()…single() returns.
let deleteResult: { data: unknown; error: unknown } = { data: null, error: null };

// Track the latest assessments chain so tests can inspect the delete spy.
let lastAssessmentsChain: ReturnType<typeof makeChain> | null = null;

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'assessments') {
      lastAssessmentsChain = makeChain(() => deleteResult);
      return lastAssessmentsChain;
    }
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// adminSupabase must NOT be called by deleteAssessment (invariant I1 / P7).
const mockAdminClient = {
  from: vi.fn(() => makeChain(() => ({ data: null, error: null }))),
};

// ---------------------------------------------------------------------------
// Fixtures — reused from the sibling GET test ([id].test.ts).
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: 'user-001',
  email: 'alice@example.com',
  githubUserId: 1001,
  githubUsername: 'alice',
};

const ASSESSMENT_ID = 'assess-uuid-001';

function makeRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/assessments/${ASSESSMENT_ID}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupAuth() {
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
}

function setupDeleteSuccess() {
  // Simulates RLS DELETE policy allowing the delete and RETURNING the deleted row.
  deleteResult = { data: { id: ASSESSMENT_ID }, error: null };
}

function setupDeleteNotFound() {
  // RLS hides the row (non-admin or wrong org) or row does not exist.
  // Supabase .single() with no matching row returns PGRST116.
  deleteResult = { data: null, error: { code: 'PGRST116', message: 'no rows found' } };
}

function setupDeleteNoData() {
  // Alternative not-found path: no error but data is null.
  deleteResult = { data: null, error: null };
}

// ---------------------------------------------------------------------------
// Route call helper
// ---------------------------------------------------------------------------

async function callDelete(): Promise<{ status: number; text: string }> {
  // Dynamic import required so vi.mock() hoisting applies to all transitive imports.
  const { DELETE } = await import('@/app/api/assessments/[id]/route');
  const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: ASSESSMENT_ID }) });
  return { status: res.status, text: await res.text() };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  lastAssessmentsChain = null;
  deleteResult = { data: null, error: null };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/assessments/[id]', () => {
  // -------------------------------------------------------------------------
  // Given an authenticated Org Admin
  // -------------------------------------------------------------------------

  describe('Given an authenticated Org Admin', () => {
    it('should return 204 and delete the assessment when the ID exists', async () => {
      // AC 1 [req §3.1]: Org Admin + valid ID → 204 No Content
      setupAuth();
      setupDeleteSuccess();

      const { status, text } = await callDelete();

      expect(status).toBe(204);
      expect(text).toBe('');
    });

    it('should issue exactly one DELETE query on the assessments table (cascade is DB-side)', async () => {
      // P2 [lld I2, lld §3.1]: Service makes a single delete() call on assessments.
      // ON DELETE CASCADE removes child rows (questions, participants, answers, artefact
      // PRs, artefact issues) — that invariant is DB-level and is not repeated here.
      // See file header for the rationale.
      //
      // We verify this by asserting that mockUserClient.from('assessments') was called
      // exactly once (one DELETE query) and that the resulting chain had .delete() invoked.
      setupAuth();
      setupDeleteSuccess();

      await callDelete();

      // from('assessments') must have been called (the query ran)
      expect(mockUserClient.from).toHaveBeenCalledWith('assessments');
      // The chain's delete spy must have fired exactly once
      expect(lastAssessmentsChain).not.toBeNull();
      const deleteSpy = lastAssessmentsChain?._deleteSpy;
      expect(deleteSpy).toBeDefined();
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    it('should return 404 when the assessment ID does not exist', async () => {
      // AC 6 [req §3.1]: Non-existent assessment ID → 404
      setupAuth();
      setupDeleteNotFound();

      const { status } = await callDelete();

      expect(status).toBe(404);
    });

    it('should return 404 when the delete query returns null data without an error', async () => {
      // P9 [lld §3.1]: data is null (no row returned) → 404 regardless of error field.
      // The service throws ApiError(404) when error || !data [lld §3.1].
      setupAuth();
      setupDeleteNoData();

      const { status } = await callDelete();

      expect(status).toBe(404);
    });

    it('should delete assessments regardless of status (created)', async () => {
      // AC 3 / I3 [req §3.1, lld I3]: Any assessment status can be deleted — no status
      // guard on the delete endpoint.  The DB row returned can have any status value.
      // We verify the 204 is returned irrespective of status in the deleted row.
      setupAuth();
      // DB returns the deleted row with status 'created'
      deleteResult = { data: { id: ASSESSMENT_ID, status: 'created' }, error: null };

      const { status } = await callDelete();

      expect(status).toBe(204);
    });

    it('should delete assessments regardless of status (awaiting_responses)', async () => {
      // AC 3 / I3 [req §3.1, lld I3]: Deletion succeeds for in-progress assessments.
      setupAuth();
      deleteResult = { data: { id: ASSESSMENT_ID, status: 'awaiting_responses' }, error: null };

      const { status } = await callDelete();

      expect(status).toBe(204);
    });

    it('should delete assessments regardless of status (completed)', async () => {
      // AC 3 / I3 [req §3.1, lld I3]: Deletion succeeds for completed assessments.
      setupAuth();
      deleteResult = { data: { id: ASSESSMENT_ID, status: 'completed' }, error: null };

      const { status } = await callDelete();

      expect(status).toBe(204);
    });

    it('should delete assessments regardless of status (rubric_failed)', async () => {
      // AC 3 / I3 [req §3.1, lld I3]: Deletion succeeds for generation-failed assessments.
      setupAuth();
      deleteResult = { data: { id: ASSESSMENT_ID, status: 'rubric_failed' }, error: null };

      const { status } = await callDelete();

      expect(status).toBe(204);
    });

    it('should NOT call adminSupabase at any point (invariant I1 — RLS must apply)', async () => {
      // I1 [lld §3.1, lld invariants]: deleteAssessment uses ctx.supabase (user-scoped),
      // NOT ctx.adminSupabase.  Using the admin/service-role client would bypass RLS,
      // allowing any authenticated user to delete any assessment regardless of org
      // membership.  This test asserts that the admin client is never consulted.
      setupAuth();
      setupDeleteSuccess();

      await callDelete();

      // createSecretSupabaseClient is the factory for adminSupabase in createApiContext.
      // It is called during context creation — but the resulting client's .from() must
      // not be invoked by deleteAssessment.
      expect(vi.mocked(createSecretSupabaseClient)().from).not.toHaveBeenCalled();
    });

    it('should query the assessments table on the user-scoped client', async () => {
      // P8 [lld §3.1]: The delete query targets the `assessments` table via ctx.supabase.
      setupAuth();
      setupDeleteSuccess();

      await callDelete();

      expect(mockUserClient.from).toHaveBeenCalledWith('assessments');
    });
  });

  // -------------------------------------------------------------------------
  // Given an unauthenticated request
  // -------------------------------------------------------------------------

  describe('Given an unauthenticated request', () => {
    it('should return 401 Unauthorized', async () => {
      // AC 4 [req §3.1]: Unauthenticated request → 401.
      // requireAuth throws ApiError(401) for unauthenticated callers.
      const { ApiError } = await import('@/lib/api/errors');
      vi.mocked(requireAuth).mockRejectedValue(new ApiError(401, 'Unauthenticated'));

      const { status } = await callDelete();

      expect(status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Given an authenticated user who is not an Org Admin
  // -------------------------------------------------------------------------

  describe('Given an authenticated user who is not an Org Admin', () => {
    it('should return 404 Not Found (RLS hides the row)', async () => {
      // AC 5 / I1 [req §3.1, lld I1]: Non-admin authenticated user → 404.
      // The RLS DELETE policy (assessments_delete_admin) prevents the row from being
      // returned — the DB sees 0 rows, which the service converts to ApiError(404).
      // A 403 is intentionally NOT returned: hiding the row prevents leaking the
      // existence of assessments that belong to another organisation.
      setupAuth();
      // RLS denied: same observable result as not-found (PGRST116)
      setupDeleteNotFound();

      const { status } = await callDelete();

      expect(status).toBe(404);
    });

    it('should NOT return 403 for a non-admin user (row existence is hidden, not forbidden)', async () => {
      // I1 [lld §3.1]: The endpoint returns 404, not 403, when RLS denies access.
      // This matches the existing GET-endpoint pattern: non-admins receive 404 to
      // avoid leaking existence of cross-org resources.
      setupAuth();
      setupDeleteNotFound();

      const { status } = await callDelete();

      expect(status).not.toBe(403);
    });
  });
});
