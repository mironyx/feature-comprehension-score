// Adversarial evaluation tests for Story 2.1 — Add comprehension depth to
// assessment configuration. Issue #222.
//
// Probes one gap in the test-author's suite. Failures are findings —
// do NOT fix the implementation in this file.
//
// Gap found: the existing fcs.test.ts asserts the create_fcs_assessment RPC is
// called with objectContaining({ org_id, repository_id, feature_name }) but does
// not include p_config_comprehension_depth. If the wiring were removed, all 16
// Story 2.1 tests and all existing fcs.test.ts tests would still pass.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module mocks — mirroring fcs.test.ts; no duplication of helpers because
// the test file there does not export its mock client or fixtures.
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

vi.mock('@/lib/github/client', () => ({
  createGithubClient: vi.fn(),
}));

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { POST } from '@/app/api/fcs/route';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const ORG_ID = 'b0000000-0000-4000-8000-000000000001';
const REPO_ID = 'b0000000-0000-4000-8000-000000000002';

const AUTH_USER = {
  id: 'b0000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
  githubUserId: 2001,
  githubUsername: 'adminuser',
};

const BASE_BODY = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Depth wiring check',
  merged_pr_numbers: [77],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// Minimal mock clients
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(() => Promise.resolve(resolver())),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    insert: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
  },
};

const mockUserClient = {
  from: vi.fn(() =>
    makeChain(() => ({ data: [{ github_role: 'admin' }], error: null })),
  ),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') {
      return makeChain(() => ({
        data: {
          github_repo_name: 'test-repo',
          org_id: ORG_ID,
          organisations: { github_org_name: 'test-org', installation_id: 99 },
        },
        error: null,
      }));
    }
    if (table === 'org_config') {
      return makeChain(() => ({
        data: { enforcement_mode: 'soft', score_threshold: 70, fcs_question_count: 5, min_pr_size: 20 },
        error: null,
      }));
    }
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);
  mockOctokit.rest.pulls.get.mockResolvedValue({
    data: { title: 'Depth test PR', merged_at: '2026-01-01T00:00:00Z' },
  });
  mockOctokit.rest.users.getByUsername.mockResolvedValue({
    data: { id: 88001, login: 'alice' },
  });
});

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<number> {
  const res = await POST(makeRequest(body));
  return res.status;
}

// ---------------------------------------------------------------------------
// Adversarial test — service wiring of comprehension_depth to RPC argument
// [lld §Story 2.1, API change: "Pass through to create_fcs_assessment RPC call"]
//
// The test-author's suite verified schema acceptance and RPC storage at the
// integration level, but did not assert that the HTTP handler threads the field
// through the service layer to the RPC call argument in the unit-test path.
// ---------------------------------------------------------------------------

describe('POST /api/fcs — comprehension_depth RPC wiring', () => {
  // Gap: fcs.test.ts asserts create_fcs_assessment is called but does not
  // include p_config_comprehension_depth in objectContaining. A removed or
  // misspelled wiring line would go undetected by the existing unit tests.

  describe('given a request with comprehension_depth "detailed"', () => {
    it('passes p_config_comprehension_depth "detailed" to the create_fcs_assessment RPC', async () => {
      const status = await callPost({ ...BASE_BODY, comprehension_depth: 'detailed' });

      expect(status).toBe(201);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({ p_config_comprehension_depth: 'detailed' }),
      );
    });
  });

  describe('given a request with comprehension_depth omitted', () => {
    it('passes p_config_comprehension_depth "conceptual" to the create_fcs_assessment RPC', async () => {
      const status = await callPost(BASE_BODY);

      expect(status).toBe(201);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({ p_config_comprehension_depth: 'conceptual' }),
      );
    });
  });
});
