// Tests for createProject service function.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.3
// Requirements: docs/requirements/v11-requirements.md §Story 1.1
// Issue #396: feat: POST + GET /api/projects (V11 E11.1 T1.3)

import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';
import type { CreateProjectInput } from '@/app/api/projects/validation';
import { createProject } from '@/app/api/projects/service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'org-uuid-001';
const PROJECT_ID = 'project-uuid-001';
const USER_ID = 'user-uuid-001';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: USER_ID,
  email: 'alice@example.com',
  githubUserId: 42,
  githubUsername: 'alice',
};

const MINIMAL_INPUT: CreateProjectInput = {
  org_id: ORG_ID,
  name: 'Payment Service',
};

const FULL_INPUT: CreateProjectInput = {
  org_id: ORG_ID,
  name: 'Payment Service',
  description: 'Handles all payment processing',
  glob_patterns: ['docs/adr/*.md', 'docs/design/*.md'],
  domain_notes: 'Use British English. CQRS applied.',
  question_count: 4,
};

const PROJECT_ROW = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  name: 'Payment Service',
  description: null,
  created_at: '2026-04-30T10:00:00Z',
  updated_at: '2026-04-30T10:00:00Z',
};

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/** Builds a chainable Supabase query stub that resolves to the given result. */
function makeQueryChain(result: { data: unknown; error: unknown }) {
  const terminal = vi.fn().mockResolvedValue(result);
  const chain = {
    insert: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: terminal,
    upsert: vi.fn(),
  };
  chain.insert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.upsert.mockReturnValue(chain);
  return chain;
}

/** Returns a mock adminSupabase that resolves insert to the given result. */
function makeAdminSupabase(
  insertResult: { data: unknown; error: unknown },
  upsertResult?: { data: unknown; error: unknown },
) {
  const fromFn = vi.fn((table: string) => {
    if (table === 'organisation_contexts') {
      return makeQueryChain(upsertResult ?? { data: null, error: null });
    }
    return makeQueryChain(insertResult);
  });
  return { from: fromFn } as unknown as ApiContext['adminSupabase'];
}

/** Returns a mock ctx.supabase whose user_organisations query resolves to the given row. */
function makeUserSupabase(membershipRow: { github_role: string; admin_repo_github_ids: number[] } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: membershipRow, error: null });
  const eqUserId = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrgId = vi.fn().mockReturnValue({ eq: eqUserId });
  const select = vi.fn().mockReturnValue({ eq: eqOrgId });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as ApiContext['supabase'];
}

