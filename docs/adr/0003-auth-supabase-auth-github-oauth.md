# 0003. Auth — Supabase Auth + GitHub OAuth

**Date:** 2026-03-05
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS Tool is a GitHub-integrated web application. Users are GitHub users — they already have GitHub accounts, and the tool operates on GitHub organisations and repositories. We need an authentication system that:

1. Lets users sign in with their existing GitHub account (no separate credentials).
2. Manages sessions (JWT, token refresh) so users stay signed in.
3. Gives us access to the user's GitHub organisation membership (for the org switcher, Story 1.2, and multi-tenancy isolation, Story 1.5).
4. Integrates cleanly with Next.js App Router (server components, API routes, middleware).
5. Works alongside — but separately from — the GitHub App's server-to-server authentication (webhooks, Check Runs, PR reading).

Research spike #4 (`docs/design/spike-004-supabase-auth-github-oauth.md`) investigated the mechanics in detail.

## Options Considered

### Option 1: Supabase Auth with GitHub as OAuth provider

Supabase Auth handles the OAuth flow, session management, and token refresh. GitHub is the identity provider. We use `@supabase/ssr` for Next.js integration.

- **Pros:**
  - Single service for database, auth, and RLS — all in Supabase. No additional infrastructure.
  - Built-in session management: JWT access tokens + refresh tokens, stored in cookies, auto-refreshed via Next.js middleware.
  - PKCE flow out of the box — secure by default.
  - Row-Level Security (RLS) policies use the Supabase JWT directly — auth and data access are unified.
  - `@supabase/ssr` provides cookie-based session handling purpose-built for Next.js App Router.
  - User profile data (GitHub ID, username, email, avatar) stored automatically in `auth.users`.

- **Cons:**
  - Supabase does NOT persist the GitHub provider token. We must capture it at sign-in and store it ourselves (encrypted). If missed, we lose it.
  - Org membership is not in the Supabase JWT. We must call the GitHub API separately using the stored provider token.
  - Tied to Supabase's auth implementation. If we migrate away from Supabase DB, we also lose auth.
  - OAuth scopes are fixed at sign-in time. Adding new scopes later requires re-authentication.

- **Implications:** We accept responsibility for storing and managing the GitHub provider token. We must request all needed OAuth scopes upfront (`user:email` + `read:org`).

### Option 2: NextAuth.js (Auth.js) with GitHub provider

NextAuth.js handles the GitHub OAuth flow directly, without Supabase Auth. Sessions managed by NextAuth.js (JWT or database sessions).

- **Pros:**
  - Purpose-built for Next.js — deeply integrated with App Router.
  - GitHub provider built in. Can store provider tokens in session callbacks.
  - Full control over session shape, callbacks, and token handling.
  - Not tied to any specific database provider.

- **Cons:**
  - Introduces a second auth system alongside Supabase. RLS policies cannot use NextAuth sessions directly — we would need a bridge layer to create Supabase JWTs from NextAuth sessions.
  - Two sources of truth for user identity: NextAuth sessions and Supabase `auth.users`. Synchronisation overhead.
  - More configuration and custom code for session management vs Supabase Auth's batteries-included approach.
  - Still need to manage GitHub token storage ourselves.

- **Implications:** Added complexity from running two auth systems. RLS becomes harder because Supabase RLS expects Supabase JWTs.

### Option 3: Custom OAuth implementation

Build the GitHub OAuth flow ourselves using the GitHub OAuth API directly. Store sessions in our own database table.

- **Pros:**
  - Full control over every aspect of the flow.
  - No dependency on any auth library or service.

- **Cons:**
  - Significant implementation effort: PKCE, token exchange, session management, token refresh, CSRF protection, cookie security.
  - Security risk from building auth from scratch — auth is notoriously easy to get wrong.
  - No RLS integration without additional work to generate Supabase-compatible JWTs.
  - Must implement and maintain session refresh, token rotation, and sign-out flows.

- **Implications:** High effort, high risk, no clear benefit over Option 1.

## Decision

**Option 1: Supabase Auth with GitHub as OAuth provider.**

The primary reason is **unified auth and data access**. Since we are already using Supabase for the database with RLS for multi-tenancy (ADR-0008), using Supabase Auth means our JWT tokens work directly with RLS policies. This eliminates the need for a bridge layer between auth and data access.

The main trade-off — manually storing the GitHub provider token — is a one-time implementation task in the `/auth/callback` route. The token does not expire (GitHub OAuth app tokens are long-lived), so there is no refresh complexity.

Specific implementation decisions:

- **OAuth scopes:** `user:email` (default) + `read:org` (for org membership). No `repo` scope — repository access is handled by GitHub App installation tokens, not user OAuth tokens.
- **Provider token storage:** Encrypt using Supabase Vault (`pgsodium`) and store in a `user_github_tokens` table (or similar). Supabase Vault handles key management.
- **Org membership caching:** Fetch from GitHub API on each login, cache in our database. Sufficient for V1 — no background refresh job needed.
- **Session management:** `@supabase/ssr` with Next.js middleware for automatic JWT refresh. Use `getClaims()` (not `getSession()`) for server-side auth validation.

## Consequences

- **Easier:** Auth and RLS work together out of the box. No bridge layer. Single user identity table (`auth.users`). Session refresh is automatic via middleware.
- **Easier:** No separate auth infrastructure to deploy or maintain. Supabase Auth is part of the Supabase project.
- **Harder:** Must capture provider token at exactly the right moment in the callback — missing it means the user must re-authenticate. Requires robust error handling.
- **Harder:** If we ever migrate away from Supabase, we must replace both the database and the auth system together.
- **Follow-up:** Provider token encryption approach (Supabase Vault) should be validated during Phase 2 (web app setup).
- **Follow-up:** The org membership cache strategy (refresh on login only) may need revisiting if users report stale org lists. A manual "refresh" button is a simple V2 addition.
- **Explicitly not doing:** NextAuth.js — adding a second auth system creates synchronisation overhead with no clear benefit when we are already on Supabase. Custom OAuth — too much implementation risk for no gain.

## References

- Research spike: `docs/design/spike-004-supabase-auth-github-oauth.md`
- Requirements: Stories 5.1 (GitHub OAuth Authentication), 1.2 (Organisation Dashboard Access), 1.5 (Multi-Tenancy Isolation)
- Related: ADR-0008 (Data model & multi-tenancy — RLS depends on Supabase Auth JWTs)
