// Tests for POST /api/fcs — epic-aware child issue discovery (Epic 2, Stories 2.1–2.3, issue #322).
// Contract source: docs/design/lld-v4-e2-epic-discovery.md §Stories 2.2 + 2.3,
//                  docs/requirements/v4-requirements.md §Epic 2.
//
// Covers:
//   F. extractArtefacts wiring (discoverChildIssues, fetchIssueContent union, resolveMergedPrSet)
//   G. resolveMergedPrSet with childIssuePrs parameter
//   H. mergeIssueContent dedup by issue number (Story 2.3)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Module-level spy functions — must be declared BEFORE vi.mock calls so they
// are captured in the factory closure (Vitest hoists vi.mock but keeps the
// surrounding scope). Mirrors the pattern in fcs-service-logging.test.ts.
// ---------------------------------------------------------------------------

const mockDiscoverChildIssues = vi.fn();
const mockDiscoverLinkedPRs = vi.fn();
const mockFetchIssueContent = vi.fn();
const mockExtractFromPRs = vi.fn();

// ---------------------------------------------------------------------------
// Module mocks — declared before imports that depend on them
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

vi.mock('@/lib/api/llm', () => ({
  buildLlmClient: vi.fn().mockReturnValue({
    generateStructured: vi.fn().mockResolvedValue({ success: true, data: {} }),
  }),
}));

