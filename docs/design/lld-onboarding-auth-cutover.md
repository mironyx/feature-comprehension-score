# LLD — Onboarding & Auth: Sign-in Cutover

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 3
**Related:** ADR-0020 §Decision points 3 & 4, [lld-onboarding-auth-resolver.md](lld-onboarding-auth-resolver.md) (prerequisite)
**Status:** Draft
**Date:** 2026-04-07

## 1. Purpose

Atomic cutover from OAuth-provider-token org membership to installation-token org membership. Wires `resolveUserOrgsViaApp` into `/auth/callback`, deletes `org-sync.ts`, drops the `user_github_tokens` table and associated RPCs + Vault key, drops `read:org`/`repo` OAuth scopes, and implements the first-install-race mitigation.

**No feature flag, no dual-write.** Nothing in this epic has shipped to production yet, so cutover is a single PR. The PR is expected to slightly exceed the 200-line budget (~220); the plan and this LLD explicitly accept the overrun because there is no clean seam once dual-write is off the table.

## 2. HLD coverage

Covered by ADR-0020 §Decision points 3 & 4 and its "Implementation Outline" step 3. Open Question on the first-install-race is answered in §6 below.

## 3. Layers

### 3.1 DB

Schema-file changes in `supabase/schemas/`:

- **`tables.sql`** — drop `CREATE TABLE user_github_tokens` (lines ~101–112).
- **`functions.sql`** — drop `store_github_token` and `get_github_token` RPCs (search for `store_github_token`, `get_github_token`). Also drop any Vault helper that only exists to support these two RPCs.
- **`policies.sql`** — drop any policies on `user_github_tokens`.

Generated migration: `supabase/migrations/<timestamp>_drop_user_github_tokens.sql` via `npx supabase db diff -f drop_user_github_tokens`. Header comment references this task's issue number and ADR-0020.

Post-generation verification:

1. `npx supabase db reset` — applies cleanly.
2. `npx supabase db diff` — **must** print "No schema changes found".

**Vault key:** the Vault secret rows (one per user) are cascaded away automatically when the table is dropped (`ON DELETE CASCADE` from `auth.users`). The Vault *key* (if a dedicated key exists for this table — confirm with `SELECT * FROM vault.decrypted_secrets LIMIT 1` in the migration review) is dropped in the same migration.

### 3.2 Backend

**Delete:**

- `src/lib/supabase/org-sync.ts`
- Any test file for `org-sync` — grep `org-sync` under `tests/` and `src/`.

**Modify:**

- `src/app/auth/callback/route.ts` — see §4.
- `src/lib/github/client.ts` — this file currently calls `get_github_token`. Since the RPC is being dropped, this file must either be deleted (if unused) or refactored to use the installation token. **Investigation required at implementation time**: grep every caller of `createGithubClient`. If the only callers are assessment flows (which per ADR-0001 should use the installation token), refactor them to use `getInstallationToken` from the Task 2 helper. **If a caller genuinely needs the user's OAuth token for something other than org lookup**, the cutover is blocked — flag it and escalate. ADR-0020 §"What the user OAuth provider token is actually used for today" claims there are no such callers; this must be verified.

### 3.3 Frontend

- `src/app/auth/sign-in/SignInButton.tsx` — change `scopes: 'user:email read:user read:org repo'` to `scopes: 'read:user'`. `user:email` is kept only if Supabase requires it for identity; verify by removing and running the sign-in flow in a test env. If it must stay, keep it.

## 4. `/auth/callback` rewrite

Current file: [src/app/auth/callback/route.ts](../../src/app/auth/callback/route.ts) (~46 lines). New file stays ~40 lines.

### 4.1 New flow

```ts
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return redirectSignIn(origin, 'missing_code');

  const response = NextResponse.redirect(`${origin}/assessments`);
  const supabase = createRouteHandlerSupabaseClient(request, response);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return redirectSignIn(origin, 'auth_failed');

  const { user } = data.session;
  const githubUserId = Number(user.user_metadata['provider_id']);
  const githubLogin = String(user.user_metadata['user_name']);

  try {
    const secretClient = createSecretSupabaseClient();
    const matched = await resolveUserOrgsViaApp(secretClient, {
      userId: user.id,
      githubUserId,
      githubLogin,
    });
    emitSigninEvent(matched.length > 0 ? 'success' : 'no_access', {
      userId: user.id,
      githubUserId,
      matchedOrgCount: matched.length,
    });
    return response;
  } catch (err) {
    logger.error({ err, userId: user.id }, 'resolveUserOrgsViaApp failed');
    emitSigninEvent('error', { userId: user.id, githubUserId, matchedOrgCount: 0 });
    return redirectSignIn(origin, 'auth_failed');
  }
}
```

Constraints:

- Route handler body ≤ 25 lines — the snippet above is exactly at the budget. If it grows during implementation, extract `resolveAndRedirect(supabase, origin, user)`.
- `emitSigninEvent` is a stub in this task — the real implementation lands in **Task 6**. This LLD specifies the call site so Task 6 is a drop-in.
- `redirectSignIn` is a one-line helper to reduce repetition.

### 4.2 What is removed

- The `provider_token` branch (lines 24–43 of the current file) in its entirety.
- The call to `store_github_token` RPC.
- The call to `syncOrgMembership`.
- The `else` branch logging "No provider_token in session".

### 4.3 Identity source

