# Research Spike #4: Supabase Auth + GitHub OAuth

## Document Control

| Field | Value |
|-------|-------|
| Issue | #4 |
| Status | Complete |
| Author | Claude |
| Created | 2026-03-05 |

## Questions Investigated

1. Can Supabase Auth handle GitHub OAuth with session management and token refresh?
2. Can we get the user's GitHub org list from the Supabase session?
3. What are the minimum OAuth scopes needed?
4. What are the architectural implications for our Next.js app?

---

## Finding 1: OAuth Flow (PKCE)

Supabase Auth uses **PKCE (Proof Key for Code Exchange)** for server-side Next.js apps.

### Background: What is PKCE?

Standard OAuth has a problem: someone could intercept the authorisation code in the redirect URL and exchange it for tokens. PKCE prevents this. Before starting the flow, the client generates a random secret (code verifier) and a hash of it (code challenge). The challenge is sent with the initial request; the verifier is sent when exchanging the code. The server only issues tokens if the verifier matches the challenge. An interceptor who only sees the redirect URL cannot produce the verifier.

### The sign-in flow, step by step

```
  Browser                  Our Next.js App            Supabase Auth              GitHub
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 1: User clicks "Sign in with GitHub"          │                        │
    │  ─────────────────────────────────────────          │                        │
    │                          │                           │                        │
    │  click ─────────────────►│                           │                        │
    │                          │                           │                        │
    │                          │  Client-side JS calls:    │                        │
    │                          │  signInWithOAuth({        │                        │
    │                          │    provider: 'github',    │                        │
    │                          │    scopes: 'read:org'     │                        │
    │                          │  })                       │                        │
    │                          │                           │                        │
    │                          │  This generates a PKCE    │                        │
    │                          │  code_verifier (random    │                        │
    │                          │  secret, stored in        │                        │
    │                          │  browser memory) and      │                        │
    │                          │  code_challenge (hash     │                        │
    │                          │  of verifier).            │                        │
    │                          │                           │                        │
    │                          │  Returns a URL to         │                        │
    │                          │  redirect the browser to. │                        │
    │                          │                           │                        │
    │◄─────────────────────────┤                           │                        │
    │  Redirect URL:           │                           │                        │
    │  https://proj.supabase.co/auth/v1/authorize          │                        │
    │    ?provider=github      │                           │                        │
    │    &scopes=read:org      │                           │                        │
    │    &code_challenge=xyz   │                           │                        │
    │    &redirect_to=/auth/callback                       │                        │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 2: Browser goes to Supabase, which redirects to GitHub                  │
    │  ───────────────────────────────────────────────────────────                  │
    │                          │                           │                        │
    │  GET ────────────────────┼──────────────────────────►│                        │
    │                          │                           │                        │
    │                          │                           │  Supabase redirects    │
    │                          │                           │  browser to GitHub:    │
    │                          │                           │                        │
    │◄─────────────────────────┼───────────────────────────┤                        │
    │  Redirect to:            │                           │                        │
    │  github.com/login/oauth/authorize                    │                        │
    │    ?client_id=SUPABASE_APP_ID                        │                        │
    │    &scope=user:email+read:org                        │                        │
    │                          │                           │                        │
    │  GET ────────────────────┼───────────────────────────┼───────────────────────►│
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 3: User sees GitHub consent screen and clicks "Authorize"               │
    │  ──────────────────────────────────────────────────────────────               │
    │                          │                           │                        │
    │                          │                           │     ┌──────────────┐   │
    │                          │                           │     │ "FCS Tool    │   │
    │                          │                           │     │  wants to    │   │
    │                          │                           │     │  access your │   │
    │                          │                           │     │  account"    │   │
    │                          │                           │     │              │   │
    │                          │                           │     │ [Authorize]  │   │
    │                          │                           │     └──────────────┘   │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 4: GitHub redirects back to Supabase with a GitHub auth code            │
    │  ─────────────────────────────────────────────────────────────────            │
    │                          │                           │                        │
    │                          │                           │◄───────────────────────┤
    │                          │                           │  Redirect to:          │
    │                          │                           │  proj.supabase.co      │
    │                          │                           │    /auth/v1/callback   │
    │                          │                           │    ?code=GH_AUTH_CODE  │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 5: Supabase does all the heavy lifting (server-to-server, no browser)   │
    │  ──────────────────────────────────────────────────────────────────────────   │
    │                          │                           │                        │
    │                          │                           │  5a. POST to GitHub:   │
    │                          │                           │      exchange          │
    │                          │                           │      GH_AUTH_CODE for  │
    │                          │                           │      GH_ACCESS_TOKEN   │
    │                          │                           │─────────────────────── │
    │                          │                           │      (this is the      │
    │                          │                           │       provider_token   │
    │                          │                           │       — a GitHub OAuth │
    │                          │                           │       access token     │
    │                          │                           │       that never       │
    │                          │                           │       expires)         │
    │                          │                           │                        │
    │                          │                           │  5b. GET /user         │
    │                          │                           │      using GH token    │
    │                          │                           │      → name, email,    │
    │                          │                           │        avatar, etc.    │
    │                          │                           │───────────────────────►│
    │                          │                           │◄───────────────────────┤
    │                          │                           │                        │
    │                          │                           │  5c. Creates/updates   │
    │                          │                           │      user record in    │
    │                          │                           │      Supabase DB       │
    │                          │                           │      (auth.users       │
    │                          │                           │       table)           │
    │                          │                           │                        │
    │                          │                           │  5d. Creates a         │
    │                          │                           │      Supabase session: │
    │                          │                           │      generates a       │
    │                          │                           │      SUPABASE_CODE     │
    │                          │                           │      (short-lived,     │
    │                          │                           │       one-time-use)    │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 6: Supabase redirects browser to OUR app with the Supabase code         │
    │  ────────────────────────────────────────────────────────────────────         │
    │                          │                           │                        │
    │◄─────────────────────────┼───────────────────────────┤                        │
    │  Redirect to:            │                           │                        │
    │  our-app.com/auth/callback?code=SUPABASE_CODE        │                        │
    │                          │                           │                        │
    │  NOTE: This is a SUPABASE code, NOT a GitHub code.   │                        │
    │  GitHub is done. From here it is between our app     │                        │
    │  and Supabase only.      │                           │                        │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 7: Our callback route exchanges the code for a full session              │
    │  ────────────────────────────────────────────────────────────────             │
    │                          │                           │                        │
    │  GET /auth/callback ────►│                           │                        │
    │    ?code=SUPABASE_CODE   │                           │                        │
    │                          │                           │                        │
    │                          │  Our server-side code:    │                        │
    │                          │  exchangeCodeForSession(  │                        │
    │                          │    SUPABASE_CODE           │                        │
    │                          │  )                        │                        │
    │                          │  (also sends the PKCE     │                        │
    │                          │   code_verifier to prove  │                        │
    │                          │   we are the original     │                        │
    │                          │   requester)              │                        │
    │                          │                           │                        │
    │                          │  POST ───────────────────►│                        │
    │                          │                           │                        │
    │                          │                           │  Verifies PKCE:        │
    │                          │                           │  hash(code_verifier)   │
    │                          │                           │  == code_challenge?    │
    │                          │                           │  ✓ Yes → issue tokens  │
    │                          │                           │                        │
    │                          │◄──────────────────────────┤                        │
    │                          │                           │                        │
    │                          │  Supabase returns THREE things:                    │
    │                          │                           │                        │
    │                          │  ┌─────────────────────────────────────────┐       │
    │                          │  │ 1. ACCESS TOKEN (JWT)                   │       │
    │                          │  │    - Signed by Supabase                 │       │
    │                          │  │    - Contains: user_id, email, role     │       │
    │                          │  │    - Expires in 1 hour                  │       │
    │                          │  │    - Used to authenticate every request │       │
    │                          │  │      to our app and to Supabase DB     │       │
    │                          │  │                                         │       │
    │                          │  │ 2. REFRESH TOKEN                        │       │
    │                          │  │    - Opaque random string (not a JWT)   │       │
    │                          │  │    - Does not expire on its own         │       │
    │                          │  │    - Single-use: exchanged for a NEW    │       │
    │                          │  │      access token + NEW refresh token   │       │
    │                          │  │      when the access token expires      │       │
    │                          │  │    - This is how sessions last longer   │       │
    │                          │  │      than 1 hour without re-login       │       │
    │                          │  │                                         │       │
    │                          │  │ 3. PROVIDER TOKEN (GitHub OAuth token)  │       │
    │                          │  │    - The GitHub access token from       │       │
    │                          │  │      step 5a                            │       │
    │                          │  │    - Never expires (GitHub OAuth apps)  │       │
    │                          │  │    - Supabase passes it through ONCE    │       │
    │                          │  │      and then DISCARDS it               │       │
    │                          │  │    - We must save it ourselves or lose  │       │
    │                          │  │      it forever                         │       │
    │                          │  └─────────────────────────────────────────┘       │
    │                          │                           │                        │
    │                          │                           │                        │
    │  STEP 8: Our code stores everything and sets cookies                           │
    │  ──────────────────────────────────────────────────────                       │
    │                          │                           │                        │
    │                          │  a) Save provider_token   │                        │
    │                          │     (GitHub token) to     │                        │
    │                          │     our DB, encrypted     │                        │
    │                          │     (Supabase won't keep  │                        │
    │                          │      it for us)           │                        │
    │                          │                           │                        │
    │                          │  b) Fetch user's GitHub   │                        │
    │                          │     orgs using the token: │                        │
    │                          │     GET /user/orgs ───────┼───────────────────────►│
    │                          │     ◄─────────────────────┼───────────────────────┤│
    │                          │     Cache org list in DB  │                        │
    │                          │     (refreshed on every   │                        │
    │                          │      login — picks up     │                        │
    │                          │      org changes)         │                        │
    │                          │                           │                        │
    │                          │  c) Set cookies:          │                        │
    │                          │     - sb-access-token     │                        │
    │                          │       (the JWT)           │                        │
    │                          │     - sb-refresh-token    │                        │
    │                          │       (the refresh token) │                        │
    │                          │     @supabase/ssr does    │                        │
    │                          │     this automatically    │                        │
    │                          │                           │                        │
    │◄─────────────────────────┤                           │                        │
    │  Set-Cookie headers +    │                           │                        │
    │  Redirect to dashboard   │                           │                        │
    │                          │                           │                        │
    │                          │                           │                        │
    │  ═══════════════════════════════════════════════════════════════════           │
    │  User is now signed in. On every subsequent request:                           │
    │  ═══════════════════════════════════════════════════════════════════           │
    │                          │                           │                        │
    │  GET /dashboard ────────►│                           │                        │
    │  (cookies sent           │                           │                        │
    │   automatically)         │  Middleware runs first:   │                        │
    │                          │  - Reads JWT from cookie  │                        │
    │                          │  - Is JWT expired?        │                        │
    │                          │    No → proceed           │                        │
    │                          │    Yes → use refresh      │                        │
    │                          │      token to get new     │                        │
    │                          │      JWT from Supabase,   │                        │
    │                          │      update cookies       │                        │
    │                          │                           │                        │
    │◄─────────────────────────┤                           │                        │
    │  Page HTML + updated     │                           │                        │
    │  cookies (if refreshed)  │                           │                        │
```

