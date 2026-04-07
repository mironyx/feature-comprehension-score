# LLD — Onboarding & Auth: Install Lifecycle Webhooks

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 5
**Related:** [req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md) §O.4, ADR-0001, [installation-handlers.ts](../../src/lib/github/installation-handlers.ts) (existing)
**Status:** Draft
**Date:** 2026-04-07

## 1. Purpose

Extend the existing GitHub App webhook handler in [src/lib/github/installation-handlers.ts](../../src/lib/github/installation-handlers.ts) to cover every install-lifecycle event that can affect `organisations` and `repositories`:

| Event | Currently handled? | New behaviour |
|---|---|---|
| `installation.created` | **Yes** | Extend: also store `sender.id` into new `organisations.installer_github_user_id` (for first-install-race — see Task 3). |
| `installation.deleted` | **Yes** (sets status=inactive on the org) | Extend: also delete all `user_organisations` rows for that org. |
| `installation.suspend` | **No** | New: set `organisations.status='inactive'`. |
| `installation.unsuspend` | **No** | New: set `organisations.status='active'`. |
| `installation_repositories.added` | **Yes** | No change. |
| `installation_repositories.removed` | **Yes** (sets repo status=inactive) | No change; verify assessments referencing the removed repo remain readable. |

## 2. HLD coverage

Requirement O.4 is the contract. ADR-0001 establishes the App; ADR-0008 establishes the `organisations`/`repositories` data model.

## 3. Layers

### 3.1 DB

