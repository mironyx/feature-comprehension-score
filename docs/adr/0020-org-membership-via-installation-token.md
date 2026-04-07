# 0020. Org Membership via GitHub App Installation Token

**Date:** 2026-04-07
**Status:** Accepted
**Deciders:** LS / Claude
**Supersedes (in part):** ADR-0003 (the org-membership lookup mechanism only — Supabase Auth + GitHub OAuth as the identity provider stands)
**Related:** ADR-0001 (GitHub App), ADR-0003 (auth provider), ADR-0008 (multi-tenancy data model), spike-004 (Supabase Auth spike), lld-phase-2-web-auth-db.md

## Context

ADR-0003 chose Supabase Auth with GitHub as the OAuth provider. The original design used the **user's OAuth provider token** to call `GET /user/orgs` and discover which organisations the signed-in user belongs to. The result is matched against the `organisations` table (rows created when an org admin installs the GitHub App) to populate `user_organisations`.

This works on the happy path but has proven hostile in practice. The OAuth path is subject to a series of GitHub policies and UX traps that the original design did not surface as risks:

1. **OAuth App access restrictions.** Most enterprise GitHub organisations enable "Restrict OAuth applications". Until an org owner explicitly approves the OAuth app, that org is **invisible** to `/user/orgs` — the API returns success (`200 []`) rather than an error, so the user lands on a silent dead-end empty state.
2. **The OAuth app the customer must approve is "Supabase", not "FCS".** Because we use Supabase Auth, the OAuth grant is owned by Supabase. Customers see an unfamiliar app name and have to trust it.
3. **GitHub caches OAuth grants.** Once a user has authorised the Supabase OAuth app (even with insufficient scopes), GitHub will not re-prompt for consent. The user cannot trigger a "Request access" flow without first revoking the authorisation at `github.com/settings/applications` — a step they have no way of discovering.
4. **The grant cannot be revoked programmatically.** GitHub's `DELETE /applications/{client_id}/grant` requires the OAuth app's `client_id` and `client_secret`, which Supabase owns and we do not have. We cannot recover from the failure mode in code.
5. **Storing the user provider token is a real cost.** We encrypt it (Supabase Vault), rotate Vault keys, and treat it as a credential because if the database leaks, an attacker can read every signed-in user's GitHub orgs. Removing this would shrink our security surface.

These problems all share a single root cause: **we used the user's OAuth token as both an identity proof and an authorisation lookup.** It is fine for identity, terrible for authorisation.

The GitHub App we installed at the org level (ADR-0001) has its own authentication and is **independent of OAuth**. It is not affected by OAuth app restrictions, has no consent caching, and exposes its own permissions for reading org data — including org membership. This decision reframes org membership as something the **app** discovers on its own credentials, not something we read out of the user's token.

### A note on GitHub tokens (which token does what?)

GitHub has **three** kinds of tokens. They are easy to confuse and the choice between them is the substance of this ADR. They are completely separate authentication contexts.

| # | Token | Authenticates as | How obtained | Lifetime | Affected by OAuth restrictions? | What it can read |
|---|---|---|---|---|---|---|
| 1 | **User OAuth provider token** | A specific human user | Returned by the OAuth flow when the user clicks "Sign in with GitHub". Comes from Supabase Auth as `session.provider_token`. | Long-lived until revoked or scope change | **Yes — this is the problem** | Whatever scopes the user consented to: `read:user`, `read:org`, `repo`, etc. Acts on the user's own behalf. |
| 2 | **GitHub App installation token** | The GitHub App, scoped to a specific org installation | Generated server-side from a JWT signed with the App's private key, calling `POST /app/installations/{id}/access_tokens`. We already do this for reading PRs and writing Check Runs. | 1 hour, regenerated on demand | **No — installations are not OAuth grants** | Whatever permissions the App was granted at install time (currently: pull requests, checks, contents, metadata). After this ADR: also `members:read`. Acts as the App against that one org. |
| 3 | **GitHub App user-to-server token** | A specific human user, but issued by the GitHub App rather than the OAuth flow | Different OAuth-like flow that uses the GitHub App's own client ID. | Short-lived, refreshable | Not affected — it's a GitHub App credential | Same permissions as the install, but acted-upon-by a specific user. We do not currently use this. |

ADR-0003 chose token (1) for both identity *and* org-membership lookup. This ADR splits those concerns: **token (1) for identity only, token (2) for org-membership lookup.** Token (3) is not used by this ADR, but is mentioned because it is occasionally suggested as an alternative; we reject it below.

### What the user OAuth provider token is actually used for today

