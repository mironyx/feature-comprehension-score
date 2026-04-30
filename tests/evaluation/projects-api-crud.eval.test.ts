// Adversarial evaluation tests — issue #397: GET/PATCH/DELETE /api/projects/[id].
//
// Gap 1 — I7 context merge (UNCOVERED by test-author):
//   The test-author verified *which* tables the admin client writes to, but not *what
//   payload* is sent to the upsert. The spec (LLD §B.4 step 5, I7, Story 1.4 AC 5)
//   requires that a PATCH supplying only `domain_notes` preserves existing
//   `glob_patterns` and `question_count` in the merged context written to
//   `organisation_contexts`. The service reads the existing context then spreads the
//   incoming patch over it — that merge must be exercised with a spy on the upsert
//   payload.
//
// Gap 2 — updateProject returns pre-mutation state when only context fields are patched
//   (spec gap, not a test-author failure):
//   When only context fields are supplied, `result` stays as the project row from
//   `resolveProject` (line 87-90 of service.ts). The response therefore reflects the
//   pre-patch project row. This is the expected behaviour (ProjectResponse has no
//   context fields), but it is not explicitly tested — a caller sending only
//   `glob_patterns` gets back the original project data and might be confused. The
//   spec is silent on this edge, so this is a spec gap rather than a defect; the test
//   here documents the actual behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks (must precede imports that trigger the module graph)
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import type { NextResponse } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<NextResponse>;
let PATCH: RouteHandler;

// ---------------------------------------------------------------------------
// Stateful mock plumbing — mirrors the pattern from update.test.ts but adds
// a spy on the upsert payload so we can assert merge correctness.
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-uuid-eval-001';
const ORG_ID = 'org-uuid-eval-001';

const AUTH_USER = {
  id: 'user-eval-001',
  email: 'admin@example.com',
  githubUserId: 9001,
  githubUsername: 'eval-admin',
};

const PROJECT_ROW = {
  id: PROJECT_ID,
  org_id: ORG_ID,
  name: 'Eval Project',
  description: 'Evaluation description',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// Existing context in DB before the PATCH.
const EXISTING_CONTEXT = {
  glob_patterns: ['docs/adr/*.md', 'src/**/*.ts'],
  domain_notes: 'Original domain notes',
  question_count: 4,
};

// Per-test state that the mock chain closures capture.
let projectLookupResult: { data: unknown; error: unknown };
let membershipResult: { data: unknown; error: unknown };
let projectUpdateResult: { data: unknown; error: unknown };
let contextSelectResult: { data: unknown; error: unknown };
let contextUpsertResult: { data: unknown; error: unknown };

// Spy that captures the payload passed to upsert on organisation_contexts.
let capturedUpsertPayload: unknown = undefined;

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    upsert: vi.fn((payload: unknown) => {
      capturedUpsertPayload = payload;
      return Promise.resolve(resolver());
    }),
    update: vi.fn(),
    delete: vi.fn(),
    limit: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'projects') return makeChain(() => projectLookupResult);
    if (table === 'organisation_contexts') return makeChain(() => contextSelectResult);
    return makeChain(() => membershipResult);
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'projects') return makeChain(() => projectUpdateResult);
    if (table === 'organisation_contexts') return makeChain(() => contextUpsertResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patchProject(body: unknown, projectId = PROJECT_ID) {
  return PATCH(makePatchRequest(body), { params: Promise.resolve({ id: projectId }) });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  capturedUpsertPayload = undefined;
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  projectLookupResult = { data: PROJECT_ROW, error: null };
  membershipResult = { data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null };
  projectUpdateResult = { data: { ...PROJECT_ROW }, error: null };
  contextSelectResult = {
    data: { org_id: ORG_ID, project_id: PROJECT_ID, context: EXISTING_CONTEXT },
    error: null,
  };
  contextUpsertResult = { data: null, error: null };
  ({ PATCH } = await import('@/app/api/projects/[id]/route'));
});

// ---------------------------------------------------------------------------
// Gap 1 — I7: context merge preserves unpatched keys
// ---------------------------------------------------------------------------

describe('Gap 1 — I7: PATCH context fields merges with existing context', () => {
  describe('Given existing context has glob_patterns + domain_notes + question_count', () => {
    describe('When PATCH supplies only domain_notes', () => {
      it('then the upsert payload preserves the existing glob_patterns [I7, Story 1.4 AC 5]', async () => {
        await patchProject({ domain_notes: 'New domain notes' });

        const payload = capturedUpsertPayload as Record<string, unknown> | null;
        expect(payload).not.toBeNull();
        const context = payload?.['context'] as Record<string, unknown> | undefined;
        expect(context?.['glob_patterns']).toEqual(EXISTING_CONTEXT.glob_patterns);
      });

      it('then the upsert payload preserves the existing question_count [I7, Story 1.4 AC 5]', async () => {
        await patchProject({ domain_notes: 'New domain notes' });

        const payload = capturedUpsertPayload as Record<string, unknown> | null;
        const context = payload?.['context'] as Record<string, unknown> | undefined;
        expect(context?.['question_count']).toBe(EXISTING_CONTEXT.question_count);
      });

      it('then the upsert payload contains the new domain_notes [I7]', async () => {
        await patchProject({ domain_notes: 'New domain notes' });

        const payload = capturedUpsertPayload as Record<string, unknown> | null;
        const context = payload?.['context'] as Record<string, unknown> | undefined;
        expect(context?.['domain_notes']).toBe('New domain notes');
      });
    });

    describe('When PATCH supplies only question_count', () => {
      it('then the upsert payload preserves the existing glob_patterns [I7]', async () => {
        await patchProject({ question_count: 5 });

        const payload = capturedUpsertPayload as Record<string, unknown> | null;
        const context = payload?.['context'] as Record<string, unknown> | undefined;
        expect(context?.['glob_patterns']).toEqual(EXISTING_CONTEXT.glob_patterns);
      });

      it('then the upsert payload preserves the existing domain_notes [I7]', async () => {
        await patchProject({ question_count: 5 });

        const payload = capturedUpsertPayload as Record<string, unknown> | null;
        const context = payload?.['context'] as Record<string, unknown> | undefined;
        expect(context?.['domain_notes']).toBe(EXISTING_CONTEXT.domain_notes);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — updateProject returns original row when only context fields patched
// (spec gap — documents actual behaviour, not a defect)
// ---------------------------------------------------------------------------

describe('Gap 2 — updateProject returns original project row when only context fields are patched', () => {
  describe('When PATCH supplies only glob_patterns (a context field)', () => {
    it('then the response body still contains the original project name [spec gap — documented behaviour]', async () => {
      const response = await patchProject({ glob_patterns: ['docs/**'] });
      const body = await response.json() as Record<string, unknown>;

      // The service returns the pre-patch project row when no project-table fields are updated.
      // ProjectResponse has no context fields, so the caller cannot distinguish "updated"
      // from "unchanged" on context-only patches from the response alone.
      expect(response.status).toBe(200);
      expect(body['name']).toBe(PROJECT_ROW.name);
    });
  });
});