### What lives where after sign-in

| Token | Where it is stored | Who manages it | Lifetime |
|-------|-------------------|----------------|----------|
| **Access token (JWT)** | Browser cookies (set by `@supabase/ssr`) | Supabase + our middleware (auto-refresh) | 1 hour, then refreshed |
| **Refresh token** | Browser cookies (set by `@supabase/ssr`) | Supabase + our middleware | Until sign-out |
| **Provider token** (GitHub OAuth) | Our database (encrypted) | Us — we store it manually | Never expires (revoked after 1 year inactivity) |

**What Supabase handles:** GitHub OAuth communication, token exchange with GitHub, user creation/update in `auth.users`, session creation, JWT issuance, refresh token management.

**What we handle:** Triggering sign-in, the `/auth/callback` route handler, storing the GitHub provider token in our DB, fetching org membership, session refresh via middleware.

### Background: Next.js execution model

Next.js runs code in three places:

| Where | What runs there | Example in our app |
|-------|----------------|-------------------|
| **Server** | Page rendering (HTML generated on server, sent to browser), API route handlers, server actions | Webhook handler (`/api/webhooks/github`), assessment API routes, initial page loads |
| **Browser** | Interactive UI code after the page loads (click handlers, form submissions, navigation) | "Sign in" button click, answer submission form, org switcher dropdown |
| **Middleware** | Runs on the server *before* any page or API route. Can read and write cookies. | JWT refresh — checks if access token is expired, refreshes it, updates cookies |