To remove a common point of confusion: the user OAuth provider token is **not** used to fetch PR content, diffs, comments, or Check Runs. All repository reads and Check Run writes already use the GitHub App **installation token** (ADR-0001). A quick audit of `src/**/*.ts` confirms the user provider token has exactly two consumers:

- `src/app/auth/callback/route.ts` — receives it from the Supabase OAuth callback and passes it onward.
- `src/lib/supabase/org-sync.ts` — uses it to call `/user/orgs` and `/orgs/{org}/memberships/{user}`.

That is the entire surface area. No assessment code, no rubric generation, no webhook handler, no background job reads PRs or writes Checks with this token. The `repo` scope added to the OAuth request in `SignInButton.tsx` provides no capability that is actually used anywhere. Once org-membership lookup moves to the installation token, the user provider token has **zero remaining consumers** and its storage table can be deleted with no functional loss.

## Options Considered

### Option A: Keep using the user OAuth token, build elaborate failure-mode UX

Accept the OAuth path and invest in: distinguishing four empty-state variants, telemetry on each, customer onboarding documentation, in-app revoke instructions, an E2E test that simulates OAuth restrictions. Roughly the requirements doc as originally drafted.

- **Pros:** No change to tokens, scopes, or GitHub App permissions. No re-consent required from existing installs.
- **Cons:** Expensive build (~10 stories). Every customer hits the failure modes anyway and customer setup remains a multi-step dance involving an unfamiliar app name. Telemetry tells us about failures *after* they cost us deals. Does not address (5).

### Option B: Use the GitHub App installation token to look up org membership (chosen)

Use the user OAuth token only for identity: read the user's GitHub ID and login from `auth.users.user_metadata`. Do not request `read:org` scope. Do not store `provider_token`.

For org membership, iterate over installed orgs in the `organisations` table and for each one call `GET /orgs/{org}/members/{username}` (or maintain a cached member list updated via webhooks). The installation token authorises this; OAuth restrictions do not apply.

- **Pros:**
  - Eliminates OAuth restrictions as a failure mode entirely.
  - Customer setup collapses to a single step: install the GitHub App.
  - We can drop `read:org` (and potentially `repo`) from the OAuth scopes, since repo access already uses the installation token.
  - We can stop storing the user provider token, removing a credential and a Vault key from our security surface.
  - Failure modes shrink from four to one ("you are not a member of any installed org").
  - Existing GitHub App permissions model is well-understood by customers (they already approved the install).
- **Cons:**
  - Requires adding the `members:read` permission to the GitHub App. Existing installations must be re-approved by an org owner — GitHub emails them. One-time disruption. Currently we have one production install (mironyx) so the cost is negligible today; the cost grows linearly with the number of customers we onboard before making this change.
  - We become responsible for keeping a member list fresh. Either query GitHub on every sign-in (slow for very large orgs) or subscribe to `member` and `organization` webhooks and maintain a mirror table.
  - Slight conceptual leak: a user authenticates via Supabase OAuth but is authorised against data that came from the GitHub App. The two systems must agree on the same `github_user_id`. (They will — GitHub user IDs are stable and globally unique.)

### Option C: GitHub App user-to-server tokens (replace Supabase Auth identity flow)

Drop Supabase OAuth as the identity provider entirely and use the GitHub App's own user-authorisation flow (the "user-to-server" token model).

- **Pros:** A single, consistent token model — both identity and authorisation come from the GitHub App. The consent screen says "FCS", not "Supabase".
- **Cons:** Tears up ADR-0003. Loses Supabase Auth's session management, refresh, RLS integration via JWT, anonymous-key flows, future SSO providers. We would have to reinvent session storage, CSRF, refresh, sign-out, audit logging — none of which is the product. Fundamentally throws away the reason we chose Supabase Auth in the first place. Disproportionate cost for the marginal gain of a friendlier consent screen.

### Option D: Block sign-in entirely until the customer is provisioned out-of-band

Maintain an allowlist of GitHub user IDs in our DB, populated via admin-invite flow. Refuse OAuth sign-in for anyone not on the list.

- **Pros:** Bulletproof.
- **Cons:** Trades one onboarding problem for another — now customers need an invite flow before anyone can sign in. Adds an admin tool we do not have. Breaks the "install the app and you're done" promise.

## Decision

**Option B — use the GitHub App installation token for org membership lookup.**

Specifically:

