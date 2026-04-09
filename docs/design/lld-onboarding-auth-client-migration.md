# LLD — `createGithubClient` installation-token migration

**Parent epic:** #176
**Task issue:** #192
**HLD:** [github-auth-hld.md](./github-auth-hld.md) §5.4 ("FCS user-initiated — target state")
**Status:** in progress

## 1. Goal

Replace the user OAuth token path in [src/lib/github/client.ts](../../src/lib/github/client.ts) with a GitHub App installation-token path, so every server-to-server GitHub read honours ADR-0020 and HLD §4.3 ("installation_id has three entry points"). After this task, `grep -rn 'get_github_token' src/` returns zero non-test hits.

## 2. New signature

```ts
// src/lib/github/client.ts
export interface CreateGithubClientDeps {
  getToken?: (installationId: number) => Promise<string>;
}

export async function createGithubClient(
  installationId: number,
  deps?: CreateGithubClientDeps,
): Promise<Octokit>;
```

- Default `getToken` is [`getInstallationToken`](../../src/lib/github/app-auth.ts) (cached).
- No Supabase client parameter. Callers resolve `installation_id` at the E3 edge (user-scoped DB read) or read it from a persisted work row.
- Injectable `getToken` for tests — mirrors the dep-injection shape of `getInstallationToken` itself.

The old `(adminSupabase, userId)` signature is deleted atomically; there are only two call sites in `src/` (see §3).

## 3. Call sites

`grep createGithubClient src` — 2 non-test hits, both in [src/app/api/fcs/service.ts](../../src/app/api/fcs/service.ts):

| Site | Current call | New call | Installation ID source |
|---|---|---|---|
| `createFcs` | `createGithubClient(adminSupabase, userId)` | `createGithubClient(repoInfo.installationId)` | From `fetchRepoInfo` (already joins `organisations`). Entry = E3: `createFcs` runs `assertOrgAdmin` before the fetch, so the user is an admin of the org, and RLS would have allowed the read even without service-role. |
| `triggerRubricGeneration` | `createGithubClient(params.adminSupabase, params.userId)` | `createGithubClient(params.repoInfo.installationId)` | Inherits from `repoInfo` passed in by its caller. |

`retriggerRubricForAssessment` does not call `createGithubClient` directly — it calls `fetchRepoInfo` then `triggerRubricGeneration`, so it picks up the new path for free. Full HLD §4.3 hardening for the retry path (denormalise `installation_id` onto the `assessments` row, drop the service-role org lookup) is **out of scope** for this task; it is M1 in the HLD migration plan and belongs to a follow-up issue.

`RubricTriggerParams.userId` becomes unused once the migration lands and is removed.

## 4. `fetchRepoInfo` change

Extend the `organisations` join to select `installation_id`, surface it on the `RepoInfo` struct, and propagate through `toRepoInfo`:

```ts
interface RepoInfo {
  orgName: string;
  repoName: string;
  orgId: OrgId;
  installationId: number;   // NEW
  questionCount: number;
  // ...
}
```

`RepoRow.organisations` becomes `{ github_org_name: string; installation_id: number }`. The `.select('... organisations!inner(github_org_name, installation_id)')` string is the only SQL surface change.

## 5. Test strategy

- New `tests/lib/github/client.test.ts` unit test:
  - **Given** an installation ID and an injected `getToken` stub that resolves to `"tok_abc"`, **when** `createGithubClient` is called, **then** it returns an Octokit whose authorization header is `token tok_abc`.
  - **Given** `getToken` throws, **then** `createGithubClient` rethrows (no silent swallow).
- Update existing mocks in `tests/app/api/fcs.test.ts`, `tests/app/api/fcs-service-logging.test.ts`, `tests/app/api/fcs-rubric-failure.test.ts`, `tests/app/api/assessments/[id].retry-rubric.test.ts` so that:
  - `createGithubClient` mock accepts the new single-arg signature.
  - Any `adminSupabase.rpc('get_github_token', ...)` stub is deleted.
  - Org fixtures used by `fetchRepoInfo` now include `installation_id`.
- No change to `GitHubArtefactSource` — it consumes an `Octokit`, not a factory.

## 6. Acceptance

- `grep -rn "get_github_token" src/` → zero hits.
- `grep -rn "createGithubClient(adminSupabase" src/` → zero hits.
- `createGithubClient` signature: `(installationId: number, deps?) => Promise<Octokit>`.
- All unit and integration tests pass.
- ADR-0020 §"current state" addendum can be removed in a follow-up docs commit.

## 7. Out of scope

- Denormalising `installation_id` onto `assessments` (HLD M1, follow-up issue).
- Removing `get_github_token` SQL function and Vault storage of user tokens (HLD M3).
- Dropping `organisations.installation_id` access from service role (HLD §4.3 deferred hardening).
- Webhook handlers (#180) — they do not currently call `createGithubClient`.