Server-rendered pages are generated as HTML on the server and sent to the browser. The browser then "hydrates" them (attaches JavaScript event handlers) so they become interactive. This means our pages work even before JavaScript loads, but full interactivity requires the browser-side code.

---

## Finding 2: OAuth Scopes

**Default scope:** `user:email` only. This is insufficient for our needs.

**We must request `read:org`** at sign-in time:

```typescript
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: '/auth/callback',
    scopes: 'read:org',
  },
})
```

Additional scopes are appended to the default `user:email`. Multiple scopes are space-separated.

**Gotcha:** Scopes are requested at sign-in time only. If we later need a scope we did not originally request, the user must re-authenticate. We should request all needed scopes upfront.

**Required scopes for our app:**

| Scope | Purpose |
|-------|---------|
| `user:email` | Default. User identity. |
| `read:org` | List user's GitHub organisations (for org switcher, Story 1.2). |

We do NOT need `repo` or other elevated scopes for OAuth — repository access (reading PRs, writing Checks) is handled by the **GitHub App installation token**, not the user's OAuth token. These are separate authentication contexts.

---

## Finding 3: Provider Token — The Critical Gotcha

**Supabase does NOT persist the GitHub access token.** It is only available transiently at `exchangeCodeForSession()` time.

```typescript
// app/auth/callback/route.ts — the ONLY moment provider_token is available
const { data } = await supabase.auth.exchangeCodeForSession(code)
const githubToken = data.session?.provider_token       // GitHub access token
const githubRefresh = data.session?.provider_refresh_token  // null for OAuth apps
```