1. **Identity:** continue using Supabase Auth + GitHub OAuth as decided in ADR-0003. The OAuth flow only needs to confirm "this person is GitHub user X". The minimum scope set drops to `read:user`.
2. **Repo access:** unchanged. Reading PRs, writing Check Runs, etc. already use the installation token (per ADR-0001). The `repo` scope is dropped from the OAuth user token.
3. **Org membership:** at sign-in, do **not** call `/user/orgs`. Instead:
   - Read the user's `github_user_id` and `github_login` from the Supabase session (these come from the OAuth identity claim).
   - Iterate over rows in `organisations` where `status='active'`.
   - For each org, use the installation token to call `GET /orgs/{org}/memberships/{username}` live. 200 → member; 404 → not a member.
   - Upsert `user_organisations` rows for confirmed memberships; remove stale rows.
4. **Provider token storage:** the `user_github_tokens` table and Supabase Vault key for OAuth provider tokens are no longer needed and will be removed as part of the sign-in cutover.
5. **GitHub App permission change:** add `members:read` (Organisation members → Read-only) to the App manifest. Document the re-consent requirement in the customer onboarding doc and trigger it on existing installs as part of rollout.
6. **No member-list mirror.** We call GitHub directly per sign-in. No `org_members` table, no webhook-driven mirror, no reconciliation job. This is a deliberate simplification over an earlier draft of this ADR: at V1 scale the API load is negligible, and the mirror adds operational complexity (webhook delivery reliability, reconciliation sequencing) that is not justified. Revisit only if per-sign-in API latency or rate limits become measurable.

This decision **partially supersedes ADR-0003**: the identity-provider choice and Supabase Auth integration remain, but the section on using `provider_token` for org-membership lookup is replaced by this ADR.

## Consequences

### Positive

- The four onboarding failure modes in `req-onboarding-and-auth.md` collapse to one. The requirements doc shrinks accordingly.
- Customer setup is one click: install the GitHub App. No OAuth approval, no revoke dance, no second-sign-in.
- Security surface shrinks: no stored user OAuth token, no Vault key for it, no plaintext credential in DB backups.
- OAuth scopes drop to the minimum necessary for identity (`read:user`). Lower trust ask at sign-in.

### Negative

- Existing installs (currently: mironyx) must re-consent to the new `members:read` permission. GitHub emails owners; owners click approve. Trivial today, grows with installs.
- Live `GET /orgs/{org}/memberships/{username}` on every sign-in. For a user who belongs to N installed orgs we pay N API calls per sign-in. At V1 scale (single-digit orgs per user) this is well under GitHub rate limits and not perceptible to users. If this changes, introduce a short-TTL cache before reaching for a mirror.
- Install lifecycle webhook handlers (`installation.*`, `installation_repositories.*`) are still needed to keep the `organisations` and `repositories` tables in sync — this is not org membership, and is unrelated to the mirror decision above.

### Neutral

- ADR-0003 stays in force for everything except the org-membership lookup. We update its "Implications" section to point at this ADR.
- `lld-phase-2-web-auth-db.md` §2.3 is **superseded** by per-task LLDs produced under the onboarding-auth epic (per ADR-0018, old phase LLDs are not retroactively rewritten). The section stays in place for historical context; new work reads the epic's LLDs.
- `req-onboarding-and-auth.md` has already been rewritten against this decision and is the input to the onboarding-auth implementation plan.

## Implementation Outline (deferred to LLDs)

Approximate work breakdown — to be formalised as tasks under the onboarding epic:

1. Add `members:read` permission to the GitHub App; document re-consent flow.
2. New `resolveUserOrgsViaApp(userId, githubUserId)` function to replace `syncOrgMembership` — live `GET /orgs/{org}/memberships/{username}` per installed org.
3. Sign-in cutover (atomic; no feature flag, nothing is deployed yet): wire the new resolver into `/auth/callback`, delete `org-sync.ts` provider-token path, drop the `user_github_tokens` table + Vault key, drop `read:org` and `repo` from OAuth scopes in `SignInButton.tsx`.
4. `/org-select` non-member empty state + sign-out + install-URL link.
5. Install lifecycle webhook handlers (`installation.*`, `installation_repositories.*`) — keeps `organisations` and `repositories` tables in sync. Parallelisable with 2–3.
6. Sign-in telemetry events (`signin.success`, `signin.no_access`, `signin.error`).
7. Customer onboarding guide.

## Open Questions

- **Personal-account installations:** the GitHub App can be installed on a personal GitHub account, not just an organisation. Personal accounts have no `memberships` API. The current code (`syncOrgMembership`) treats personal accounts as a special case and assigns the installer as `admin`. The new model needs the same special case — verified at install-webhook time, not sign-in time.
- **First-install-and-sign-in race:** if a brand-new admin installs the app and then immediately tries to sign in, the install webhook may not have been processed yet. Acceptable mitigation: on sign-in, if the user's `github_user_id` matches the `sender` of a recently received `installation.created` event for an org that has no confirmed members yet, treat them as a member.