/** Assembles a full ApiContext. */
function makeCtx(
  membershipRow: { github_role: string; admin_repo_github_ids: number[] } | null,
  insertResult: { data: unknown; error: unknown },
  upsertResult?: { data: unknown; error: unknown },
): ApiContext {
  return {
    supabase: makeUserSupabase(membershipRow),
    adminSupabase: makeAdminSupabase(insertResult, upsertResult),
    user: AUTH_USER,
  };
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// describe: createProject — authorisation
// ---------------------------------------------------------------------------

describe('createProject — authorisation', () => {
  describe('Given an Org Admin (github_role=admin)', () => {
    it('resolves without throwing (Org Admin is permitted) [req §Story 1.1, lld I5]', async () => {
      // When createProject is called with an Org Admin ctx
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      // Then it resolves to a project response
      await expect(createProject(ctx, MINIMAL_INPUT)).resolves.toBeDefined();
    });
  });

  describe('Given a Repo Admin (github_role=member with non-empty adminRepoGithubIds)', () => {
    it('resolves without throwing (Repo Admin is permitted) [req §Story 1.1, lld I5]', async () => {
      // When createProject is called with a Repo Admin ctx
      const ctx = makeCtx(
        { github_role: 'member', admin_repo_github_ids: [101] },
        { data: PROJECT_ROW, error: null },
      );
      // Then it resolves to a project response
      await expect(createProject(ctx, MINIMAL_INPUT)).resolves.toBeDefined();
    });
  });

  describe('Given an Org Member (github_role=member, empty adminRepoGithubIds)', () => {
    it('throws ApiError(403) and no project row is created [req §Story 1.1 AC 4, lld I5]', async () => {
      // When createProject is called with an Org Member ctx
      const ctx = makeCtx(
        { github_role: 'member', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      // Then it throws 403
      await expect(createProject(ctx, MINIMAL_INPUT)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws an ApiError instance for Org Member (not a generic Error) [lld I5]', async () => {
      const ctx = makeCtx(
        { github_role: 'member', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      await expect(createProject(ctx, MINIMAL_INPUT)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('Given a caller with no membership row for the org', () => {
    it('throws ApiError(401) when no membership row exists [lld §B.3]', async () => {
      // When createProject is called with a ctx whose membership is null
      const ctx = makeCtx(null, { data: PROJECT_ROW, error: null });
      // Then it throws 401
      await expect(createProject(ctx, MINIMAL_INPUT)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// describe: createProject — successful creation (minimal payload)
// ---------------------------------------------------------------------------

describe('createProject — successful creation with name only', () => {
  describe('Given an Org Admin submits only {name}', () => {
    it('returns a ProjectResponse with all required fields [req §Story 1.1 AC 1, lld §B.3]', async () => {
      // When createProject is called with a minimal input
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      const result = await createProject(ctx, MINIMAL_INPUT) as Record<string, unknown>;
      // Then the returned shape matches ProjectResponse
      expect(result).toMatchObject({
        id: PROJECT_ID,
        org_id: ORG_ID,
        name: 'Payment Service',
        created_at: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('description is null when not provided [lld §B.3, src/types/projects.ts]', async () => {
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      const result = await createProject(ctx, MINIMAL_INPUT) as Record<string, unknown>;
      expect(result['description']).toBeNull();
    });

    it('uses ctx.adminSupabase (service-role) for the INSERT, not ctx.supabase [lld §B.3, ADR-0025]', async () => {
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      await createProject(ctx, MINIMAL_INPUT);
      // adminSupabase.from must have been called with 'projects'
      expect((ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from)
        .toHaveBeenCalledWith('projects');
    });

    it('does NOT upsert organisation_contexts when no context fields are present [lld §B.3]', async () => {
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      await createProject(ctx, MINIMAL_INPUT);
      // organisation_contexts must not be touched
      const calls = (ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
        .map((c: unknown[]) => c[0]);
      expect(calls).not.toContain('organisation_contexts');
    });
  });
});

// ---------------------------------------------------------------------------
// describe: createProject — full payload with context fields
// ---------------------------------------------------------------------------

describe('createProject — full payload with context fields', () => {
  describe('Given a Repo Admin submits name + description + glob_patterns + domain_notes + question_count', () => {
    it('upserts organisation_contexts via ctx.adminSupabase [req §Story 1.1 AC 2, lld §B.3]', async () => {
      const ctx = makeCtx(
        { github_role: 'member', admin_repo_github_ids: [101] },
        { data: PROJECT_ROW, error: null },
        { data: null, error: null },
      );
      await createProject(ctx, FULL_INPUT);
      // organisation_contexts must be touched via adminSupabase
      const calls = (ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
        .map((c: unknown[]) => c[0]);
      expect(calls).toContain('organisation_contexts');
    });

    it('returns a ProjectResponse that includes the project id and org_id [req §Story 1.1 AC 2]', async () => {
      const ctx = makeCtx(
        { github_role: 'member', admin_repo_github_ids: [101] },
        { data: { ...PROJECT_ROW, description: 'Handles all payment processing' }, error: null },
        { data: null, error: null },
      );
      const result = await createProject(ctx, FULL_INPUT) as Record<string, unknown>;
      expect(result['id']).toBe(PROJECT_ID);
      expect(result['org_id']).toBe(ORG_ID);
    });
  });

  describe('Given input contains only domain_notes (no glob_patterns or question_count)', () => {
    it('still upserts organisation_contexts because at least one context field is present [lld §B.3]', async () => {
      const inputWithDomainNotesOnly: CreateProjectInput = {
        org_id: ORG_ID,
        name: 'Alpha Service',
        domain_notes: 'DDD bounded contexts apply.',
      };
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
        { data: null, error: null },
      );
      await createProject(ctx, inputWithDomainNotesOnly);
      const calls = (ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
        .map((c: unknown[]) => c[0]);
      expect(calls).toContain('organisation_contexts');
    });
  });
});

// ---------------------------------------------------------------------------
// describe: createProject — duplicate name (unique violation)
// ---------------------------------------------------------------------------

describe('createProject — duplicate name', () => {
  describe('Given a project with the same name already exists in the org', () => {
    it('throws ApiError(409) when the DB returns a unique violation (code 23505) [req §Story 1.1 AC 5, lld I2]', async () => {
      // When the DB returns a unique constraint violation
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      );
      // Then the service maps it to ApiError(409, 'name_taken')
      await expect(createProject(ctx, MINIMAL_INPUT)).rejects.toMatchObject({
        statusCode: 409,
        message: 'name_taken',
      });
    });

    it('throws ApiError (not a generic Error) on unique violation [lld I2]', async () => {
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: null, error: { code: '23505', message: 'unique violation' } },
      );
      await expect(createProject(ctx, MINIMAL_INPUT)).rejects.toBeInstanceOf(ApiError);
    });
  });
});

// ---------------------------------------------------------------------------
// describe: createProject — reads membership from ctx.supabase (not adminSupabase)
// ---------------------------------------------------------------------------

describe('createProject — client usage for auth gate', () => {
  describe('Given the gate helper queries user_organisations', () => {
    it('reads from ctx.supabase (user-scoped, RLS), not adminSupabase [lld §B.3, CLAUDE.md security]', async () => {
      const ctx = makeCtx(
        { github_role: 'admin', admin_repo_github_ids: [] },
        { data: PROJECT_ROW, error: null },
      );
      await createProject(ctx, MINIMAL_INPUT);
      // supabase.from must have been called with user_organisations
      expect((ctx.supabase as unknown as { from: ReturnType<typeof vi.fn> }).from)
        .toHaveBeenCalledWith('user_organisations');
      // adminSupabase must NOT have been called with user_organisations
      const adminCalls = (ctx.adminSupabase as unknown as { from: ReturnType<typeof vi.fn> }).from.mock.calls
        .map((c: unknown[]) => c[0]);
      expect(adminCalls).not.toContain('user_organisations');
    });
  });
});