After this point, calls to `getSession()` or `getUser()` will **not** return the provider token.

**We must capture and store the GitHub token ourselves** in the callback handler, then persist it (encrypted) in our database for later GitHub API calls.

### Why encrypted? What is the threat?

The GitHub provider token is a credential that grants access to the user's GitHub account (within the scopes we requested). If stored in plaintext and an attacker gains database read access (SQL injection, leaked backup, compromised Supabase credentials), they could use every stored token to call the GitHub API as those users.

Our token only has `read:org` scope (read-only), so the blast radius is limited — an attacker could list users' organisations but not modify anything or access code. Still, it is a credential and should be treated as one.

**Encryption options:**

| Approach | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Supabase Vault** (`pgsodium`) | Built into Supabase. Call `vault.create_secret(token)`, retrieve with `vault.decrypted_secrets`. Encryption keys managed by Supabase infrastructure. | Zero key management on our side. Encryption at rest in the DB. | Tied to Supabase. Key rotation is Supabase's responsibility. |
| **Application-level encryption** | Encrypt with `crypto.createCipheriv` (AES-256-GCM) in our Next.js code before writing to DB. Decryption key stored as environment variable. | Portable, not tied to Supabase. We control the key. | We manage key rotation. Key must be in env vars (still a secret to protect). |

**Recommendation:** Use **Supabase Vault** for V1. It is simpler, already integrated, and avoids us managing encryption keys. If we ever migrate away from Supabase, we switch to application-level encryption at that point.

**Good news:** GitHub OAuth app tokens do not expire. They are valid until revoked or after 1 year of inactivity. So we do not need refresh logic for the GitHub token — only for Supabase sessions.

---

## Finding 4: Session Management Details

The three tokens and the Next.js execution model are covered in the diagram above. This section adds implementation details.

### Why middleware is required

In Next.js App Router, server components can read cookies but **cannot write them**. Only middleware (which runs before any page) can both read and write cookies. This matters because when the JWT expires, someone needs to use the refresh token to get a new JWT and write the new cookie. That "someone" is the middleware.

```
Browser request → Middleware (can refresh JWT, write cookies) → Server component (reads JWT from cookie, renders page)
```

### Supabase client types in Next.js

| Context | Client factory | Used for |
|---------|---------------|----------|
| Client components (browser) | `createBrowserClient()` | Interactive UI (form submissions, button clicks) |
| Server components / route handlers | `createServerClient()` | Rendering pages, API route logic |
| Middleware | `createServerClient()` | JWT refresh before page rendering |

### Security note

