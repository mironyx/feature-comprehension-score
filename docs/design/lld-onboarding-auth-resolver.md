# LLD — Onboarding & Auth: `resolveUserOrgsViaApp` Service

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 2
**Related:** ADR-0020 §Decision point 3, ADR-0001, [lld-onboarding-auth-app-permission.md](lld-onboarding-auth-app-permission.md) (prerequisite)
**Status:** Draft
**Date:** 2026-04-07

## 1. Purpose

Introduce a new service that replaces `syncOrgMembership` (in [src/lib/supabase/org-sync.ts](../../src/lib/supabase/org-sync.ts)). It resolves the signed-in user's org memberships by iterating over installed organisations in the `organisations` table and calling `GET /orgs/{org}/memberships/{username}` **using the GitHub App installation token** for each org — not the user's OAuth provider token.

This task delivers **only the service + its unit tests**. Wiring into the auth callback and deleting the old path happens in Task 3.

## 2. HLD coverage

Covered by ADR-0020 §Decision→Org membership and the "Implementation Outline" step 2. No further HLD work.

## 3. Prerequisites

- **Task 1 complete** — the App must have `members:read` and existing installs must have re-consented. Without this, every `GET /memberships` call returns 403 and unit tests against a real install will fail. Unit tests use mocked `fetch`, so this prerequisite only blocks manual verification, not the code.

## 4. Layers

### 4.1 DB

Read-only to `organisations` (existing table). Writes to `user_organisations` (existing table). No schema change in this task.

Relevant columns on `organisations`:

- `id` (uuid PK)
- `github_org_id` (bigint)
- `github_org_name` (text)
- `installation_id` (bigint) — populated by `handleInstallationCreated`; required for minting the per-install token
- `status` (text)

Relevant columns on `user_organisations`:

- `user_id`, `org_id`, `github_user_id`, `github_username`, `github_role`

### 4.2 Backend — new files

| File | Purpose |
|---|---|
| `src/lib/github/app-auth.ts` | Mint App JWT and exchange it for an installation access token. New helper. |
| `src/lib/supabase/org-membership.ts` | `resolveUserOrgsViaApp` — the service this task delivers. |
| `src/lib/github/app-auth.test.ts` | Unit tests for JWT generation and token caching. |
| `src/lib/supabase/org-membership.test.ts` | Unit tests for the resolver. |

Rationale for the split: the JWT/installation-token helper is generically useful and belongs under `src/lib/github/`; the resolver is a Supabase + domain concern and belongs under `src/lib/supabase/`. The resolver depends on the helper via an injected `getInstallationToken` function so tests can substitute a stub without touching `fetch`.

### 4.3 Backend — deletions

**None in this task.** `src/lib/supabase/org-sync.ts` stays in place until Task 3 swaps the callback over and deletes it atomically.

### 4.4 Frontend

No frontend changes.

## 5. Interfaces

### 5.1 `src/lib/github/app-auth.ts`

```ts
/** Mint a short-lived App JWT signed with GITHUB_APP_PRIVATE_KEY (RS256).
 *  iat = now - 60, exp = now + 540, iss = GITHUB_APP_ID.
 *  Throws if either env var is missing. */
export function createAppJwt(now?: () => number): string;

/** Exchange an App JWT for an installation access token.
 *  POST https://api.github.com/app/installations/{installationId}/access_tokens
 *  Throws on non-2xx. Returns { token, expiresAt } where expiresAt is an ISO string. */
export async function createInstallationToken(
  installationId: number,
  appJwt?: string,
): Promise<{ token: string; expiresAt: string }>;

/** Cached variant: reuses a previously minted token until ~5 minutes before expiry.
 *  Cache key is installationId. In-memory only. */
export async function getInstallationToken(installationId: number): Promise<string>;
```

**Env vars** (both required):

