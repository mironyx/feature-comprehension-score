import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GitHubArtefactSource } from '@/lib/github/artefact-source';
import { mockGraphQLCrossRefs, mockGraphQLError } from '../../mocks/github';
import { server } from '../../mocks/server';

const OWNER = 'acme';
const REPO = 'payments';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeSource() {
  return new GitHubArtefactSource(new Octokit({ auth: 'mock-token' }));
}

// ---------------------------------------------------------------------------
// GitHubArtefactSource.discoverLinkedPRs
// ---------------------------------------------------------------------------

describe('GitHubArtefactSource.discoverLinkedPRs', () => {
  // -------------------------------------------------------------------------
  // Property 1: merged cross-referenced PRs are returned
  // [req §Story 19.2] [LLD §19.2]
  // -------------------------------------------------------------------------
  describe('Given an issue with merged PRs that cross-reference it', () => {
    it('then returns the merged PR numbers', async () => {
      // [req §Story 19.2] "PRs that close or reference those issues are discovered via the GitHub API"
      server.use(mockGraphQLCrossRefs({ 10: [{ number: 55, merged: true }] }));

      const source = makeSource();
      const result = await source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [10] });

      expect(result).toContain(55);
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: non-merged cross-referenced PRs are excluded
  // [req §Story 19.2] [LLD §19.2 invariant I4]
  // -------------------------------------------------------------------------
  describe('Given an issue with a cross-referenced PR that is not merged', () => {
    it('then the non-merged PR is excluded from the result', async () => {
      // [req §Story 19.2] "Given a discovered PR is not merged, then it is excluded"
      server.use(mockGraphQLCrossRefs({ 10: [{ number: 77, merged: false }] }));

      const source = makeSource();
      const result = await source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [10] });

      expect(result).not.toContain(77);
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: non-merged PR alongside a merged PR — only merged is returned
  // [req §Story 19.2] [LLD §19.2 edge cases]
  // -------------------------------------------------------------------------
  describe('Given an issue with both merged and non-merged cross-referenced PRs', () => {
    it('then only the merged PR numbers are returned', async () => {
      // [req §Story 19.2] mixed list — merged filter is applied independently
      server.use(
        mockGraphQLCrossRefs({
          20: [
            { number: 101, merged: true },
            { number: 102, merged: false },
          ],
        }),
      );

      const source = makeSource();
      const result = await source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [20] });

      expect(result).toContain(101);
      expect(result).not.toContain(102);
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: issue with no cross-references returns empty array, no error
  // [req §Story 19.2] "Given an issue with no linked or closing PRs … no error is raised"
  // [LLD §19.2 edge cases]
  // -------------------------------------------------------------------------
  describe('Given an issue with no cross-reference events', () => {
    it('then returns an empty array without throwing', async () => {
      // [req §Story 19.2] empty timeline → empty result, no error
      server.use(mockGraphQLCrossRefs({ 30: [] }));

      const source = makeSource();
      const result = await source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [30] });

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: multiple issues — PR numbers from all issues are aggregated
  // [req §Story 19.2] "handles multiple issues, aggregates all linked PRs"
  // [LLD §19.2] Promise.all per-issue, results merged
  // -------------------------------------------------------------------------
  describe('Given multiple issues each with merged cross-referenced PRs', () => {
    it('then aggregates merged PR numbers from all issues into one list', async () => {
      // [req §Story 19.2] multi-issue aggregation
      server.use(
        mockGraphQLCrossRefs({
          40: [{ number: 200, merged: true }],
          41: [{ number: 201, merged: true }],
        }),
      );

      const source = makeSource();
      const result = await source.discoverLinkedPRs({
        owner: OWNER,
        repo: REPO,
        issueNumbers: [40, 41],
      });

      expect(result).toContain(200);
      expect(result).toContain(201);
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: overlapping cross-references across issues are deduplicated
  // [req §Story 19.2] "Given a discovered PR is already present … included once"
  // [LLD §19.2 invariant I3] "overlapping sets → no duplicates"
  // -------------------------------------------------------------------------
  describe('Given multiple issues that both cross-reference the same merged PR', () => {
    it('then the PR number appears exactly once in the result', async () => {
      // [req §Story 19.2] deduplication
      server.use(
        mockGraphQLCrossRefs({
          50: [{ number: 300, merged: true }],
          51: [{ number: 300, merged: true }],
        }),
      );

      const source = makeSource();
      const result = await source.discoverLinkedPRs({
        owner: OWNER,
        repo: REPO,
        issueNumbers: [50, 51],
      });

      const occurrences = result.filter((n) => n === 300).length;
      expect(occurrences).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: return type is number[] (all elements are numbers)
  // [LLD §19.2] port signature: Promise<number[]>
  // -------------------------------------------------------------------------
  describe('Given a normal response with merged PRs', () => {
    it('then every element in the result is a positive integer', async () => {
      // [LLD §19.2] return type contract: number[]
      server.use(
        mockGraphQLCrossRefs({
          60: [
            { number: 400, merged: true },
            { number: 401, merged: true },
          ],
        }),
      );

      const source = makeSource();
      const result = await source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [60] });

      expect(result.length).toBeGreaterThan(0);
      result.forEach((n) => {
        expect(typeof n).toBe('number');
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThan(0);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: GraphQL error propagates (no silent swallow)
  // [LLD §19.2] no silent catch noted; error boundary is caller's responsibility
  // -------------------------------------------------------------------------
  describe('Given the GraphQL endpoint returns an error payload', () => {
    it('then discoverLinkedPRs rejects with an error', async () => {
      // [LLD §19.2] errors must propagate — silent swallow is prohibited
      server.use(mockGraphQLError('Something went wrong'));

      const source = makeSource();

      await expect(
        source.discoverLinkedPRs({ owner: OWNER, repo: REPO, issueNumbers: [70] }),
      ).rejects.toThrow();
    });
  });
});
