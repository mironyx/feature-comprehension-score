import { http, HttpResponse } from 'msw';

const GITHUB_API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Pull request — handles both metadata (JSON) and diff (text/diff) requests
// ---------------------------------------------------------------------------

export interface MockPRMetadata {
  body?: string | null;
  sha?: string;
  title?: string;
  merged_at?: string | null;
}

/** Factory: mock a single pull request (metadata only — for legacy tests) */
export function mockPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  overrides: Record<string, unknown> = {},
) {
  return http.get(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`, () =>
    HttpResponse.json({
      number: prNumber,
      title: `PR #${prNumber}`,
      state: 'open',
      merged: false,
      user: { login: 'test-author' },
      base: { ref: 'main' },
      head: { ref: `feat/test-${prNumber}` },
      ...overrides,
    }),
  );
}

/** Factory: mock a PR with both metadata (JSON) and diff (text) response */
export function mockPullRequestFull(
  owner: string,
  repo: string,
  prNumber: number,
  metadata: MockPRMetadata = {},
  diff = `diff --git a/src/pay.ts b/src/pay.ts\n--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -1 +1 @@\n-old\n+new`,
) {
  return http.get(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
    ({ request }) => {
      const accept = request.headers.get('accept') ?? '';
      if (accept.includes('application/vnd.github.diff')) {
        return HttpResponse.text(diff);
      }
      return HttpResponse.json({
        number: prNumber,
        title: metadata.title ?? `PR #${prNumber}`,
        body: metadata.body ?? null,
        head: { sha: metadata.sha ?? 'abc123def456', ref: `feat/test-${prNumber}` },
        base: { ref: 'main' },
        merged_at: metadata.merged_at ?? null,
        state: 'open',
        user: { login: 'test-author' },
      });
    },
  );
}

// ---------------------------------------------------------------------------
// PR file listing
// ---------------------------------------------------------------------------

export interface MockFileEntry {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
}

/** Factory: mock the PR files listing endpoint */
export function mockPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number,
  files: MockFileEntry[] = [],
) {
  return http.get(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files`,
    () => HttpResponse.json(files),
  );
}

// ---------------------------------------------------------------------------
// Repository file contents
// ---------------------------------------------------------------------------

/** Factory: mock a single file's contents endpoint (returns base64-encoded content) */
export function mockRepoContents(
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha = 'abc123',
) {
  const encoded = Buffer.from(content).toString('base64');
  return http.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, () =>
    HttpResponse.json({
      type: 'file',
      name: path.split('/').pop(),
      path,
      sha,
      size: content.length,
      encoding: 'base64',
      content: encoded + '\n',
    }),
  );
}

// ---------------------------------------------------------------------------
// Issues (linked issue fetching)
// ---------------------------------------------------------------------------

/** Factory: mock a single issue */
export function mockIssue(
  owner: string,
  repo: string,
  issueNumber: number,
  title = `Issue #${issueNumber}`,
  body = 'Issue body.',
) {
  return http.get(`${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`, () =>
    HttpResponse.json({ number: issueNumber, title, body }),
  );
}

/** Factory: mock an issue that returns 404 (not found) */
export function mockIssueNotFound(owner: string, repo: string, issueNumber: number) {
  return http.get(`${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`, () =>
    HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
  );
}

/** Factory: mock the issue comments list endpoint */
export function mockIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  comments: string[] = [],
) {
  return http.get(`${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`, () =>
    HttpResponse.json(comments.map((body, i) => ({ id: i + 1, body }))),
  );
}

// ---------------------------------------------------------------------------
// GraphQL — cross-reference timeline items (Story 19.2, discoverLinkedPRs)
// ---------------------------------------------------------------------------

/** Cross-reference entry: a PR that references or closes the issue. */
export interface MockCrossRefPR {
  number: number;
  merged: boolean;
}

/**
 * Factory: mock the GitHub GraphQL endpoint for `discoverLinkedPRs`.
 * Routes cross-reference responses by `issueNumber` variable. Any issue not
 * present in `byIssue` resolves to an empty timeline. Non-cross-reference
 * events in the timeline (releases, labels, etc.) return empty `source` objects.
 */
export function mockGraphQLCrossRefs(
  byIssue: Record<number, MockCrossRefPR[]>,
) {
  return http.post('https://api.github.com/graphql', async ({ request }) => {
    const payload = (await request.json()) as { variables?: { issueNumber?: number } };
    const issueNumber = payload.variables?.issueNumber ?? -1;
    const prs = byIssue[issueNumber] ?? [];
    const nodes = prs.map((pr) => ({ source: { number: pr.number, merged: pr.merged } }));
    return HttpResponse.json({
      data: { repository: { issue: { timelineItems: { nodes } } } },
    });
  });
}

/** Factory: mock the GraphQL endpoint to return a GraphQL error payload. */
export function mockGraphQLError(message = 'GraphQL error') {
  return http.post('https://api.github.com/graphql', () =>
    HttpResponse.json({ errors: [{ message }] }, { status: 200 }),
  );
}

// ---------------------------------------------------------------------------
// Epic-aware discovery — Query 1 (buildEpicDiscoveryQuery) and Query 2 (buildBatchCrossRefQuery)
// Epic 2 — Stories 2.1 + 2.2, issue #322
// ---------------------------------------------------------------------------

/** A sub-issue entry within Query 1's response: its number and the PRs that reference it. */
export interface MockSubIssue {
  number: number;
  prs: MockCrossRefPR[];
}

