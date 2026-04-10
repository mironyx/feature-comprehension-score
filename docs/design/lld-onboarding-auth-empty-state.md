# LLD — Onboarding & Auth: `/org-select` Non-Member Empty State

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 4
**Related:** [req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md) §O.3, [lld-onboarding-auth-cutover.md](lld-onboarding-auth-cutover.md) (prerequisite)
**Status:** Revised
**Date:** 2026-04-07
**Revised:** 2026-04-10 (issue #181)

## 1. Purpose

After Task 3, a signed-in user who is not a member of any installed org is redirected to `/org-select`, which renders a near-empty page. This task replaces the placeholder copy with a proper empty-state matching requirement O.3: clear message, link to the GitHub App install URL, visible Sign out button. Sign-out clears the session and redirects to `/auth/sign-in`.

## 2. HLD coverage

Requirement O.3 is the contract. No additional HLD work.

## 3. Layers

### 3.1 Frontend

**Modify:** [src/app/org-select/page.tsx](../../src/app/org-select/page.tsx).

The current empty-state block (lines 50–60) is:

```tsx
if (userOrgs.length === 0) {
  return (
    <main>
      <h1>Select Organisation</h1>
      <p>No organisations found. Ask your organisation admin to install the app.</p>
      <form action="/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

New markup (copy verbatim from req O.3):

```tsx
if (userOrgs.length === 0) {
  return <NonMemberEmptyState />;
}
```

Extracted into a new component to keep `page.tsx` under the 20-line function budget and to make the component independently testable.

**New file:** `src/app/org-select/NonMemberEmptyState.tsx` (server component — no client interactivity needed; sign-out is a form POST). The default install URL is extracted to a named constant `DEFAULT_INSTALL_URL` for clarity.

> **Implementation note (issue #181):** The `??` operator was replaced with `||` so that an empty-string env var also falls back to the default — a defensive improvement over the original spec.

```tsx
export function NonMemberEmptyState() {
  // Use || so an empty-string env var also falls back to the default.
  const installUrl =
    process.env['NEXT_PUBLIC_GITHUB_APP_INSTALL_URL'] || DEFAULT_INSTALL_URL;
  return (
    <main>
      <h1>No access</h1>
      <p>
        You do not have access to any organisation using FCS.
        Ask your admin to install the app or add you to an org where it is installed.
      </p>
      <p>
        <a href={installUrl}>Install the GitHub App</a>
      </p>
      <form action="/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
```

### 3.2 Install URL

`NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` is a new public env var. Add it to:

- `.env.example` (if present — grep first) with a placeholder value.
- `next.config.ts` `env` block only if public env vars are whitelisted there (grep first; Next.js reads `NEXT_PUBLIC_*` automatically, so usually no config change is needed).

The fallback literal URL is a sensible default for the current App slug. If the App slug changes, the env var overrides it.

### 3.3 Sign-out handler

Verify `/auth/sign-out` exists under `src/app/auth/sign-out/`. At the time of writing the directory is listed; read the file during implementation and confirm it:

1. Calls `supabase.auth.signOut()`.
2. Redirects to `/auth/sign-in`.
3. Does **not** delete any rows in `auth.users` or `user_organisations`.

If it does not meet these, adjust it in this same task — it is a three-line change.

## 4. Tests

**New file:** `src/app/org-select/NonMemberEmptyState.test.ts` (component test using `renderToStaticMarkup` from `react-dom/server` — no `@testing-library/react` dependency needed).

> **Implementation note (issue #181):** Test file uses `.test.ts` (not `.test.tsx`) because `renderToStaticMarkup` avoids the need for JSX transform in tests. This is simpler and avoids adding `@testing-library/react` as a dependency.

**New file:** `tests/evaluation/org-select-empty-state.eval.test.ts` — 13 adversarial evaluation tests verifying acceptance criteria coverage (added by feature-evaluator agent).

Verify:

- Heading text.
- Body text matches req O.3 **exactly**, word-for-word.
- Install link points at the configured URL (test sets the env var via `vi.stubEnv`).
- Sign-out form posts to `/auth/sign-out`.

**New E2E** (optional — only if the existing e2e harness can run without a real Supabase): `tests/e2e/org-select-empty.e2e.ts` — navigates to `/org-select` as a signed-in user with zero memberships, asserts the copy and the sign-out flow. **Deferred to a follow-up issue if the harness cannot support this** — do not block this task on E2E.

## 5. BDD specs

```ts
describe('NonMemberEmptyState', () => {
  it('renders the exact copy from requirement O.3');
  it('links to NEXT_PUBLIC_GITHUB_APP_INSTALL_URL when set');
  it('falls back to the default install URL when the env var is not set');
  it('posts the sign-out form to /auth/sign-out');
});

describe('/auth/sign-out handler', () => {
  it('clears the Supabase session');
  it('redirects to /auth/sign-in');
  it('does not delete auth.users rows');
});
```

## 6. Acceptance criteria

- [ ] `/org-select` empty state shows the exact copy from req O.3.
- [ ] Install link is present and points to the configured URL.
- [ ] Sign out button is visible and triggers a POST to `/auth/sign-out`.
- [ ] `/auth/sign-out` clears the session and redirects to `/auth/sign-in`.
- [ ] `NonMemberEmptyState` component test passes.
- [ ] `page.tsx` empty-state branch is ≤ 3 lines (just `return <NonMemberEmptyState />`).
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx vitest run` passes.
- [ ] `npx next lint` (or `npm run lint`) passes.

## 7. Out of scope

- Loading skeleton on the multi-org case (tracked in #90).
- Extracting `OrgCard` (tracked in #89).
- Full E2E of the install → sign-in → empty-state loop unless the harness already supports it. _(deferred — no E2E harness for authenticated flows yet)_

## 8. Task

**Task 4 — `/org-select` non-member empty state**

Depends on Task 3 (the callback must redirect non-members to `/org-select` without errors). Estimated ~120 lines across `NonMemberEmptyState.tsx`, `page.tsx` edit, test file, and possibly the sign-out handler fix.
