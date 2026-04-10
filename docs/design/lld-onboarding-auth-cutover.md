# LLD — Onboarding & Auth: Sign-in Cutover

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 3
**Related:** ADR-0020 §Decision points 3 & 4, [lld-onboarding-auth-resolver.md](lld-onboarding-auth-resolver.md) (prerequisite)
**Status:** Revised
**Date:** 2026-04-07
**Revised:** 2026-04-10 | Issue #179

## 1. Purpose

Atomic cutover from OAuth-provider-token org membership to installation-token org membership. Wires `resolveUserOrgsViaApp` into `/auth/callback`, deletes `org-sync.ts`, drops the `user_github_tokens` table and associated RPCs + Vault key, and drops `read:org`/`repo` OAuth scopes.

> **Implementation note (issue #179):** The first-install-race mitigation (§6) was designed but deliberately removed during implementation — the installer can simply refresh the page if they hit the race. KISS over speculative engineering.

**No feature flag, no dual-write.** Nothing in this epic has shipped to production yet, so cutover is a single PR. The PR is expected to slightly exceed the 200-line budget (~220); the plan and this LLD explicitly accept the overrun because there is no clean seam once dual-write is off the table.

## 2. HLD coverage

Covered by ADR-0020 §Decision points 3 & 4 and its "Implementation Outline" step 3. Open Question on the first-install-race is answered in §6 below.

## 3. Layers

### 3.1 DB

Schema-file changes in `supabase/schemas/`:

- **`tables.sql`** — drop `CREATE TABLE user_github_tokens` (lines ~101–112). Also drop the top-of-file comment block referencing Vault.
- **`functions.sql`** — drop `store_github_token` and `get_github_token` RPCs and the "Supabase Vault is used for GitHub token encryption" preamble at the top of the file. Neither RPC has any other caller; removing them leaves no Vault references in `functions.sql`.
- **`policies.sql`** — drop any policies on `user_github_tokens`.
- **`supabase/config.toml`** — no change (the `[db.vault]` block is already commented out).

**Vault is fully retired by this task.** Audit confirmation before generating the migration:

```bash
grep -rn "vault\." supabase/schemas/
grep -rn "store_github_token\|get_github_token\|vault\." src/
```

Both greps must return **zero matches** in the modified tree. If anything else references Vault, surface it and re-scope; the current audit shows only the two RPCs and `src/lib/github/client.ts`, which Task 3 is already deleting/refactoring (§3.2).

Generated migration: `supabase/migrations/<timestamp>_drop_user_github_tokens_and_vault.sql` via `npx supabase db diff -f drop_user_github_tokens_and_vault`. The generated migration must:

1. `DROP FUNCTION store_github_token` and `DROP FUNCTION get_github_token` (both `CASCADE` to remove any lingering grants).
2. Proactively delete Vault secret rows **before** dropping the table, so no orphaned secrets remain in `vault.secrets`:
   ```sql
   DELETE FROM vault.secrets
   WHERE id IN (SELECT token_secret_id FROM user_github_tokens);
   ```
   (Required because `vault.secrets` has no FK back to `user_github_tokens` — `ON DELETE CASCADE` on the app table does **not** clean up Vault.)
3. `DROP TABLE user_github_tokens`.

Add the header comment referencing this task's issue number and ADR-0020. Review the generated diff and hand-edit in the `DELETE FROM vault.secrets` step — `db diff` will not generate it automatically.

Post-generation verification:

1. `npx supabase db reset` — applies cleanly.
2. `npx supabase db diff` — **must** print "No schema changes found".
3. Manual check in local DB: `SELECT COUNT(*) FROM vault.secrets;` — should be the same count as before minus the number of dropped rows (or 0 if this was the only caller, which it is).

**No Vault-specific extension or key to drop:** Vault is a built-in Supabase extension; we do not own a dedicated Vault encryption key (the default Supabase-managed key is used). There is nothing to uninstall. After this migration, the Vault extension remains installed (it ships with Supabase) but we have zero rows and zero callers.

### 3.2 Backend

**Delete:**

- `src/lib/supabase/org-sync.ts`
- Any test file for `org-sync` — grep `org-sync` under `tests/` and `src/`.

**Modify:**

- `src/app/auth/callback/route.ts` — see §4.
- `src/lib/github/client.ts` — _(deferred)_ This file currently calls `get_github_token`. The audit confirmed no callers block the cutover, but the file itself was not deleted or refactored in this task. To be addressed in a follow-up cleanup issue.

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
  const githubLogin = String(user.user_metadata['user_name'] ?? '');
  if (!Number.isFinite(githubUserId) || githubUserId === 0 || !githubLogin) {
    return redirectSignIn(origin, 'auth_failed');
  }

  try {
    const secretClient = createSecretSupabaseClient();
    const matched = await resolveUserOrgsViaApp(secretClient, {
      userId: user.id,
      githubUserId,
      githubLogin,
    }, {});
    emitSigninEvent(matched.length > 0 ? 'success' : 'no_access', {
      user_id: user.id,
      github_user_id: githubUserId,
      matched_org_count: matched.length,
    });
    return response;
  } catch (err) {
    logger.error({ err, userId: user.id }, 'resolveUserOrgsViaApp failed');
    emitSigninEvent('error', { user_id: user.id, github_user_id: githubUserId, matched_org_count: 0 });
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

## 6. First-install-and-sign-in race mitigation _(descoped)_

> **Implementation note (issue #179):** This entire section was designed, implemented, and then deliberately removed. The installer rarely signs in immediately after installing the app. The 5-minute-window fallback, `installer_github_user_id` column, and all supporting code added unnecessary complexity for an edge case that can be handled by a simple page refresh. KISS principle applied.

~~**Scenario:** admin installs the App, GitHub sends `installation.created`, then the admin clicks "Sign in" before the webhook is processed.~~

**If this race becomes a real user complaint in production**, the mitigation can be re-added: point the GitHub App setup URL to a dedicated `/app/installed` page instead of `/auth/callback`, decoupling installation from sign-in entirely.

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

// first-install race tests — descoped (see §6)
```

## 8. Acceptance criteria

- [ ] Zero references to `provider_token` under `src/` (`grep -rn "provider_token" src/` returns nothing).
- [ ] Zero references to `user_github_tokens` under `src/` and `supabase/` except the drop migration itself.
- [ ] Zero references to `vault.` under `src/` and `supabase/schemas/` (the drop migration is the only remaining `vault.` reference anywhere).
- [ ] `SELECT COUNT(*) FROM vault.secrets WHERE id IN (previous token_secret_ids)` returns 0 after migration.
- [ ] Zero references to `/user/orgs` under `src/`.
- [ ] `org-sync.ts` is deleted.
- [ ] OAuth scope string is exactly `'read:user'`.
- [ ] Migration applies cleanly: `npx supabase db reset` succeeds.
- [ ] `npx supabase db diff` after reset prints "No schema changes found".
- [ ] ~~`organisations.installer_github_user_id` column exists~~ _(descoped — §6)_
- [ ] ~~First-install-race BDD specs pass~~ _(descoped — §6)_
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
