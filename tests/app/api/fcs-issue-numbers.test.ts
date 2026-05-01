// Tests for FCS — issue numbers feature (Story 19.1, issue #287).
// Contract source: docs/requirements/v2-requirements.md §"Story 19.1", issue #287 AC list.
// This file tests only the issue-numbers contract. The base createFcs contract
// (auth, repo validation, PR validation, etc.) is covered by fcs.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
// ---------------------------------------------------------------------------

vi.mock('@/lib/github/client', () => ({
  createGithubClient: vi.fn(),
}));

vi.mock('@/lib/engine/pipeline', () => ({
  generateRubric: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { createGithubClient } from '@/lib/github/client';

import { createFcsForProject } from '@/app/api/projects/[id]/assessments/service';
import { CreateFcsBodySchema, type CreateFcsBody } from '@/app/api/projects/[id]/assessments/validation';
import { retriggerRubricForAssessment } from '@/lib/api/fcs-pipeline';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';
const PROJECT_ID = 'a0000000-0000-4000-8000-000000000003';

// ---------------------------------------------------------------------------
// Mock chain builder — mirrors the pattern in fcs.test.ts
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

// ---------------------------------------------------------------------------
// Mock state — mutable per test, reset in beforeEach
// ---------------------------------------------------------------------------

let orgMemberResult: { data: unknown; error: unknown };
let repoResult: { data: unknown; error: unknown };
let orgConfigResult: { data: unknown; error: unknown };
let issueSourcesResult: { data: unknown; error: unknown };
let mergedPrsRetryResult: { data: unknown; error: unknown };

// ---------------------------------------------------------------------------
// Mock Octokit — extended with issues.get for issue validation
// ---------------------------------------------------------------------------

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
    issues: { get: vi.fn() },
  },
};

// ---------------------------------------------------------------------------
// Mock clients
// ---------------------------------------------------------------------------

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => orgMemberResult);
    if (table === 'projects') return makeChain(() => ({ data: { id: PROJECT_ID }, error: null }));
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') return makeChain(() => repoResult);
    if (table === 'org_config') return makeChain(() => orgConfigResult);
    if (table === 'fcs_merged_prs') return makeChain(() => mergedPrsRetryResult);
    if (table === 'fcs_issue_sources') return makeChain(() => issueSourcesResult);
    // assessments and assessment_participants succeed by default
    return makeChain(() => ({ data: null, error: null }));
  }),
  rpc: vi.fn().mockResolvedValue({ data: 'mock-assessment-id', error: null }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTH_USER = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
};

/** Minimal valid body with only merged_pr_numbers — backward-compat baseline. */
const BASE_BODY_WITH_PRS: CreateFcsBody = {
  repository_id: REPO_ID,
  feature_name: 'New Checkout Flow',
  merged_pr_numbers: [42],
  participants: [{ github_username: 'alice' }],
};