- **Column dependency:** `organisations.installer_github_user_id` (added by Task 3's migration). This task writes to it. **If Task 3 has not merged first, the column does not exist.** Coordination: Task 3 must merge before Task 5 — enforced by merge order, not code.
- **New RPC (optional):** if `handle_installation_deleted` is preferred for the transactional `user_organisations` cleanup, add it to `supabase/schemas/functions.sql` and generate a migration. Otherwise the handler can do two separate updates in one transaction via a service-role client. **Decision:** add an RPC `handle_installation_deleted(p_installation_id bigint)` for symmetry with the existing `handle_installation_created` and `handle_repositories_added`. It executes both updates atomically.

### 3.2 Backend — files modified

| File | Action |
|---|---|
| `src/lib/github/installation-handlers.ts` | Extend `handleWebhookEvent` dispatch; add `handleInstallationSuspend`/`Unsuspend`; extend `handleInstallationCreated` to store `sender.id`; extend `handleInstallationDeleted` to call the new RPC. |
| `src/lib/github/installation-handlers.test.ts` | New or extended; one `describe` block per handler. |
| `supabase/schemas/functions.sql` | Add `handle_installation_deleted` RPC; optionally extend `handle_installation_created` to accept `p_installer_github_user_id` (or add a second RPC `set_org_installer`). **Chosen:** extend `handle_installation_created` to take the new parameter. |
| `supabase/migrations/<ts>_install_lifecycle_rpcs.sql` | Generated migration. |

### 3.3 Payload types

Extend the existing interfaces:

```ts
export interface InstallationCreatedPayload {
  action: 'created';
  installation: { id: number; account: GithubAccount; app_id: number };
  repositories?: GithubRepo[];
  sender: { id: number; login: string };  // NEW — required
}

export interface InstallationDeletedPayload {
  action: 'deleted';
  installation: { id: number; account: GithubAccount; app_id: number };
}

export interface InstallationSuspendedPayload {
  action: 'suspend' | 'unsuspend';
  installation: { id: number };
}
```

### 3.4 Dispatch

The existing `handleWebhookEvent` uses a nested `if` structure that is already at the complexity budget. Refactor to a dispatch map to keep the function under 20 lines:

```ts
type Handler = (payload: unknown, db: Db) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  'installation:created':    (p, db) => handleInstallationCreated(p as InstallationCreatedPayload, db),
  'installation:deleted':    (p, db) => handleInstallationDeleted(p as InstallationDeletedPayload, db),
  'installation:suspend':    (p, db) => handleInstallationSuspended(p as InstallationSuspendedPayload, db),
  'installation:unsuspend':  (p, db) => handleInstallationSuspended(p as InstallationSuspendedPayload, db),
  'installation_repositories:added':   (p, db) => handleRepositoriesAdded(p as InstallationRepositoriesPayload, db),
  'installation_repositories:removed': (p, db) => handleRepositoriesRemoved(p as InstallationRepositoriesPayload, db),
};

export async function handleWebhookEvent(event: string, payload: Record<string, unknown>, db: Db) {
  const action = typeof payload['action'] === 'string' ? payload['action'] : '';
  const handler = HANDLERS[`${event}:${action}`];
  if (handler) await handler(payload, db);
}
```

This incidentally fixes a latent bug in the current dispatch: the nested `if`/`else` without braces around the outer `if (event === 'installation')` block means an `installation_repositories` event with `action='created'` would fall through incorrectly. Flag this in the PR description — the fix is part of the cleanup.

## 4. Internal decomposition

Not an API route. The webhook controller at [src/app/api/webhooks/github/route.ts](../../src/app/api/webhooks/github/route.ts) already follows the thin-controller pattern: verify signature, parse body, delegate to `handleWebhookEvent`. Unchanged by this task.

## 5. Idempotency

Requirement O.4: replaying a webhook must not double-insert or fail.

- **`installation.created`** — `handle_installation_created` RPC uses `ON CONFLICT (github_org_id) DO UPDATE`. Already idempotent. Confirm by reading the RPC body in `functions.sql`.
- **`installation.deleted`** — the new RPC is a simple UPDATE + DELETE; idempotent.
- **`installation.suspend`/`unsuspend`** — plain UPDATE; idempotent.
- **`installation_repositories.added`** — `handle_repositories_added` RPC uses `ON CONFLICT`. Already idempotent.
- **`installation_repositories.removed`** — plain UPDATE setting status; idempotent.

Each handler must be unit-tested with the same payload twice and assert no error and no duplicate rows.

## 6. Signature verification

Unchanged. `src/app/api/webhooks/github/route.ts` verifies HMAC-SHA256 via `verifyWebhookSignature` before delegating. This task does **not** touch signature verification.

## 7. BDD specs

```ts
describe('handleInstallationCreated', () => {
  it('upserts an organisation row with status=active');
  it('inserts initial repositories for the installation');
  it('stores sender.id into organisations.installer_github_user_id');
  it('is idempotent when replayed');
  it('handles personal-account installs (account.type === "User")');
});

describe('handleInstallationDeleted', () => {
  it('sets the organisation status to inactive');
  it('deletes all user_organisations rows for the affected org');
  it('leaves user_organisations for other orgs untouched');
  it('is idempotent when replayed');
});

describe('handleInstallationSuspended', () => {
  it('sets status=inactive on suspend');
  it('sets status=active on unsuspend');
  it('is a no-op for an unknown installation id');
});

describe('handleRepositoriesRemoved', () => {
  it('marks removed repos inactive');
  it('does not delete existing assessments referencing those repos');
  it('is idempotent when replayed');
});

describe('handleWebhookEvent dispatch', () => {
  it('routes installation.created to the correct handler');
  it('routes installation_repositories.added correctly (regression for nested-if bug)');
  it('does nothing for unknown event+action combinations');
});
```

## 8. Acceptance criteria

- [ ] All six event types (`installation.{created,deleted,suspend,unsuspend}`, `installation_repositories.{added,removed}`) are handled.
- [ ] `organisations.installer_github_user_id` is populated from `sender.id` on `installation.created`.
- [ ] `installation.deleted` deletes `user_organisations` for the affected org.
- [ ] Replaying any event is a no-op (verified by tests calling the handler twice with the same payload).
- [ ] Signature verification in the route handler is unchanged.
- [ ] Assessments that reference a removed repo remain readable (covered by an integration or query-level test).
- [ ] Dispatch refactor covered by a regression test for the nested-if bug.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npx vitest run src/lib/github/installation-handlers.test.ts` passes.
- [ ] `npx supabase db diff` is clean after the new migration.

## 9. Coordination with Task 3

- **Task 3 must merge before Task 5** because this task writes to `organisations.installer_github_user_id`, which Task 3 adds.
- File overlap: `supabase/schemas/functions.sql` is touched by both. Expect a merge conflict — Task 5 rebases onto Task 3.
- `installation-handlers.ts` is touched only by Task 5. `auth/callback/route.ts` only by Task 3. No code-level overlap.

## 10. Task

**Task 5 — Install lifecycle webhooks**

Depends on Task 3's migration (for the new column). Otherwise independent. Estimated ~200 lines.