`githubUserId` and `githubLogin` come from `user.user_metadata`. Supabase populates `provider_id` (string containing the numeric GitHub user id) and `user_name` (the login) from the `read:user` scope. No API call needed.

**Edge case:** if either field is missing or malformed, redirect to `/auth/sign-in?error=auth_failed` and emit `signin.error`. Do not throw into the Next.js error boundary.

## 5. OAuth scope change

`src/app/auth/sign-in/SignInButton.tsx`:

```ts
scopes: 'read:user',
```

**Acceptance check:** after the change, a fresh sign-in should see GitHub's consent screen asking only for "Read ... public profile information" — no organisation access, no repository access. This is a manual check against a real GitHub test account, not automatable in this repo.

**Existing sessions** remain valid — Supabase does not re-run OAuth until the session expires. That is acceptable; no orphan state.

## 6. First-install-and-sign-in race mitigation

**Scenario:** admin installs the App, GitHub sends `installation.created`, then the admin clicks "Sign in" before the webhook is processed. `organisations` has no row yet; resolver returns `[]`; admin lands on the non-member empty state despite being the legitimate installer.

**Mitigation (per ADR-0020 Open Questions):** on install webhook, store the `sender.id` (the installer's GitHub user id) on the `organisations` row. On sign-in, if `resolveUserOrgsViaApp` returns `[]`, look up any `organisations` row where `installer_github_user_id = githubUserId` **created in the last 5 minutes** and has no `user_organisations` rows yet; if found, insert the installer as `admin` of that org.

**Schema impact:**

- Add column `organisations.installer_github_user_id bigint NULL` (nullable — historical rows have no installer recorded).
- Included in the same migration as the `user_github_tokens` drop.

**Webhook handler update (in Task 5's scope, coordination note here):** `handleInstallationCreated` stores `sender.id` into the new column. Since Task 5 is parallelisable, this LLD specifies the column and Task 3 adds it to the schema; Task 5's LLD must pick up the write. If Task 5 lands first, it cannot write to the column until this task's migration is in. Order requirement: **this task's migration merges before Task 5**.

**Race-window mitigation code** lives in the resolver (Task 2) — but Task 2 predates the column's existence. Options:

- **Option A (chosen):** resolver accepts an optional `opts.firstInstallFallback: boolean` (default false). Task 3 flips it to `true` at the call site and adds a narrow helper `findFirstInstallAsInstaller(serviceClient, githubUserId)` colocated in the resolver file. The helper is added as a minor extension in Task 3, not back-ported to Task 2.
- **Option B (rejected):** put the fallback in the callback. Rejected because it couples the callback to schema details.

Tests added in Task 3 (integration-ish) cover: (a) installer signs in 1s after install → lands on `/assessments`, (b) stranger signs in with the same scenario → lands on `/org-select` empty state.

## 7. BDD specs

```ts
describe('/auth/callback', () => {
  it('redirects to /assessments on successful sign-in with matching orgs');
  it('redirects to /org-select when the user is not a member of any installed org (empty state handled by the page)');
  it('redirects to /auth/sign-in?error=missing_code when no code is present');
  it('redirects to /auth/sign-in?error=auth_failed when exchangeCodeForSession fails');
  it('redirects to /auth/sign-in?error=auth_failed when resolveUserOrgsViaApp throws');
  it('does not read session.provider_token');
  it('does not call syncOrgMembership or /user/orgs (both removed)');
});

describe('SignInButton', () => {
  it('requests only the read:user scope');
});

describe('first-install race', () => {
  it('treats the installer as admin when signing in within 5 minutes of installation.created');
  it('does not treat an arbitrary user as admin in the same window');
});
```

## 8. Acceptance criteria

- [ ] Zero references to `provider_token` under `src/` (`grep -rn "provider_token" src/` returns nothing).
- [ ] Zero references to `user_github_tokens` under `src/` and `supabase/` except the drop migration itself.
- [ ] Zero references to `/user/orgs` under `src/`.
- [ ] `org-sync.ts` is deleted.
- [ ] OAuth scope string is exactly `'read:user'`.
- [ ] Migration applies cleanly: `npx supabase db reset` succeeds.
- [ ] `npx supabase db diff` after reset prints "No schema changes found".
- [ ] `organisations.installer_github_user_id` column exists and is `bigint NULL`.
- [ ] First-install-race BDD specs pass.
- [ ] `npx vitest run` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] E2E happy path (placeholder env acceptable): install → sign in → `/assessments`. If E2E cannot run without a real GitHub App, document the manual verification steps in the PR body.

## 9. Risks

- **`createGithubClient` caller audit** (§3.2) may surface a real dependency on the OAuth token that ADR-0020 did not know about. If so, flag and escalate — do not silently keep the table alive.
- **Migration ordering** with Task 5 — enforced by merge order, not by code.
- **Size overrun** — ~220 lines is expected. PR description must call this out and reference the plan's explicit acceptance of the overrun.

## 10. Task

**Task 3 — Sign-in cutover**

Depends on Task 2. Files touched: `src/app/auth/callback/route.ts`, `src/lib/supabase/org-sync.ts` (delete), `src/lib/supabase/org-membership.ts` (extend with first-install fallback), `src/app/auth/sign-in/SignInButton.tsx`, `supabase/schemas/tables.sql`, `supabase/schemas/functions.sql`, `supabase/schemas/policies.sql`, new migration, possibly `src/lib/github/client.ts` (delete or refactor), tests.