/** Minimal valid body with only issue_numbers — no PR numbers. */
const BASE_BODY_WITH_ISSUES: CreateFcsBody = {
  repository_id: REPO_ID,
  feature_name: 'New Checkout Flow',
  issue_numbers: [101],
  participants: [{ github_username: 'alice' }],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(): ApiContext {
  return {
    supabase: mockUserClient as never,
    adminSupabase: mockAdminClient as never,
    user: AUTH_USER,
    orgId: ORG_ID,
  };
}

async function callPost(body: CreateFcsBody): Promise<{ status: number; json: unknown }> {
  const result = await createFcsForProject(makeCtx(), PROJECT_ID, body);
  return { status: 201, json: result };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  // PR validation — merged by default
  mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } });
  // User resolution — exists by default
  mockOctokit.rest.users.getByUsername.mockResolvedValue({ data: { id: 99001, login: 'alice' } });
  // Issue validation — exists, is a genuine issue (no pull_request field) by default
  mockOctokit.rest.issues.get.mockResolvedValue({ data: { number: 101, title: 'My Issue', body: 'body text', pull_request: undefined } });

  orgMemberResult = { data: { github_role: 'admin', admin_repo_github_ids: [] }, error: null };
  repoResult = {
    data: {
      github_repo_name: 'test-repo',
      org_id: ORG_ID,
      organisations: { github_org_name: 'test-org', installation_id: 42 },
    },
    error: null,
  };
  orgConfigResult = {
    data: { enforcement_mode: 'soft', score_threshold: 70, fcs_question_count: 5, min_pr_size: 20 },
    error: null,
  };
  issueSourcesResult = { data: [], error: null };
  mergedPrsRetryResult = { data: [], error: null };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createFcs — issue numbers', () => {

  // -------------------------------------------------------------------------
  // Pipeline acceptance (201 paths)
  // -------------------------------------------------------------------------

  describe('pipeline acceptance', () => {
    it('accepts issue_numbers alongside merged_pr_numbers', async () => {
      // [req §Story 19.1 API schema] Both fields provided → succeeds
      const body: CreateFcsBody = { ...BASE_BODY_WITH_PRS, issue_numbers: [101] };
      const { status } = await callPost(body);
      expect(status).toBe(201);
    });

    it('accepts issue_numbers without merged_pr_numbers', async () => {
      // [req §Story 19.1] issue_numbers alone → succeeds (no PRs required)
      const { status } = await callPost(BASE_BODY_WITH_ISSUES);
      expect(status).toBe(201);
    });

    it('accepts merged_pr_numbers without issue_numbers (backward compat)', async () => {
      // [req §Story 19.1] existing behaviour unchanged when only PRs are provided
      const { status } = await callPost(BASE_BODY_WITH_PRS);
      expect(status).toBe(201);
    });
  });

  // -------------------------------------------------------------------------
  // FcsCreateBodySchema unit — independent of HTTP layer
  // -------------------------------------------------------------------------

  describe('FcsCreateBodySchema', () => {
    const VALID_BASE = {
      repository_id: REPO_ID,
      feature_name: 'Feature',
      participants: [{ github_username: 'alice' }],
    };

    it('succeeds with issue_numbers only', () => {
      // [req §Story 19.1] schema-level: issue_numbers alone satisfies the refine
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, issue_numbers: [101] });
      expect(result.success).toBe(true);
    });

    it('succeeds with merged_pr_numbers only', () => {
      // [req §Story 19.1 — backward compat]
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, merged_pr_numbers: [42] });
      expect(result.success).toBe(true);
    });

    it('succeeds with both issue_numbers and merged_pr_numbers', () => {
      // [req §Story 19.1]
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, merged_pr_numbers: [42], issue_numbers: [101] });
      expect(result.success).toBe(true);
    });

    it('fails when neither field is provided', () => {
      // [req §Story 19.1]
      const result = CreateFcsBodySchema.safeParse(VALID_BASE);
      expect(result.success).toBe(false);
      const errorMessages = result.error?.issues.map((i) => i.message) ?? [];
      expect(errorMessages.some((m) => m.includes('At least one of merged_pr_numbers or issue_numbers is required'))).toBe(true);
    });

    it('fails when both arrays are empty', () => {
      // [req §Story 19.1] empty arrays treated as absent
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, merged_pr_numbers: [], issue_numbers: [] });
      expect(result.success).toBe(false);
    });

    it('rejects non-positive issue numbers', () => {
      // [req §Story 19.1] issue_numbers must be positive integers
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, issue_numbers: [0] });
      expect(result.success).toBe(false);
    });

    it('rejects negative issue numbers', () => {
      // [req §Story 19.1] issue_numbers must be positive integers
      const result = CreateFcsBodySchema.safeParse({ ...VALID_BASE, issue_numbers: [-1] });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Issue validation
  // -------------------------------------------------------------------------

  describe('issue validation', () => {
    it('rejects issue number that does not exist — 422', async () => {
      // [req §Story 19.1 Issue validation] GitHub returns 404 → 422 with identifying message
      mockOctokit.rest.issues.get.mockRejectedValue(new Error('Not Found'));
      await expect(callPost(BASE_BODY_WITH_ISSUES)).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('Issue #101 not found') });
    });

    it('rejects issue number that is actually a PR — 422 with guidance message', async () => {
      // [req §Story 19.1] GitHub REST returns pull_request field for PRs
      // Exact message required: "#<number> is a pull request, not an issue. Use merged_pr_numbers for PRs."
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 101, title: 'Some PR', pull_request: { url: 'https://api.github.com/repos/x/y/pulls/101' } },
      });
      await expect(callPost(BASE_BODY_WITH_ISSUES)).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('#101 is a pull request, not an issue. Use merged_pr_numbers for PRs.') });
    });

    it('validates each issue number individually', async () => {
      // [req §Story 19.1] all issue numbers must be checked
      mockOctokit.rest.issues.get
        .mockResolvedValueOnce({ data: { number: 101, title: 'Real Issue', pull_request: undefined } })
        .mockRejectedValueOnce(new Error('Not Found'));
      const body: CreateFcsBody = { ...BASE_BODY_WITH_ISSUES, issue_numbers: [101, 999] };
      await expect(callPost(body)).rejects.toMatchObject({ statusCode: 422 });
    });

    it('does NOT call issues.get when issue_numbers is absent', async () => {
      // [issue #287] validateIssues must not run when no issue_numbers provided
      await callPost(BASE_BODY_WITH_PRS);
      expect(mockOctokit.rest.issues.get).not.toHaveBeenCalled();
    });

    it('does NOT call issues.get when issue_numbers is empty', async () => {
      // [issue #287] empty array is equivalent to absent — no validation calls
      const body: CreateFcsBody = { ...BASE_BODY_WITH_PRS, issue_numbers: [] };
      // merged_pr_numbers is still present so validation passes
      const { status } = await callPost(body);
      expect(status).toBe(201);
      expect(mockOctokit.rest.issues.get).not.toHaveBeenCalled();
    });

    it('calls issues.get with the correct owner, repo, and issue_number', async () => {
      // [req §Story 19.1] must use the repository's org and repo name
      await callPost(BASE_BODY_WITH_ISSUES);
      expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith(
        expect.objectContaining({ owner: 'test-org', repo: 'test-repo', issue_number: 101 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  describe('persistence', () => {
    it('stores issue numbers AND titles in fcs_issue_sources table via RPC p_issue_sources param', async () => {
      // [lld §19.1 — ValidatedIssue] p_issue_sources must include issue_title, not just issue_number.
      // Default mock returns title: 'My Issue' (line in beforeEach). Regression for issue #291.
      await callPost(BASE_BODY_WITH_ISSUES);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_issue_sources: [{ issue_number: 101, issue_title: 'My Issue' }],
        }),
      );
    });

    it('captures issue_title from the GitHub REST issues.get response title field', async () => {
      // [lld §19.1 — validateIssues] issue_title must come from data.title of the issues.get call.
      // Distinct title used to prove the value flows end-to-end, not coincidentally matched. #291
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 101, title: 'Add dark mode toggle', body: 'some body', pull_request: undefined },
      });
      await callPost(BASE_BODY_WITH_ISSUES);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_issue_sources: [{ issue_number: 101, issue_title: 'Add dark mode toggle' }],
        }),
      );
    });

    it('maps each issue its own title when multiple issues have distinct titles', async () => {
      // [lld §19.1 — ValidatedIssue[]] per-issue title mapping: each row carries the title
      // returned for that specific issue number, proving it is not collapsed to a single value.
      mockOctokit.rest.issues.get
        .mockResolvedValueOnce({ data: { number: 101, title: 'Implement login page', pull_request: undefined } })
        .mockResolvedValueOnce({ data: { number: 202, title: 'Fix broken header', pull_request: undefined } });
      const body: CreateFcsBody = { ...BASE_BODY_WITH_ISSUES, issue_numbers: [101, 202] };
      await callPost(body);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_issue_sources: expect.arrayContaining([
            { issue_number: 101, issue_title: 'Implement login page' },
            { issue_number: 202, issue_title: 'Fix broken header' },
          ]),
        }),
      );
    });

    it('stores multiple issue numbers with their titles as separate objects', async () => {
      // [lld §19.1] each issue number becomes a separate row via p_issue_sources; titles included
      mockOctokit.rest.issues.get.mockResolvedValue({ data: { number: 0, title: 'Issue', pull_request: undefined } });
      const body: CreateFcsBody = { ...BASE_BODY_WITH_ISSUES, issue_numbers: [101, 202] };
      await callPost(body);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_issue_sources: [
            { issue_number: 101, issue_title: 'Issue' },
            { issue_number: 202, issue_title: 'Issue' },
          ],
        }),
      );
    });

    it('passes empty p_issue_sources when no issue_numbers provided', async () => {
      // [lld §19.1] when only PRs are provided, p_issue_sources is empty (no titles either)
      await callPost(BASE_BODY_WITH_PRS);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_issue_sources: [],
        }),
      );
    });

    it('passes p_merged_prs alongside p_issue_sources with titles when both are provided', async () => {
      // [lld §19.1] both tables populated when request includes both PR and issue numbers;
      // p_issue_sources entries must include issue_title
      const body: CreateFcsBody = { ...BASE_BODY_WITH_PRS, issue_numbers: [101] };
      await callPost(body);
      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        'create_fcs_assessment',
        expect.objectContaining({
          p_merged_prs: expect.arrayContaining([expect.objectContaining({ pr_number: 42 })]),
          p_issue_sources: [{ issue_number: 101, issue_title: 'My Issue' }],
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Retry path — retriggerRubricForAssessment
  // -------------------------------------------------------------------------

  describe('retry path — retriggerRubricForAssessment', () => {
    const RETRY_ASSESSMENT = {
      id: 'b0000000-0000-4000-8000-000000000099',
      org_id: ORG_ID,
      repository_id: REPO_ID,
      status: 'rubric_failed',
      config_question_count: 5,
      config_comprehension_depth: 'conceptual' as const,
      rubric_retry_count: 0,
      rubric_error_retryable: true,
    };

    it('reads issue numbers from fcs_issue_sources during retry', async () => {
      // [req §Story 19.1 Persistence] retry path recovers issue numbers from fcs_issue_sources
      issueSourcesResult = { data: [{ issue_number: 101 }, { issue_number: 202 }], error: null };
      mergedPrsRetryResult = { data: [], error: null };

      await retriggerRubricForAssessment(
        mockAdminClient as never,
        RETRY_ASSESSMENT,
      );

      // Verify fcs_issue_sources was queried with the assessment id
      expect(mockAdminClient.from).toHaveBeenCalledWith('fcs_issue_sources');
    });

    it('reads merged PRs from fcs_merged_prs alongside issue sources during retry', async () => {
      // [req §Story 19.1] retry reads both tables in parallel
      issueSourcesResult = { data: [{ issue_number: 101 }], error: null };
      mergedPrsRetryResult = { data: [{ pr_number: 42 }], error: null };

      await retriggerRubricForAssessment(
        mockAdminClient as never,
        RETRY_ASSESSMENT,
      );

      expect(mockAdminClient.from).toHaveBeenCalledWith('fcs_merged_prs');
      expect(mockAdminClient.from).toHaveBeenCalledWith('fcs_issue_sources');
    });

    it('proceeds with empty issue_numbers when fcs_issue_sources returns no rows', async () => {
      // [issue #287] graceful handling when assessment has no issue sources (PR-only assessment retry)
      issueSourcesResult = { data: [], error: null };
      mergedPrsRetryResult = { data: [{ pr_number: 42 }], error: null };

      // Should not throw — retrigger completes without error
      await expect(
        retriggerRubricForAssessment(mockAdminClient as never, RETRY_ASSESSMENT),
      ).resolves.toBeUndefined();
    });

    it('proceeds with empty pr_numbers when fcs_merged_prs returns no rows', async () => {
      // [issue #287] issue-only assessment retry — no PRs in fcs_merged_prs
      issueSourcesResult = { data: [{ issue_number: 101 }], error: null };
      mergedPrsRetryResult = { data: [], error: null };

      await expect(
        retriggerRubricForAssessment(mockAdminClient as never, RETRY_ASSESSMENT),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Success response shape
  // -------------------------------------------------------------------------

  describe('success response', () => {
    it('returns assessment_id, status rubric_generation, and participant_count when only issue_numbers provided', async () => {
      // [req §Story 19.1] same 201 shape regardless of whether PRs or issues were supplied
      const result = await createFcsForProject(makeCtx(), PROJECT_ID, BASE_BODY_WITH_ISSUES);
      expect(typeof result.assessment_id).toBe('string');
      expect(result.status).toBe('rubric_generation');
      expect(result.participant_count).toBe(1);
    });

    it('returns assessment_id, status rubric_generation, and participant_count when both types provided', async () => {
      // [req §Story 19.1] combined request still yields the same response shape
      const combinedBody: CreateFcsBody = { ...BASE_BODY_WITH_PRS, issue_numbers: [101] };
      const result = await createFcsForProject(makeCtx(), PROJECT_ID, combinedBody);
      expect(result.status).toBe('rubric_generation');
    });
  });
});
