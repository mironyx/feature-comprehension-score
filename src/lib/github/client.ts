// GitHub client factory — builds an Octokit authenticated with a GitHub App installation token.
// Design reference: docs/design/lld-onboarding-auth-client-migration.md (issue #192),
// docs/design/github-auth-hld.md §5.4 (FCS user-initiated, target state).

import { Octokit } from '@octokit/rest';
import { getInstallationToken } from './app-auth';

export interface CreateGithubClientDeps {
  getToken?: (installationId: number) => Promise<string>;
}

/** Build an Octokit authenticated with an installation access token for the given installation. */
export async function createGithubClient(
  installationId: number,
  deps: CreateGithubClientDeps = {},
): Promise<Octokit> {
  const getToken = deps.getToken ?? getInstallationToken;
  const token = await getToken(installationId);
  return new Octokit({ auth: token });
}