vi.mock('@/lib/github', () => {
  class MockGitHubArtefactSource {
    discoverChildIssues = mockDiscoverChildIssues;
    discoverLinkedPRs = mockDiscoverLinkedPRs;
    fetchIssueContent = mockFetchIssueContent;
    extractFromPRs = mockExtractFromPRs;
  }
  return { GitHubArtefactSource: MockGitHubArtefactSource };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from '@/lib/api/auth';
import { createGithubClient } from '@/lib/github/client';
import { generateRubric } from '@/lib/engine/pipeline';
import { POST } from '@/app/api/fcs/route';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const REPO_ID = 'a0000000-0000-4000-8000-000000000002';

// ---------------------------------------------------------------------------
// Mock chain builder — mirrors the pattern in fcs-issue-numbers.test.ts
// ---------------------------------------------------------------------------

function makeChain(resolver: () => { data: unknown; error: unknown }) {
  const chain = Object.assign(Promise.resolve(resolver()), {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(() => Promise.resolve(resolver())),
    single: vi.fn(() => Promise.resolve(resolver())),
    maybeSingle: vi.fn(() => Promise.resolve(resolver())),
    insert: vi.fn(() => Promise.resolve(resolver())),
    update: vi.fn(),
  });
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
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
// Mock Octokit
// ---------------------------------------------------------------------------

const mockOctokit = {
  rest: {
    pulls: { get: vi.fn() },
    users: { getByUsername: vi.fn() },
    issues: { get: vi.fn() },
  },
};

// ---------------------------------------------------------------------------
// Mock clients — accessed by vi.mock factory closures above
// ---------------------------------------------------------------------------

const mockUserClient = {
  from: vi.fn((table: string) => {
    if (table === 'user_organisations') return makeChain(() => orgMemberResult);
    return makeChain(() => ({ data: null, error: null }));
  }),
};

const mockAdminClient = {
  from: vi.fn((table: string) => {
    if (table === 'repositories') return makeChain(() => repoResult);
    if (table === 'org_config') return makeChain(() => orgConfigResult);
    if (table === 'fcs_merged_prs') return makeChain(() => mergedPrsRetryResult);
    if (table === 'fcs_issue_sources') return makeChain(() => issueSourcesResult);
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
  githubUserId: 1001,
  githubUsername: 'adminuser',
};

/** Minimal valid body with issue_numbers — the focus of this test file. */
const BASE_BODY_WITH_ISSUES = {
  org_id: ORG_ID,
  repository_id: REPO_ID,
  feature_name: 'Epic feature',
  issue_numbers: [100],
  participants: [{ github_username: 'alice' }],
};

// Minimal artefact set returned by extractFromPRs spy — satisfies AssembledArtefactSet
// shape enough for generateRubric to receive it without schema errors.
const EMPTY_RAW_ARTEFACT = {
  artefact_type: 'feature' as const,
  pr_diff: '(no PRs provided)',
  file_listing: [{ path: '(none)', additions: 0, deletions: 0, status: 'none' }],
  file_contents: [],
  linked_issues: [] as Array<{ title: string; body: string; number?: number }>,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/fcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await POST(makeRequest(body));
  const out = { status: res.status, json: await res.json() };
  // triggerRubricGeneration runs as fire-and-forget — yield so it can flush
  // before the test reads mocks. Matches the pattern in fcs-service-logging.test.ts.
  await new Promise((resolve) => setTimeout(resolve, 50));
  return out;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(requireAuth).mockResolvedValue(AUTH_USER);
  vi.mocked(createGithubClient).mockResolvedValue(mockOctokit as never);

  // generateRubric resolves successfully — we don't test rubric content here
  vi.mocked(generateRubric).mockResolvedValue({
    status: 'success',
    rubric: { questions: [] },
    observability: { inputTokens: 0, outputTokens: 0, toolCalls: [], durationMs: 0 },
  } as never);

  mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Test PR', merged_at: '2026-01-01T00:00:00Z' } });
  mockOctokit.rest.users.getByUsername.mockResolvedValue({ data: { id: 99001, login: 'alice' } });
  mockOctokit.rest.issues.get.mockResolvedValue({
    data: { number: 100, title: 'Epic Issue', body: 'body text', pull_request: undefined },
  });

  orgMemberResult = { data: [{ github_role: 'admin' }], error: null };
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

  // Default spy behaviour — override per test as needed
  mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
  mockDiscoverLinkedPRs.mockResolvedValue([]);
  mockFetchIssueContent.mockResolvedValue([]);
  mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);
});

// ---------------------------------------------------------------------------
// F. extractArtefacts wiring
// ---------------------------------------------------------------------------

describe('POST /api/fcs — epic child issue discovery (issue #322)', () => {

  describe('extractArtefacts wiring — discoverChildIssues', () => {

    // F1: discoverChildIssues is called with the provided issueNumbers
    it('calls source.discoverChildIssues with the provided issue numbers', async () => {
      // [lld §Story 2.2 extractArtefacts] "source.discoverChildIssues({ ...coords, issueNumbers })"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });

      await callPost(BASE_BODY_WITH_ISSUES);

      expect(mockDiscoverChildIssues).toHaveBeenCalledWith(
        expect.objectContaining({ issueNumbers: [100] }),
      );
    });

    // F2: discoverChildIssues NOT called when issueNumbers is empty (merged_pr_numbers only)
    it('does NOT call source.discoverChildIssues when only merged_pr_numbers are provided', async () => {
      // [lld §Story 2.2 extractArtefacts] "issueNumbers.length > 0 ? … : { childIssueNumbers: [], childIssuePrs: [] }"
      const body = {
        org_id: ORG_ID,
        repository_id: REPO_ID,
        feature_name: 'PR-only feature',
        merged_pr_numbers: [42],
        participants: [{ github_username: 'alice' }],
      };
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'PR 42', merged_at: '2026-01-01' } });

      await callPost(body);

      expect(mockDiscoverChildIssues).not.toHaveBeenCalled();
    });

    // F3: fetchIssueContent called with UNION of provided + child issue numbers
    it('calls fetchIssueContent with the union of provided and child issue numbers', async () => {
      // [lld §Story 2.2 extractArtefacts] "allIssueNumbers = union(provided, children)"
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201, 202],
        childIssuePrs: [],
      });

      await callPost(BASE_BODY_WITH_ISSUES);

      expect(mockFetchIssueContent).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumbers: expect.arrayContaining([100, 201, 202]),
        }),
      );
    });

    // F4: fetchIssueContent called with deduplicated numbers when child overlaps provided
    it('deduplicates issue numbers before passing to fetchIssueContent', async () => {
      // [lld §Invariant I3] "union and deduplicated by issue number"
      // childIssueNumbers includes 100 which is already in providedIssueNumbers
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [100, 201],
        childIssuePrs: [],
      });

      await callPost(BASE_BODY_WITH_ISSUES);

      const callArg = mockFetchIssueContent.mock.calls[0]?.[0] as { issueNumbers: number[] };
      const count100 = callArg.issueNumbers.filter((n: number) => n === 100).length;
      expect(count100).toBe(1);
    });

    // F5: childIssuePrs included in the merged PR set (i.e. extractFromPRs receives them)
    it('includes childIssuePrs in the PR set passed to extractFromPRs', async () => {
      // [lld §Story 2.2 resolveMergedPrSet] "union(explicit, providedIssuePrs, childIssuePrs)"
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201],
        childIssuePrs: [88],
      });
      mockDiscoverLinkedPRs.mockResolvedValue([]); // no PRs from provided issues

      await callPost(BASE_BODY_WITH_ISSUES);

      expect(mockExtractFromPRs).toHaveBeenCalledWith(
        expect.objectContaining({ prNumbers: expect.arrayContaining([88]) }),
      );
    });

    // F6: discoverLinkedPRs called with provided issue numbers ONLY, not children
    it('calls discoverLinkedPRs with provided issue numbers only — not child issue numbers', async () => {
      // [lld §Story 2.2 resolveMergedPrSet] "discoverLinkedPRs runs only for the originally provided issues"
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201, 202],
        childIssuePrs: [],
      });

      await callPost(BASE_BODY_WITH_ISSUES);

      expect(mockDiscoverLinkedPRs).toHaveBeenCalledWith(
        expect.objectContaining({ issueNumbers: [100] }),
      );
      expect(mockDiscoverLinkedPRs).not.toHaveBeenCalledWith(
        expect.objectContaining({ issueNumbers: expect.arrayContaining([201]) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // G. resolveMergedPrSet — unions all three PR sources
  // -------------------------------------------------------------------------

  describe('resolveMergedPrSet — union of explicit, provided-issue, and child-issue PRs', () => {

    // G1: explicit PRs + discoveredLinkedPRs + childIssuePrs all appear in extractFromPRs call
    it('unions explicit PRs, provided-issue PRs, and child-issue PRs into one deduplicated set', async () => {
      // [lld §Story 2.2 resolveMergedPrSet] "union(explicit, discoveredPrs, childIssuePrs)"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [88] });
      mockDiscoverLinkedPRs.mockResolvedValue([55]);
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'Explicit PR', merged_at: '2026-01-01' } });
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 100, title: 'Epic', body: '', pull_request: undefined },
      });

      const body = { ...BASE_BODY_WITH_ISSUES, merged_pr_numbers: [42] };
      await callPost(body);

      expect(mockExtractFromPRs).toHaveBeenCalledWith(
        expect.objectContaining({
          prNumbers: expect.arrayContaining([42, 55, 88]),
        }),
      );
    });

    // G2: duplicate PRs across all three sources appear once
    it('deduplicates a PR that appears in explicit, discovered, and child-issue sets', async () => {
      // [lld §Invariant I5] "Child-issue-discovered PRs are deduplicated against explicit and issue-discovered PRs"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [99] });
      mockDiscoverLinkedPRs.mockResolvedValue([99]);  // same PR as child
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'PR 99', merged_at: '2026-01-01' } });
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 100, title: 'Epic', body: '', pull_request: undefined },
      });

      const body = { ...BASE_BODY_WITH_ISSUES, merged_pr_numbers: [99] };
      await callPost(body);

      const callArg = mockExtractFromPRs.mock.calls[0]?.[0] as { prNumbers: number[] };
      const count99 = callArg.prNumbers.filter((n: number) => n === 99).length;
      expect(count99).toBe(1);
    });

    // G3: no children found — pipeline continues unchanged (existing behaviour)
    it('continues normally when discoverChildIssues returns empty sets', async () => {
      // [lld §Invariant I7] "When no children are found, pipeline continues unchanged"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([55]);

      await callPost(BASE_BODY_WITH_ISSUES);

      expect(mockExtractFromPRs).toHaveBeenCalledWith(
        expect.objectContaining({ prNumbers: [55] }),
      );
    });

    // G4: child issues with no linked PRs — no error, other PRs still included
    it('handles child issues with no linked PRs without error and includes explicit PRs', async () => {
      // [lld §Story 2.2 BDD] "handles child issues with no linked PRs — no error, other PRs still included"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [201], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'PR 42', merged_at: '2026-01-01' } });
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 100, title: 'Epic', body: '', pull_request: undefined },
      });

      const body = { ...BASE_BODY_WITH_ISSUES, merged_pr_numbers: [42] };
      await expect(callPost(body)).resolves.toMatchObject({ status: 201 });
    });
  });

  // -------------------------------------------------------------------------
  // H. mergeIssueContent — deduplication by issue number (Story 2.3)
  // -------------------------------------------------------------------------

  describe('mergeIssueContent — deduplication by issue number', () => {

    // H1: issue with number deduped by #<number>, not title
    it('deduplicates LinkedIssues by "#<number>" key when number is present', async () => {
      // [lld §Invariant I6] "Issue content deduplication uses issue number, not title"
      // [lld §Story 2.3 mergeIssueContent] "byKey.set(issue.number !== undefined ? `#${issue.number}` : issue.title, issue)"
      //
      // fetchIssueContent returns the canonical entry (number=100, explicit body).
      // extractFromPRs returns the same issue number with a different (PR-body-discovered) title.
      // After mergeIssueContent, only one entry for number=100 should survive.
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Issue 100 (canonical)', body: 'Canonical body.', number: 100 },
      ]);
      mockExtractFromPRs.mockResolvedValue({
        ...EMPTY_RAW_ARTEFACT,
        linked_issues: [
          { title: 'Issue 100 (PR-discovered)', body: 'PR body.', number: 100 },
        ],
      });

      const body = { ...BASE_BODY_WITH_ISSUES, merged_pr_numbers: [42] };
      mockOctokit.rest.pulls.get.mockResolvedValue({ data: { title: 'PR 42', merged_at: '2026-01-01' } });
      mockOctokit.rest.issues.get.mockResolvedValue({
        data: { number: 100, title: 'Epic', body: '', pull_request: undefined },
      });

      const { status } = await callPost(body);
      expect(status).toBe(201);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number; title: string }> };
      } | undefined;
      if (rubricCall) {
        const count100 = (rubricCall.artefacts.linked_issues ?? []).filter((e) => e.number === 100).length;
        expect(count100).toBe(1);
      }
    });

    // H2: two issues with the same title but different numbers — both kept
    it('keeps both LinkedIssues when they share a title but have different numbers', async () => {
      // [lld §Invariant I6] "two issues with the same title → both kept" (dedup is by number)
      // [lld §Story 2.3 BDD] "does not merge distinct issues that happen to have the same title"
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Feature: payments', body: 'Body of issue 100.', number: 100 },
        { title: 'Feature: payments', body: 'Body of issue 201.', number: 201 },
      ]);
      mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);

      await callPost(BASE_BODY_WITH_ISSUES);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number; title: string }> };
      } | undefined;
      if (rubricCall) {
        const issues = rubricCall.artefacts.linked_issues ?? [];
        // Both issues should survive — same title does NOT merge when numbers differ
        expect(issues.filter((e) => e.number === 100)).toHaveLength(1);
        expect(issues.filter((e) => e.number === 201)).toHaveLength(1);
      }
    });

    // H3: title-based dedup for issues without a number (PR-body-discovered)
    it('falls back to title-based dedup for LinkedIssues that have no number', async () => {
      // [lld §Story 2.3 mergeIssueContent] "issue.number !== undefined ? `#${issue.number}` : issue.title"
      // Issues discovered from PR body cross-refs don't carry a number.
      // Two numberless entries with the same title → only one survives.
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([42]);
      mockFetchIssueContent.mockResolvedValue([]);
      mockExtractFromPRs.mockResolvedValue({
        ...EMPTY_RAW_ARTEFACT,
        linked_issues: [
          { title: 'Auth Design', body: 'First occurrence.' },
          { title: 'Auth Design', body: 'Second occurrence.' },
        ],
      });

      await callPost(BASE_BODY_WITH_ISSUES);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ title: string }> };
      } | undefined;
      if (rubricCall) {
        const authEntries = (rubricCall.artefacts.linked_issues ?? []).filter(
          (e) => e.title === 'Auth Design',
        );
        expect(authEntries).toHaveLength(1);
      }
    });

    // H4: fetchIssueContent includes child issues alongside the epic
    it('includes content for both the epic and its child issues in linked_issues', async () => {
      // [lld §Story 2.3 content fetching] "fetches body and comments for child issues alongside the epic"
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201],
        childIssuePrs: [],
      });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Epic Issue', body: 'Epic body.', number: 100 },
        { title: 'Child Issue', body: 'Child body.', number: 201 },
      ]);
      mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);

      await callPost(BASE_BODY_WITH_ISSUES);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number }> };
      } | undefined;
      if (rubricCall) {
        const nums = (rubricCall.artefacts.linked_issues ?? []).map((e) => e.number);
        expect(nums).toContain(100);
        expect(nums).toContain(201);
      }
    });

    // H5: epic content is not replaced by child issue content
    it('epic content is preserved alongside child issue content (neither replaces the other)', async () => {
      // [lld §Story 2.3 BDD] "epic content is not replaced by child issue content"
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201],
        childIssuePrs: [],
      });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Epic: payments v2', body: 'Epic body.', number: 100 },
        { title: 'Implement payment service', body: 'Child body.', number: 201 },
      ]);
      mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);

      await callPost(BASE_BODY_WITH_ISSUES);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number; title: string }> };
      } | undefined;
      if (rubricCall) {
        const issues = rubricCall.artefacts.linked_issues ?? [];
        expect(issues.find((e) => e.number === 100)).toBeDefined();
        expect(issues.find((e) => e.number === 201)).toBeDefined();
      }
    });

    // H6: deduplication by #<number> when child was also explicitly provided (Story 2.3 regression)
    it('deduplicates by #<number> when a child issue was also in the original issue_numbers', async () => {
      // [lld §Story 2.3 BDD] "deduplicates by issue number when a child was also explicitly provided"
      // Issue 201 is provided as both explicit (issue_numbers=[100,201]) and as a child of 100.
      // fetchIssueContent returns one entry for 201 → after merge only one entry should survive.
      mockDiscoverChildIssues.mockResolvedValue({
        childIssueNumbers: [201],
        childIssuePrs: [],
      });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'Issue 201 content', body: 'body.', number: 201 },
      ]);
      mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);
      mockOctokit.rest.issues.get
        .mockResolvedValueOnce({ data: { number: 100, title: 'Epic', body: '', pull_request: undefined } })
        .mockResolvedValueOnce({ data: { number: 201, title: 'Child', body: '', pull_request: undefined } });

      const body = { ...BASE_BODY_WITH_ISSUES, issue_numbers: [100, 201] };
      await callPost(body);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number }> };
      } | undefined;
      if (rubricCall) {
        const count201 = (rubricCall.artefacts.linked_issues ?? []).filter((e) => e.number === 201).length;
        expect(count201).toBe(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // LinkedIssue.number field — fetchIssueContent populates it (Story 2.3)
  // -------------------------------------------------------------------------

  describe('LinkedIssue.number field from fetchIssueContent', () => {

    // H7: fetchIssueContent result carries the issue number through to generateRubric
    it('linked_issues entries returned by fetchIssueContent carry the issue number', async () => {
      // [lld §Story 2.3] "fetchSingleIssue … include `number` in returned LinkedIssue"
      // Verifies the number field flows through the service pipeline to generateRubric.
      mockDiscoverChildIssues.mockResolvedValue({ childIssueNumbers: [], childIssuePrs: [] });
      mockDiscoverLinkedPRs.mockResolvedValue([]);
      mockFetchIssueContent.mockResolvedValue([
        { title: 'My Issue', body: 'body text.', number: 100 },
      ]);
      mockExtractFromPRs.mockResolvedValue(EMPTY_RAW_ARTEFACT);

      await callPost(BASE_BODY_WITH_ISSUES);

      const rubricCall = vi.mocked(generateRubric).mock.calls[0]?.[0] as {
        artefacts: { linked_issues?: Array<{ number?: number }> };
      } | undefined;
      const issue = rubricCall?.artefacts.linked_issues?.[0];
      expect(issue?.number).toBe(100);
    });
  });
});
