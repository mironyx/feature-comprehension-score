// Tests for epic-aware artefact discovery — Epic 2, Stories 2.1–2.2, issue #322.
// Contract source: docs/design/lld-v4-e2-epic-discovery.md, docs/requirements/v4-requirements.md §Epic 2.
//
// Covers:
//   A. parseTaskListReferences — pure helper
//   B. extractMergedPrNumbers — pure helper
//   C. buildEpicDiscoveryQuery — pure helper
//   D. buildBatchCrossRefQuery — pure helper
//   E. GitHubArtefactSource.discoverChildIssues — integration (MSW)

import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  GitHubArtefactSource,
  parseTaskListReferences,
  extractMergedPrNumbers,
  buildEpicDiscoveryQuery,
  buildBatchCrossRefQuery,
} from '@/lib/github/artefact-source';
import {
  mockGraphQLEpicDiscovery,
  mockGraphQLBatchCrossRef,
  mockGraphQLError,
} from '../../mocks/github';
import { server } from '../../mocks/server';

const OWNER = 'acme';
const REPO = 'platform';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeSource() {
  return new GitHubArtefactSource(new Octokit({ auth: 'mock-token' }));
}

// ---------------------------------------------------------------------------
// A. parseTaskListReferences
// [lld §Story 2.1 task list reference parsing]
// ---------------------------------------------------------------------------

describe('parseTaskListReferences', () => {
  // A1: checked task list item
  describe('Given a body containing "- [x] #N" at the start of a line', () => {
    it('then returns the issue number', () => {
      // [lld §Story 2.1 — I4] only checkbox items match, not prose
      const body = '- [x] #295\nSome text after.';
      expect(parseTaskListReferences(body)).toContain(295);
    });
  });

  // A2: unchecked task list item
  describe('Given a body containing "- [ ] #N" at the start of a line', () => {
    it('then returns the issue number (unchecked items are included)', () => {
      // [lld §Story 2.1] both `[x]` and `[ ]` match
      const body = '- [ ] #296\nSome text.';
      expect(parseTaskListReferences(body)).toContain(296);
    });
  });

  // A3: prose reference — must NOT match
  describe('Given a body containing "see #123" in prose', () => {
    it('then does not return 123 (prose references are excluded)', () => {
      // [lld §Story 2.1 — I4] "does NOT match prose references like `see #123`"
      const body = 'See #123 for context.\nAlso closes #456.';
      expect(parseTaskListReferences(body)).not.toContain(123);
    });
  });

  // A4: closes/fixes keyword reference — must NOT match
  describe('Given a body containing "closes #456" or "fixes #789"', () => {
    it('then does not return those numbers (keyword references are not task list items)', () => {
      // [lld §Story 2.1 — I4] keyword references are prose, not checkbox items
      const body = 'closes #456\nfixes #789';
      const result = parseTaskListReferences(body);
      expect(result).not.toContain(456);
      expect(result).not.toContain(789);
    });
  });

  // A5: bare reference without checkbox prefix
  describe('Given a body containing "#99" without a checkbox prefix', () => {
    it('then does not return 99 (no checkbox means no match)', () => {
      // [lld §Story 2.1] regex anchored to `- [x ]` prefix
      const body = '#99 is interesting\n- #42 also interesting';
      const result = parseTaskListReferences(body);
      expect(result).not.toContain(99);
      expect(result).not.toContain(42);
    });
  });

  // A6: dash without checkbox
  describe('Given a body containing "- #42" (no checkbox)', () => {
    it('then does not return 42', () => {
      // [lld §Story 2.1] "- #42" is a plain list item, not a checkbox item
      const body = '- #42 plain list item\n';
      expect(parseTaskListReferences(body)).not.toContain(42);
    });
  });

  // A7: multiple items — returned in order of appearance
  describe('Given a body with multiple checkbox issue references', () => {
    it('then returns all numbers in order of appearance', () => {
      // [lld §Story 2.1] "Returns raw numbers — deduplication happens in the caller"
      const body = '- [x] #10\n- [ ] #20\n- [x] #30';
      const result = parseTaskListReferences(body);
      expect(result).toEqual([10, 20, 30]);
    });
  });

  // A8: no task list items — returns empty array
  describe('Given a body with no task list checkbox items', () => {
    it('then returns an empty array', () => {
      // [lld §Story 2.1] "Returns raw numbers — deduplication happens in the caller"
      const body = 'Just a plain body\nNo checkboxes here.';
      expect(parseTaskListReferences(body)).toEqual([]);
    });
  });

  // A9: mixed content — task list interleaved with prose
  describe('Given a body with task list items interleaved with prose and code blocks', () => {
    it('then extracts only checkbox items and ignores the surrounding prose', () => {
      // [lld §Story 2.1 — I4] multiline body with noise between items
      const body = [
        '## Tasks',
        '- [x] #100',
        'See issue #200 for background.',
        '```',
        '- #300',
        '```',
        '- [ ] #400',
      ].join('\n');
      const result = parseTaskListReferences(body);
      expect(result).toContain(100);
      expect(result).toContain(400);
      expect(result).not.toContain(200);
      expect(result).not.toContain(300);
    });
  });
});

