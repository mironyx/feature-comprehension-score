# Session log — 2026-04-07 session 2: /architect onboarding-auth epic

**Scope:** Run `/architect` against the onboarding-auth epic plan and produce all design artefacts (epic issue, task issues, per-task LLDs) ready for implementation.

**Input:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md)

## Completed work

### Epic + task issues

- Created **epic #176** — "Onboarding & Auth — installation-token org membership" (`epic` label, In Progress on board).
- Created **7 task issues** (all `L5-implementation`):
  - #177 — Task 1: Add `members:read` to GitHub App + publish permissions list (Todo)
  - #178 — Task 2: `resolveUserOrgsViaApp` service (Blocked)
  - #179 — Task 3: Sign-in cutover (Blocked)
  - #181 — Task 4: `/org-select` non-member empty state (Blocked)
  - #180 — Task 5: Install lifecycle webhooks (Blocked)
  - #182 — Task 6: Sign-in telemetry (Blocked)
  - #183 — Task 7: Customer onboarding guide (Blocked)
- Updated epic body with task checklist, dependency graph, and LLD links.
- Added every task to project board with correct initial status (only #177 unblocked).

### LLDs produced

One file per task (ADR-0018 naming `lld-<epic-slug>-<task-slug>.md`), one commit per LLD:

1. `docs/design/lld-onboarding-auth-app-permission.md` — Task 1
2. `docs/design/lld-onboarding-auth-resolver.md` — Task 2
3. `docs/design/lld-onboarding-auth-cutover.md` — Task 3
4. `docs/design/lld-onboarding-auth-empty-state.md` — Task 4
5. `docs/design/lld-onboarding-auth-webhooks.md` — Task 5
6. `docs/design/lld-onboarding-auth-telemetry.md` — Task 6

Task 7 is docs-only — no LLD.

Plus one follow-up commit tightening the cutover LLD to fully retire Vault (see Decisions below).

## Decisions made during /architect

### 1. Vault is fully retired in Task 3

Audit confirmed Vault's **only** callers are `store_github_token` / `get_github_token`, and the only consumer of those RPCs is `src/lib/github/client.ts`. Task 3's cutover LLD now:

- Drops both RPCs + the `user_github_tokens` table.
- Hand-edits the generated migration to `DELETE FROM vault.secrets` first (since `vault.secrets` has no FK back to the app table, `ON DELETE CASCADE` does not propagate).
- Adds acceptance criteria for zero `vault.` references in `src/` and `supabase/schemas/` after the migration.
- Notes the Vault extension itself stays installed (built-in to Supabase, nothing to uninstall).

### 2. App installation token helper is net-new

ADR-0020 claimed repo reads "already use the installation token", but a grep of `src/lib/github/` showed all authenticated Octokit calls use the **stored user OAuth token** via Vault. Task 2's LLD therefore owns introducing the entire installation-token flow:

- `src/lib/github/app-auth.ts` — `createAppJwt` (RS256 via `jose`), `createInstallationToken`, cached `getInstallationToken`.
- Reads `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (handles `\n`-escaped PEMs).

Flagged as a blocking audit in Task 3: every `createGithubClient` caller must be verified not to depend on an OAuth-specific capability. If any do, cutover is blocked.

### 3. Resolver is no-throw → throws

`syncOrgMembership` swallowed all transient errors and preserved stale rows. Task 2's `resolveUserOrgsViaApp` **throws on 403/5xx/network**; only 404 is treated as a silent non-match. Rationale: once the App installation is the source of truth, a 403 means the install is broken (missing `members:read` or not re-consented) and must surface loudly, not be silently converted to "not a member". Task 6's telemetry captures the throw as `signin.error`.

### 4. First-install race mitigation needs a schema column

`organisations.installer_github_user_id bigint NULL` added in Task 3's migration. Task 5 (webhooks) writes to it from `installation.created.sender.id`. Task 3's resolver extension (`findFirstInstallAsInstaller`) reads it. **Ordering constraint:** Task 3 must merge before Task 5.

### 5. Task 5 dispatch refactor also fixes a latent bug

`handleWebhookEvent` in `src/lib/github/installation-handlers.ts` has a nested `if`/`else` without braces around the outer `if (event === 'installation')` block. An `installation_repositories` event with `action='created'` would fall through incorrectly. Task 5's LLD refactors to a dispatch map and adds a regression test.

### 6. Telemetry gets its own LLD

Plan suggested inlining Task 6 into the cutover LLD; I put it in its own file (`lld-onboarding-auth-telemetry.md`) because there is no existing observability LLD to extend and keeping it separate makes the 6-file-per-task split clean. Uses existing Pino `logger` per ADR-0016 — no new infrastructure.

## Execution order for implementation

**Sequential (critical path):**

```
#177 → #178 → #179
```

**Parallel (after #179 merges):**

```
/feature-team 180 181 182
```

File-overlap check: #180 touches `installation-handlers.ts` + webhook RPCs in `functions.sql`; #181 touches `org-select/*`; #182 touches `callback/route.ts` + new `observability/`. No overlap. Safe to parallelise.

**Final:**

```
/feature 183
```

## Open items for human

- **Task 1 is partly manual** — GitHub UI toggle + re-consent email approval. `/feature` can't do this end-to-end.
- **Task 3 size overrun (~220 lines)** is explicitly accepted in the plan and LLD. Call it out in the PR description.
- **`createGithubClient` audit** (Task 3 §3.2) — if any non-org-lookup caller depends on the OAuth token, escalate before dropping the table.

## Commits

```
135b879 docs: LLD for onboarding-auth Task 1 — App members:read permission (#176)
87daf11 docs: LLD for onboarding-auth Task 2 — resolveUserOrgsViaApp (#176)
cd209ce docs: LLD for onboarding-auth Task 3 — sign-in cutover (#176)
18996b5 docs: LLD for onboarding-auth Task 4 — /org-select empty state (#176)
633bc03 docs: LLD for onboarding-auth Task 5 — install lifecycle webhooks (#176)
abdc369 docs: LLD for onboarding-auth Task 6 — sign-in telemetry (#176)
97aa701 docs: tighten onboarding-auth cutover LLD — fully retire Vault (#179)
```

All pushed to `main`.

## Next session

Kick off implementation: `/feature 177`.
