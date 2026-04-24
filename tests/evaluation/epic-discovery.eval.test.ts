// Adversarial evaluation tests for issue #322 — Epic 2: Epic-Aware Artefact Discovery.
//
// Probes gaps between the LLD / requirements contract and the test-author's 59 tests.
// Failures are FINDINGS — do NOT modify the implementation in this file.
//
// Gap classification:
//   Gap 1 — spec clearly states the field; implementation omits it (implementation gap)
//   Gap 2 — spec gap: LLD notes "batching" but does not specify cross-epic dedup outcome
//   Gap 3 — spec gap: I3 says dedup "by issue number" but only specifies cross-strategy dedup,
//            not intra-subIssues dedup for a malformed API response

import { Octokit } from '@octokit/rest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GitHubArtefactSource,
} from '@/lib/github/artefact-source';
import {
  mockGraphQLEpicDiscovery,
} from '../mocks/github';
import { server } from '../mocks/server';

const OWNER = 'acme';
const REPO = 'platform';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeSource() {
  return new GitHubArtefactSource(new Octokit({ auth: 'mock-token' }));
}

// ---------------------------------------------------------------------------
// Gap 1 — discoveryMechanism absent from the log
//
// Requirements §Story 2.1 Logging AC (v4-requirements.md line 206):
//   "the log entry includes `childIssueCount`, `childIssueNumbers`, and
//   `discoveryMechanism` (one of `sub_issues`, `task_list`, or `both`) fields."
//
// LLD BDD spec §Story 2.1 logging group:
//   it('logs childIssueCount, childIssueNumbers, discoveryMechanism, and childIssuePrCount')
//
// The implementation logs childIssueCount, childIssueNumbers, and childIssuePrCount
// but does NOT include discoveryMechanism. This test will fail until the field is added.
// ---------------------------------------------------------------------------

describe('discoverChildIssues logging — discoveryMechanism field', () => {
  describe('Given children are found via sub-issues only', () => {
    it('then the info log entry contains a discoveryMechanism field', async () => {
      // [req §Story 2.1 Logging AC] discoveryMechanism must appear in the log
      const loggedObjects: unknown[] = [];
      const logger = await import('@/lib/logger');
      const infoSpy = vi.spyOn(logger.logger, 'info').mockImplementation(
        (obj: unknown) => { loggedObjects.push(obj); },
      );

      server.use(
        mockGraphQLEpicDiscovery({
          100: { body: null, subIssues: [{ number: 201, prs: [] }] },
        }),
      );

      const source = makeSource();
      await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });

      const discoveryLog = loggedObjects.find(
        (o) => typeof o === 'object' && o !== null && 'childIssueCount' in o,
      ) as Record<string, unknown> | undefined;

      expect(discoveryLog).toBeDefined();
      expect(discoveryLog).toHaveProperty('discoveryMechanism');
      // Value must be one of the three specified in the requirements
      expect(['sub_issues', 'task_list', 'both']).toContain(discoveryLog?.discoveryMechanism);

      infoSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 2 — multi-epic with overlapping children
//
// The LLD states: "all provided issues batched via dynamic aliases" and
// I3: "union and deduplicated by issue number".  The test-author's E5 only
// verifies that one GraphQL POST is made for two epics; it does not verify
// that a child issue present in BOTH epics appears exactly once in the result.
//
// This is an I3 gap: the spec clearly covers dedup by issue number, and the
// multi-epic path is a natural exerciser of that invariant.
// ---------------------------------------------------------------------------

describe('discoverChildIssues — multi-epic with overlapping children (I3)', () => {
  describe('Given two provided epics that share a common child issue number', () => {
    it('then childIssueNumbers contains the shared child exactly once', async () => {
      // [lld §Invariant I3] "union and deduplicated by issue number"
      // Epic 10 and Epic 20 both have child 201 in their sub-issues.
      server.use(
        mockGraphQLEpicDiscovery({
          10: { body: null, subIssues: [{ number: 201, prs: [] }, { number: 202, prs: [] }] },
          20: { body: null, subIssues: [{ number: 201, prs: [] }, { number: 203, prs: [] }] },
        }),
      );

      const source = makeSource();
      const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [10, 20] });

      const count201 = result.childIssueNumbers.filter((n) => n === 201).length;
      expect(count201).toBe(1);
      // All three distinct children should still be present
      expect(result.childIssueNumbers).toContain(202);
      expect(result.childIssueNumbers).toContain(203);
    });
  });
});

// ---------------------------------------------------------------------------
// Gap 3 — duplicate sub-issue numbers within a single epic's subIssues response
//
// I3 specifies deduplication by issue number for the union of sub-issues + task list,
// but the test-author only tested the cross-strategy overlap (E15). The same sub-issue
// number appearing twice in a single issue's `subIssues.nodes` response (a malformed or
// paginated API response) is a separate intra-strategy duplicate that is not tested.
// The implementation pushes all sub-issue numbers into childNumbers before calling
// new Set() — so it should handle this correctly — but no existing test verifies it.
// ---------------------------------------------------------------------------

describe('discoverChildIssues — intra-epic duplicate sub-issue numbers (I3)', () => {
  describe('Given a single epic whose subIssues.nodes contains the same child number twice', () => {
    it('then childIssueNumbers contains that child number exactly once', async () => {
      // [lld §Invariant I3] deduplication is by issue number; covers the intra-strategy case
      server.use(
        mockGraphQLEpicDiscovery({
          100: {
            body: null,
            subIssues: [
              { number: 201, prs: [{ number: 55, merged: true }] },
              { number: 201, prs: [{ number: 56, merged: true }] }, // duplicate sub-issue
            ],
          },
        }),
      );

      const source = makeSource();
      const result = await source.discoverChildIssues({ owner: OWNER, repo: REPO, issueNumbers: [100] });

      const count201 = result.childIssueNumbers.filter((n) => n === 201).length;
      expect(count201).toBe(1);
    });
  });
});