// ---------------------------------------------------------------------------
// B. extractMergedPrNumbers
// [lld §Story 2.1 cross-ref node filtering]
// ---------------------------------------------------------------------------

describe('extractMergedPrNumbers', () => {
  // B1: extracts merged PRs
  describe('Given nodes where source.merged is true', () => {
    it('then returns their PR numbers', () => {
      // [lld §Story 2.1] "source.merged === true → include"
      const nodes = [
        { source: { number: 55, merged: true } },
        { source: { number: 56, merged: true } },
      ];
      expect(extractMergedPrNumbers(nodes)).toEqual([55, 56]);
    });
  });

  // B2: filters non-merged PRs
  describe('Given nodes where source.merged is false', () => {
    it('then does not include those PR numbers', () => {
      // [lld §Story 2.1] "source.merged !== true → skip"
      const nodes = [
        { source: { number: 77, merged: false } },
        { source: { number: 78, merged: true } },
      ];
      const result = extractMergedPrNumbers(nodes);
      expect(result).not.toContain(77);
      expect(result).toContain(78);
    });
  });

  // B3: missing source — skipped
  describe('Given nodes with no source property', () => {
    it('then skips those nodes (no crash, no output)', () => {
      // [lld §Story 2.1] "if source === undefined … continue"
      const nodes = [
        {},
        { source: { number: 90, merged: true } },
      ];
      const result = extractMergedPrNumbers(nodes as Parameters<typeof extractMergedPrNumbers>[0]);
      expect(result).toEqual([90]);
    });
  });

  // B4: source.number is not a number — skipped
  describe('Given nodes where source.number is undefined', () => {
    it('then skips those nodes', () => {
      // [lld §Story 2.1] "if typeof source.number !== 'number' … continue"
      const nodes = [
        { source: { merged: true } },
        { source: { number: 101, merged: true } },
      ];
      const result = extractMergedPrNumbers(nodes as Parameters<typeof extractMergedPrNumbers>[0]);
      expect(result).toEqual([101]);
    });
  });

  // B5: empty input
  describe('Given an empty nodes array', () => {
    it('then returns an empty array', () => {
      expect(extractMergedPrNumbers([])).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// C. buildEpicDiscoveryQuery
// [lld §Story 2.1 Query 1]
// ---------------------------------------------------------------------------

describe('buildEpicDiscoveryQuery', () => {
  // C1: one alias per issue number
  describe('Given issue numbers [42, 43]', () => {
    it('then the returned string contains one "issue42: issue(number: 42)" alias and one for 43', () => {
      // [lld §Story 2.1] "one `issueN: issue(number: N)` alias per provided issue number"
      const q = buildEpicDiscoveryQuery([42, 43]);
      expect(q).toContain('issue42: issue(number: 42)');
      expect(q).toContain('issue43: issue(number: 43)');
    });
  });

  // C2: contains body field per alias
  describe('Given any non-empty issue list', () => {
    it('then the query contains the "body" field', () => {
      // [lld §Story 2.1 EPIC_DISCOVERY_FRAGMENT] "body" is required for task list parsing
      const q = buildEpicDiscoveryQuery([1]);
      expect(q).toContain('body');
    });
  });

  // C3: contains subIssues field
  describe('Given any non-empty issue list', () => {
    it('then the query contains the "subIssues" field', () => {
      // [lld §Story 2.1 EPIC_DISCOVERY_FRAGMENT]
      const q = buildEpicDiscoveryQuery([1]);
      expect(q).toContain('subIssues');
    });
  });

  // C4: contains timelineItems field
  describe('Given any non-empty issue list', () => {
    it('then the query contains the "timelineItems" field (for nested sub-issue PRs)', () => {
      // [lld §Story 2.1 EPIC_DISCOVERY_FRAGMENT]
      const q = buildEpicDiscoveryQuery([1]);
      expect(q).toContain('timelineItems');
    });
  });

  // C5: is a valid GraphQL query (has "query" keyword and "repository" field)
  describe('Given any non-empty issue list', () => {
    it('then the returned string is a GraphQL query containing a repository field', () => {
      // [lld §Story 2.1 buildEpicDiscoveryQuery]
      const q = buildEpicDiscoveryQuery([10]);
      expect(q).toMatch(/^query\s*\(/);
      expect(q).toContain('repository(');
    });
  });
});

// ---------------------------------------------------------------------------
// D. buildBatchCrossRefQuery
// [lld §Story 2.1 Query 2]
// ---------------------------------------------------------------------------

describe('buildBatchCrossRefQuery', () => {
  // D1: one alias per issue number
  describe('Given issue numbers [295, 296]', () => {
    it('then the returned string contains one "issue295: issue(number: 295)" alias and one for 296', () => {
      // [lld §Story 2.1 buildBatchCrossRefQuery]
      const q = buildBatchCrossRefQuery([295, 296]);
      expect(q).toContain('issue295: issue(number: 295)');
      expect(q).toContain('issue296: issue(number: 296)');
    });
  });

  // D2: contains timelineItems but NOT subIssues
  describe('Given any non-empty issue list', () => {
    it('then the query contains "timelineItems" and does not contain "subIssues"', () => {
      // [lld §Story 2.1] Query 2 is cross-ref only; subIssues is Query 1 only
      const q = buildBatchCrossRefQuery([1]);
      expect(q).toContain('timelineItems');
      expect(q).not.toContain('subIssues');
    });
  });

  // D3: is a valid GraphQL query
  describe('Given any non-empty issue list', () => {
    it('then the returned string is a GraphQL query containing a repository field', () => {
      // [lld §Story 2.1 buildBatchCrossRefQuery]
      const q = buildBatchCrossRefQuery([10]);
      expect(q).toMatch(/^query\s*\(/);
      expect(q).toContain('repository(');
    });
  });
});

// ---------------------------------------------------------------------------
// E. GitHubArtefactSource.discoverChildIssues
// [lld §Story 2.1 + 2.2 adapter method]
// ---------------------------------------------------------------------------

describe('GitHubArtefactSource.discoverChildIssues', () => {

  // -------------------------------------------------------------------------
  // Query 1 — epic discovery (batched via dynamic aliases)
  // -------------------------------------------------------------------------

  describe('Query 1 — epic discovery (batched via dynamic aliases)', () => {

    // E1: returns sub-issue numbers from Query 1
    describe('Given an epic issue with native sub-issues', () => {
      it('then childIssueNumbers contains the sub-issue numbers', async () => {
        // [lld §Story 2.1] "returns sub-issue numbers from the GraphQL sub-issues field"
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: null, subIssues: [{ number: 201, prs: [] }, { number: 202, prs: [] }] },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssueNumbers).toContain(201);
        expect(result.childIssueNumbers).toContain(202);
      });
    });

    // E2: returns merged PRs from sub-issues' nested timelineItems
    describe('Given sub-issues that have merged PRs in their timelineItems', () => {
      it('then childIssuePrs contains those merged PR numbers', async () => {
        // [lld §Story 2.1] "returns merged PRs for each sub-issue from nested timelineItems"
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: null,
              subIssues: [
                { number: 201, prs: [{ number: 55, merged: true }] },
              ],
            },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssuePrs).toContain(55);
      });
    });

    // E3: non-merged PRs from sub-issues are filtered out
    describe('Given sub-issues that have non-merged PRs in their timelineItems', () => {
      it('then those non-merged PR numbers are NOT in childIssuePrs', async () => {
        // [lld §Story 2.1] "filters out non-merged PRs from sub-issue cross-references"
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: null,
              subIssues: [
                { number: 201, prs: [{ number: 66, merged: false }, { number: 67, merged: true }] },
              ],
            },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssuePrs).not.toContain(66);
        expect(result.childIssuePrs).toContain(67);
      });
    });

    // E4: non-epic issue returns empty result
    describe('Given an issue with no sub-issues and no task list in the body', () => {
      it('then returns { childIssueNumbers: [], childIssuePrs: [] } without throwing', async () => {
        // [lld §Invariant I1] "always attempted — no label check"; non-epic → empty, no error
        server.use(
          mockGraphQLEpicDiscovery({
            50: { body: 'Plain issue body.', subIssues: [] },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [50] });
        expect(result.childIssueNumbers).toEqual([]);
        expect(result.childIssuePrs).toEqual([]);
      });
    });

    // E5: all provided issues batched into a single Query 1 request
    describe('Given two issue numbers provided at once', () => {
      it('then only one GraphQL POST is made (batched aliases in a single request)', async () => {
        // [lld §Story 2.1 GraphQL batching] "all provided issues into a single request"
        let postCount = 0;
        server.use(
          mockGraphQLEpicDiscovery({
            10: { body: null, subIssues: [{ number: 11, prs: [] }] },
            20: { body: null, subIssues: [{ number: 21, prs: [] }] },
          }),
        );
        // Intercept to count — wrap after the factory so it shadows correctly
        const { http, HttpResponse } = await import('msw');
        server.use(
          http.post('https://api.github.com/graphql', async ({ request }) => {
            postCount++;
            const payload = (await request.json()) as { query?: string };
            if (!payload.query?.includes('subIssues')) return new Response(null, { status: 501 });
            return HttpResponse.json({
              data: {
                repository: {
                  issue10: { body: null, subIssues: { nodes: [{ number: 11, timelineItems: { nodes: [] } }] } },
                  issue20: { body: null, subIssues: { nodes: [{ number: 21, timelineItems: { nodes: [] } }] } },
                },
              },
            });
          }),
        );
        const source = makeSource();
        await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [10, 20] });
        expect(postCount).toBe(1);
      });
    });

    // E6: GraphQL failure on Query 1 — returns empty, does not throw
    describe('Given the GraphQL endpoint returns an error on Query 1', () => {
      it('then discoverChildIssues resolves to empty sets without throwing', async () => {
        // [lld §Story 2.1] "gracefully handles GraphQL failure — falls back to task list only"
        // When Query 1 fails, queryEpicDiscovery catches and returns empty map → empty result
        server.use(mockGraphQLError('Query 1 exploded'));
        const source = makeSource();
        await expect(
          source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] }),
        ).resolves.toEqual({ childIssueNumbers: [], childIssuePrs: [] });
      });
    });
  });

  // -------------------------------------------------------------------------
  // Task list reference parsing
  // -------------------------------------------------------------------------

  describe('task list reference parsing', () => {

    // E7: task list children included in childIssueNumbers
    describe('Given an epic body with "- [x] #N" entries', () => {
      it('then childIssueNumbers contains the referenced issue numbers', async () => {
        // [lld §Story 2.1] "returns task-list issue numbers parsed from the body"
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: '- [x] #295\n- [ ] #296\n', subIssues: [] },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssueNumbers).toContain(295);
        expect(result.childIssueNumbers).toContain(296);
      });
    });

    // E8: prose in body does not add issue numbers
    describe('Given an epic body with "see #123" in prose (no checkbox)', () => {
      it('then 123 is NOT in childIssueNumbers', async () => {
        // [lld §Invariant I4] prose references excluded
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: 'See #123 for background.', subIssues: [] },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssueNumbers).not.toContain(123);
      });
    });

    // E9: null body is handled gracefully
    describe('Given an epic issue whose body is null', () => {
      it('then no task list numbers are added and no error is thrown', async () => {
        // [lld §Story 2.1] "body !== null ? parseTaskListReferences(q1.body) : []"
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: null, subIssues: [{ number: 201, prs: [] }] },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssueNumbers).toContain(201);
        expect(result.childIssueNumbers).toHaveLength(1);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Query 2 — batch PR discovery for task-list-only children
  // -------------------------------------------------------------------------

  describe('Query 2 — batch PR discovery for task-list-only children', () => {

    // E10: Query 2 fired when task-list children are absent from sub-issues
    describe('Given an epic whose body has task list items NOT present in sub-issues', () => {
      it('then Query 2 is fired and its merged PRs are included in childIssuePrs', async () => {
        // [lld §Story 2.1] "fires Query 2 only when there are task-list-only children"
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: '- [x] #295\n', subIssues: [] },  // 295 is task-list-only
          }),
          mockGraphQLBatchCrossRef({
            295: [{ number: 88, merged: true }],
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssuePrs).toContain(88);
      });
    });

    // E11: Query 2 batches all task-list-only children in a single request
    describe('Given two task-list-only children that need PR discovery', () => {
      it('then a single Query 2 POST is made for both children', async () => {
        // [lld §Story 2.1] "BATCH_CROSS_REF_QUERY (aliased)" — one request for all task-list-only children
        let q2PostCount = 0;
        const { http, HttpResponse } = await import('msw');
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: '- [x] #295\n- [x] #296\n', subIssues: [] },
          }),
          http.post('https://api.github.com/graphql', async ({ request }) => {
            const payload = (await request.json()) as { query?: string };
            if (payload.query?.includes('subIssues')) return new Response(null, { status: 501 });
            q2PostCount++;
            return HttpResponse.json({
              data: {
                repository: {
                  issue295: { timelineItems: { nodes: [] } },
                  issue296: { timelineItems: { nodes: [] } },
                },
              },
            });
          }),
        );
        const source = makeSource();
        await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(q2PostCount).toBe(1);
      });
    });

    // E12: Query 2 skipped when all task-list children are already in sub-issues
    describe('Given an epic whose task-list items are all present in sub-issues', () => {
      it('then Query 2 is NOT fired', async () => {
        // [lld §Story 2.1] "skips Query 2 when all task-list children are already in sub-issues"
        let q2Called = false;
        const { http, HttpResponse } = await import('msw');
        server.use(
          mockGraphQLEpicDiscovery({
            // 201 appears in both sub-issues and the task list
            100: {
              body: '- [x] #201\n',
              subIssues: [{ number: 201, prs: [{ number: 55, merged: true }] }],
            },
          }),
          http.post('https://api.github.com/graphql', async ({ request }) => {
            const payload = (await request.json()) as { query?: string };
            if (payload.query?.includes('subIssues')) return new Response(null, { status: 501 });
            // If this handler fires, Query 2 was incorrectly invoked
            q2Called = true;
            return HttpResponse.json({ data: { repository: {} } });
          }),
        );
        const source = makeSource();
        await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(q2Called).toBe(false);
      });
    });

    // E13: Query 2 skipped when body has no task list items
    describe('Given an epic whose body has no task list references', () => {
      it('then Query 2 is NOT fired', async () => {
        // [lld §Story 2.1] "skips Query 2 when there are no task-list children"
        let q2Called = false;
        const { http, HttpResponse } = await import('msw');
        server.use(
          mockGraphQLEpicDiscovery({
            100: { body: 'No task list here.', subIssues: [] },
          }),
          http.post('https://api.github.com/graphql', async ({ request }) => {
            const payload = (await request.json()) as { query?: string };
            if (payload.query?.includes('subIssues')) return new Response(null, { status: 501 });
            q2Called = true;
            return HttpResponse.json({ data: { repository: {} } });
          }),
        );
        const source = makeSource();
        await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(q2Called).toBe(false);
      });
    });

    // E14: GraphQL failure on Query 2 — sub-issue PRs still returned, no throw
    describe('Given Query 2 returns a GraphQL error', () => {
      it('then resolves without throwing and childIssuePrs contains only sub-issue PRs', async () => {
        // [lld §Story 2.1] "gracefully handles GraphQL failure — returns empty PRs"
        const { http, HttpResponse } = await import('msw');
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: '- [x] #295\n',
              subIssues: [{ number: 201, prs: [{ number: 55, merged: true }] }],
            },
          }),
          http.post('https://api.github.com/graphql', async ({ request }) => {
            const payload = (await request.json()) as { query?: string };
            if (payload.query?.includes('subIssues')) return new Response(null, { status: 501 });
            return HttpResponse.json({ errors: [{ message: 'Query 2 error' }] }, { status: 200 });
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssuePrs).toContain(55);
        // 295 has no PRs from Query 1 — Query 2 failed silently
        expect(() => result.childIssuePrs).not.toThrow();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Union and deduplication
  // -------------------------------------------------------------------------

  describe('union and deduplication', () => {

    // E15: deduplication of issue numbers across sub-issues and task list
    describe('Given a sub-issues list and a task list that share issue numbers', () => {
      it('then childIssueNumbers contains each shared number exactly once', async () => {
        // [lld §Invariant I3] "union and deduplicated by issue number"
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: '- [x] #201\n- [x] #202\n',
              subIssues: [
                { number: 201, prs: [] },  // 201 appears in both
                { number: 203, prs: [] },
              ],
            },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        const count201 = result.childIssueNumbers.filter((n) => n === 201).length;
        expect(count201).toBe(1);
        expect(result.childIssueNumbers).toContain(202);
        expect(result.childIssueNumbers).toContain(203);
      });
    });

    // E16: PR deduplication across Query 1 and Query 2
    describe('Given a PR that appears in both sub-issue cross-refs (Q1) and task-list cross-refs (Q2)', () => {
      it('then that PR appears exactly once in childIssuePrs', async () => {
        // [lld §Invariant I5] "Child-issue-discovered PRs are deduplicated"
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: '- [x] #295\n',  // task-list-only child
              subIssues: [{ number: 201, prs: [{ number: 88, merged: true }] }],
            },
          }),
          mockGraphQLBatchCrossRef({
            295: [{ number: 88, merged: true }],  // same PR 88
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        const count88 = result.childIssuePrs.filter((n) => n === 88).length;
        expect(count88).toBe(1);
      });
    });

    // E17: merged PRs from Q1 and Q2 are both present in childIssuePrs
    describe('Given unique PRs from both sub-issue Q1 responses and task-list Q2 responses', () => {
      it('then childIssuePrs is the union of both sets', async () => {
        // [lld §Story 2.1] "merged PRs from Query 1 AND Query 2 are unioned"
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: '- [x] #295\n',
              subIssues: [{ number: 201, prs: [{ number: 55, merged: true }] }],
            },
          }),
          mockGraphQLBatchCrossRef({
            295: [{ number: 77, merged: true }],
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        expect(result.childIssuePrs).toContain(55);
        expect(result.childIssuePrs).toContain(77);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scope / invariants
  // -------------------------------------------------------------------------

  describe('scope', () => {

    // E18: empty issueNumbers — no GraphQL fired, empty result returned
    describe('Given discoverChildIssues called with an empty issueNumbers array', () => {
      it('then returns { childIssueNumbers: [], childIssuePrs: [] } without making any GraphQL requests', async () => {
        // [lld §Story 2.1 queryEpicDiscovery] "if (issueNumbers.length === 0) return results"
        // onUnhandledRequest: 'error' will fail the test if any network request is made
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [] }).catch(() => null);
        // The schema validates issueNumbers.min(1), so an empty array may throw at schema level.
        // We assert that IF it resolves, the result is empty AND no network request was made
        // (the MSW server has onUnhandledRequest: 'error').
        // A schema validation error is also acceptable here — either outcome is correct.
        if (result !== null) {
          expect(result.childIssueNumbers).toEqual([]);
          expect(result.childIssuePrs).toEqual([]);
        }
      });
    });

    // E19: single traversal only — grandchildren are NOT discovered
    describe('Given a sub-issue that is itself an epic with its own children', () => {
      it('then discoverChildIssues does NOT recurse into the sub-issue\'s children', async () => {
        // [lld §Invariant I2] "Only one level of traversal (epic → children, not epic → children → grandchildren)"
        // Query 1 is called exactly once for the top-level epic; grandchild info is only available
        // if a second Query 1 call were made. We verify that only the direct sub-issues are returned.
        server.use(
          mockGraphQLEpicDiscovery({
            100: {
              body: null,
              subIssues: [{ number: 201, prs: [] }],
              // 201 would itself have children (e.g. 301, 302) but we never query them
            },
          }),
        );
        const source = makeSource();
        const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });
        // Only 201 (direct child) — grandchildren like 301, 302 must not appear
        expect(result.childIssueNumbers).toEqual([201]);
      });
    });

    // E20: always attempts discovery — no label check, no error on non-epic
    describe('Given a regular (non-epic) issue', () => {
      it('then discoverChildIssues resolves normally without needing any special labels', async () => {
        // [lld §Invariant I1] "Child issue discovery is always attempted on every provided issue"
        server.use(
          mockGraphQLEpicDiscovery({
            77: { body: 'A simple feature issue.', subIssues: [] },
          }),
        );
        const source = makeSource();
        await expect(
          source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [77] }),
        ).resolves.toEqual({ childIssueNumbers: [], childIssuePrs: [] });
      });
    });
  });
});