/**
 * Mock entry for a single issue returned by Query 1 (epic discovery).
 * `body` is the issue body used for task list parsing.
 * `subIssues` are the native GitHub sub-issues with their linked PRs.
 */
export interface MockEpicIssue {
  body: string | null;
  subIssues: MockSubIssue[];
}

/**
 * Factory: mock Query 1 — the batched epic discovery query.
 *
 * Matches any POST to the GraphQL endpoint whose body contains `subIssues`.
 * Responds with one `issueN` alias per entry in `byIssue`.
 *
 * @param byIssue  Map from issue number → { body, subIssues[] }.
 */
export function mockGraphQLEpicDiscovery(byIssue: Record<number, MockEpicIssue>) {
  return http.post('https://api.github.com/graphql', async ({ request }) => {
    // Clone before reading — when this handler returns undefined and MSW falls
    // through to the next registered handler, the next handler also reads the
    // body. Without a clone, the second read throws "Body has already been read".
    const payload = (await request.clone().json()) as { query?: string };
    // Only intercept Query 1 — it contains the `subIssues` field name.
    if (!payload.query?.includes('subIssues')) return undefined;

    const repositoryData: Record<string, unknown> = {};
    for (const [issueNumStr, issue] of Object.entries(byIssue)) {
      const n = Number(issueNumStr);
      repositoryData[`issue${n}`] = {
        body: issue.body,
        subIssues: {
          nodes: issue.subIssues.map((sub) => ({
            number: sub.number,
            timelineItems: {
              nodes: sub.prs.map((pr) => ({
                source: { number: pr.number, merged: pr.merged },
              })),
            },
          })),
        },
      };
    }
    return HttpResponse.json({ data: { repository: repositoryData } });
  });
}

/**
 * Factory: mock Query 2 — the batch cross-ref query for task-list-only children.
 *
 * Matches any POST to the GraphQL endpoint whose body does NOT contain `subIssues`
 * (i.e. it is the cross-ref-only query). Responds with one `issueN` alias per entry.
 *
 * @param byIssue  Map from issue number → PRs that cross-reference it.
 */
export function mockGraphQLBatchCrossRef(byIssue: Record<number, MockCrossRefPR[]>) {
  return http.post('https://api.github.com/graphql', async ({ request }) => {
    // See comment in mockGraphQLEpicDiscovery — clone the request before reading
    // the body so a previous handler that also called json() doesn't poison this one.
    const payload = (await request.clone().json()) as { query?: string };
    // Only intercept Query 2 — it does NOT include `subIssues`.
    if (payload.query?.includes('subIssues')) return undefined;

    const repositoryData: Record<string, unknown> = {};
    for (const [issueNumStr, prs] of Object.entries(byIssue)) {
      const n = Number(issueNumStr);
      repositoryData[`issue${n}`] = {
        timelineItems: {
          nodes: prs.map((pr) => ({
            source: { number: pr.number, merged: pr.merged },
          })),
        },
      };
    }
    return HttpResponse.json({ data: { repository: repositoryData } });
  });
}

// ---------------------------------------------------------------------------
// Git trees (for context file pattern resolution)
// ---------------------------------------------------------------------------

export interface MockTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

/** Factory: mock the git trees endpoint (recursive) */
export function mockGitTree(
  owner: string,
  repo: string,
  treeSha: string,
  entries: MockTreeEntry[] = [],
) {
  return http.get(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}`,
    () => HttpResponse.json({ sha: treeSha, tree: entries, truncated: false }),
  );
}

// ---------------------------------------------------------------------------
// Legacy helpers (unchanged)
// ---------------------------------------------------------------------------

/** Factory: mock check runs for a ref */
export function mockCheckRuns(
  owner: string,
  repo: string,
  ref: string,
  overrides: Record<string, unknown> = {},
) {
  return http.get(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${ref}/check-runs`,
    () =>
      HttpResponse.json({
        total_count: 1,
        check_runs: [
          {
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
          },
        ],
        ...overrides,
      }),
  );
}

/** Factory: mock organisation membership */
export function mockOrgMembership(org: string, username: string, role = 'member') {
  return http.get(`${GITHUB_API}/orgs/${org}/members/${username}`, () =>
    HttpResponse.json({
      login: username,
      role,
    }),
  );
}

// ---------------------------------------------------------------------------
// Org membership sync (issue #54)
// ---------------------------------------------------------------------------

export interface MockGitHubUser {
  id: number;
  login: string;
}

/** Factory: mock GET /user (authenticated user info) */
export function mockGitHubUser(user: MockGitHubUser) {
  return http.get(`${GITHUB_API}/user`, () => HttpResponse.json(user));
}

export interface MockGitHubOrgEntry {
  id: number;
  login: string;
}

/** Factory: mock GET /user/orgs (list of orgs the user belongs to) */
export function mockUserOrgs(orgs: MockGitHubOrgEntry[]) {
  return http.get(`${GITHUB_API}/user/orgs`, () => HttpResponse.json(orgs));
}

/** Factory: mock GET /orgs/{org}/memberships/{username} */
export function mockOrgMembershipRole(
  org: string,
  username: string,
  role: 'admin' | 'member',
) {
  return http.get(`${GITHUB_API}/orgs/${org}/memberships/${username}`, () =>
    HttpResponse.json({ role, state: 'active' }),
  );
}
