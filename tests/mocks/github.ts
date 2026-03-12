import { http, HttpResponse } from 'msw';

const GITHUB_API = 'https://api.github.com';

/** Factory: mock a single pull request */
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