- `GITHUB_APP_ID` — numeric App ID
- `GITHUB_APP_PRIVATE_KEY` — PEM string (PKCS#1 or PKCS#8). Newlines may arrive as literal `\n`; the helper replaces `\\n` with `\n` before signing.

Implementation uses the `jose` package (already a transitive dep via `@supabase/ssr`) or adds `jsonwebtoken`. **Decision:** use `jose` — it is already available and has a smaller footprint than `jsonwebtoken`. Verify presence at implementation time; add only if missing.

### 5.2 `src/lib/supabase/org-membership.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type ServiceClient = SupabaseClient<Database>;
type UserOrganisation = Database['public']['Tables']['user_organisations']['Row'];

export interface ResolveUserOrgsInput {
  userId: string;              // Supabase auth user id
  githubUserId: number;        // from auth.users.user_metadata.provider_id
  githubLogin: string;         // from auth.users.user_metadata.user_name
}

export interface ResolveUserOrgsDeps {
  /** Injected so tests can stub without touching network. Defaults to the cached
   *  getInstallationToken from src/lib/github/app-auth.ts. */
  getInstallationToken?: (installationId: number) => Promise<string>;
  /** Injected fetch for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Resolve and persist the signed-in user's org memberships via the App installation token.
 *
 *  Steps:
 *  1. Load all `organisations` rows where status='active'.
 *  2. For each org, mint (or reuse) an installation token and call
 *     GET /orgs/{github_org_name}/memberships/{githubLogin}.
 *     - 200 → member; extract role from response body.
 *     - 404 → not a member (explicit non-match; do NOT error).
 *     - Personal-account install (github_org_id === githubUserId) → skip the API
 *       call and treat the installer as admin.
 *     - Any other status → throw (transient/config error).
 *  3. Upsert matched rows into `user_organisations` (onConflict user_id,org_id).
 *  4. Delete stale rows in `user_organisations` for this user whose org_id is
 *     not in the matched set.
 *  5. Return the up-to-date row set.
 *
 *  All errors are thrown — this service is NOT no-throw. The caller (Task 3)
 *  decides how to surface failures (telemetry + redirect in Task 3 & 6). */
export async function resolveUserOrgsViaApp(
  serviceClient: ServiceClient,
  input: ResolveUserOrgsInput,
  deps?: ResolveUserOrgsDeps,
): Promise<UserOrganisation[]>;
```

### 5.3 Error handling contract

- **404 on `/memberships`** → non-member. Not an error. Omit the org from the matched set.
- **403** → App lacks `members:read` or install has not re-consented. Throw — this is a configuration bug and must be surfaced loudly, not silently converted to "not a member".
- **5xx or network error** → throw. The caller in Task 3 maps thrown errors to `signin.error` telemetry (Task 6) and `/auth/sign-in?error=auth_failed`.
- **DB errors** → throw. Same treatment.

This is a deliberate departure from `syncOrgMembership`, which swallowed errors and preserved stale rows. Preserving stale rows is no longer the correct default once the app installation is the source of truth — a 403 means the install is broken, not that the previous membership is still valid.

## 6. Internal decomposition

Not an API route — no controller/service split required. The single exported function is the service. The two internal concerns that could be extracted if length demands it:

- **`matchOrgsForUser(serviceClient, input, deps)`** — steps 1–2, returns `{ org, role }[]`.
- **`writeUserOrgs(serviceClient, userId, matches)`** — steps 3–4, upserts + deletes.

Pre-allocating these keeps the top-level function under the 20-line budget.

## 7. BDD specs

```ts
describe('resolveUserOrgsViaApp', () => {
  it('returns matching orgs when the user is a member of one installed org');
  it('returns an empty array when the user is not a member of any installed org');
  it('assigns installer as admin of a personal-account install without calling the API');
  it('handles multi-org installs — returns only the orgs the user is a member of');
  it('distinguishes 404 (not member, silent) from 500 (throws)');
  it('throws on 403 (missing members:read or not re-consented)');
  it('upserts new memberships and deletes stale rows for the user');
  it('leaves memberships for other users untouched');
});

describe('createAppJwt', () => {
  it('signs with RS256 and sets iss to GITHUB_APP_ID');
  it('throws if GITHUB_APP_PRIVATE_KEY is missing');
  it('handles \\n-escaped private keys');
});

describe('getInstallationToken', () => {
  it('mints a token on first call');
  it('reuses a cached token on the second call within TTL');
  it('mints a fresh token after the cache TTL expires');
});
```

## 8. Acceptance criteria

- [ ] `src/lib/github/app-auth.ts` exports `createAppJwt`, `createInstallationToken`, `getInstallationToken`.
- [ ] `src/lib/supabase/org-membership.ts` exports `resolveUserOrgsViaApp` with the signature in §5.2.
- [ ] Unit tests cover every BDD spec in §7 and all pass.
- [ ] Zero use of `provider_token` anywhere in the new code.
- [ ] Zero use of `/user/orgs` anywhere in the new code.
- [ ] Personal-account install path does not call `fetch` (asserted via mock).
- [ ] 403 throws; 404 does not throw.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx vitest run src/lib/github/app-auth.test.ts src/lib/supabase/org-membership.test.ts` passes.

## 9. Non-goals for this task

- Wiring into the auth callback — Task 3.
- Deleting `org-sync.ts` — Task 3.
- Dropping `user_github_tokens` table — Task 3.
- Telemetry — Task 6.
- First-install-race mitigation — Task 3 (deliberately in cutover task, not here).

## 10. Task

**Task 2 — Implement `resolveUserOrgsViaApp` service**

Depends on Task 1. Estimated ~180 lines across the four new files listed in §4.2.