In server-side code, always use `supabase.auth.getClaims()` (validates JWT signature against Supabase's public keys) rather than `getSession()` (reads cookies without revalidation — a spoofed cookie would be accepted).

---

## Finding 5: Org Membership Is NOT in the Supabase Session

**The Supabase JWT contains only Supabase claims** (user ID, email, role, session ID). It does not contain GitHub-specific data like organisation membership.

**To get org membership, we must:**

1. Store the GitHub provider token at sign-in (Finding 3).
2. Call the GitHub API ourselves:

```typescript
const response = await fetch('https://api.github.com/user/orgs', {
  headers: {
    Authorization: `Bearer ${storedGitHubToken}`,
    Accept: 'application/vnd.github.v3+json',
  },
})
```

3. This requires the `read:org` scope (Finding 2).

**Implication for Story 1.2 (org switcher):** The org list must be fetched from GitHub on first sign-in and cached in our database. We can refresh it periodically or on demand.

---

## Finding 6: What Supabase Stores About the User

From GitHub, Supabase stores in `auth.users.raw_user_meta_data`:

| Field | Source |
|-------|--------|
| `sub` | GitHub user ID |
| `name` | GitHub display name |
| `preferred_username` / `user_name` | GitHub login handle |
| `avatar_url` | Profile picture URL |
| `email` | Primary verified email |
| `email_verified` | Boolean |
| `provider_id` | GitHub user ID |

This is sufficient for user identity. Org membership, repo access, and other GitHub-specific data are NOT stored by Supabase — we fetch those ourselves.

---

## Finding 7: Two Separate GitHub Authentication Contexts

This is a critical architectural distinction:

| Context | GitHub App (installation token) | OAuth (user token via Supabase) |
|---------|-------------------------------|-------------------------------|
| **Who authenticates** | The app itself | The human user |
| **Token type** | Installation access token (short-lived, auto-refreshed) | OAuth access token (long-lived, stored by us) |
| **Permissions** | Configured in GitHub App settings (read PRs, write Checks, etc.) | OAuth scopes (`user:email`, `read:org`) |
| **Used for** | Webhook processing, reading PR diffs, writing Check Runs, reading code | User identity, org membership verification |
| **Triggered by** | Webhook events (server-to-server) | User actions in web UI |

The GitHub App installation token handles all PRCC automation (reading PRs, writing Checks). The user's OAuth token is only needed for identity and org membership.

### How webhook calls are authenticated (preview — detail in spike #3)

When GitHub sends a webhook to our `/api/webhooks/github` endpoint, there is no user involved — it is server-to-server. Authentication uses a **shared secret** (HMAC), not OAuth:

1. When registering the GitHub App, we configure a **webhook secret** (a random string we generate). GitHub stores it; we store it as an environment variable.
2. On every webhook delivery, GitHub includes a header: `X-Hub-Signature-256: sha256=<HMAC of request body>`.
3. Our webhook handler computes the same HMAC using our stored secret and compares. If they match, the request is genuinely from GitHub.

After verifying the webhook, if our handler needs to call the GitHub API (read PR diff, create Check Run), it uses a **GitHub App installation token** — a short-lived token the app generates for itself using its private key. This is entirely separate from any user's OAuth token. Full detail will be covered in spike #3.

---

## Implications for Design

### Must-do at sign-in

1. Request `read:org` scope in `signInWithOAuth()`.
2. Capture `provider_token` in `/auth/callback` route handler.
3. Store GitHub token encrypted in a `user_github_tokens` table (or similar).
4. Fetch and cache user's org list from GitHub API.

### Architecture decisions confirmed

| Decision | Confirmed |
|----------|-----------|
| Supabase Auth manages sessions | Yes — JWT + cookies + middleware refresh. Works well with Next.js. |
| GitHub is the identity provider | Yes — via Supabase's GitHub OAuth integration. |
| `@supabase/ssr` for Next.js | Yes — required for server-side session management. |
| We store the GitHub token ourselves | Yes — Supabase does not persist it. |
| Org membership via GitHub API | Yes — not available from Supabase session. Requires `read:org` scope. |

### Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| GitHub token not captured at sign-in | Cannot fetch org membership or make GitHub API calls on behalf of user | Robust error handling in callback; re-auth flow if token missing |
| `read:org` scope not requested | `/user/orgs` returns 403 | Always include scope in sign-in call; validate on first use |
| GitHub token revoked (user deauthorises) | API calls fail | Detect 401 responses, prompt re-authentication |
| Cookie-based sessions fail in some browsers | Session lost | Standard concern with all cookie-based auth; `@supabase/ssr` handles SameSite etc. |
| Database breach exposes GitHub tokens | Attacker can call GitHub API as our users (read-only: `read:org` scope) | Encrypt tokens at rest using Supabase Vault. Limit OAuth scopes to minimum needed. |

---

## Answers to Spike Questions

| Question | Answer |
|----------|--------|
| Can Supabase Auth handle session management? | **Yes.** JWT + refresh token in cookies, auto-refreshed via middleware. |
| Can Supabase Auth handle token refresh? | **Yes** for Supabase sessions. **No** for GitHub tokens (but GitHub OAuth tokens do not expire). |
| Can we get the user's GitHub org list from the Supabase session? | **No.** We must call the GitHub API separately using the stored provider token with `read:org` scope. |
| Minimum OAuth scopes needed? | `user:email` (default) + `read:org` (for org membership). |

---

## References

- [Supabase Docs: Login with GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Supabase Docs: Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Docs: Creating a Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Docs: User Sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth source: GitHub provider](https://github.com/supabase/auth/blob/master/internal/api/provider/github.go)
- [GitHub Docs: OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [GitHub Docs: REST API for organisations](https://docs.github.com/en/rest/orgs/orgs)
