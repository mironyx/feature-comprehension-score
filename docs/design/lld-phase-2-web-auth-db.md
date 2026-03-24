# Low-Level Design: Phase 2 — Web App + Auth + Database

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.9 |
| Status | Revised |
| Author | LS / Claude |
| Created | 2026-03-16 |
| Revised | 2026-03-19 (Issue #52) |
| Revised | 2026-03-20 (Issue #50) |
| Revised | 2026-03-20 (Issue #51) |
| Revised | 2026-03-21 (Issue #53) |
| Revised | 2026-03-24 (Issue #54) |
| Revised | 2026-03-24 (Issue #55) |
| Revised | 2026-03-24 (Issue #56) |
| Revised | 2026-03-24 (Issue #57) |
| Parent | [v1-design.md](v1-design.md) |
| Implementation plan | [Phase 2](../plans/2026-03-09-v1-implementation-plan.md#phase-2-web-app--auth--database) |

---

## 2.1 Database Schema and Migrations

**Stories:** 1.5, ADR-0008
**Layers:** DB

### HLD coverage assessment

- [§4.1 Database Schema](v1-design.md#41-database-schema) — sufficient for table DDL, referenced only
- [§4.2 Database Functions](v1-design.md#42-database-functions) — sufficient, referenced only
- [§4.3 RLS Policies](v1-design.md#43-row-level-security-policies) — sufficient, referenced only
- Migration strategy, schema drift, seed data, test isolation — needs extension below

### Database

#### Current state

Four migrations already exist from Phase 1 scaffolding:

| Migration | Content | Status |
|-----------|---------|--------|
| `20260309000001_core_tables.sql` | `organisations`, `org_config`, `repositories`, `repository_config`, `user_organisations`, `user_github_tokens` | Deployed |
| `20260309000002_assessment_tables.sql` | `assessments`, `assessment_questions`, `assessment_participants`, `participant_answers`, `fcs_merged_prs`, `sync_debounce` | Deployed |
| `20260309000003_functions.sql` | `get_user_org_ids()`, `is_org_admin()`, `is_assessment_participant()`, `link_participant()`, `get_effective_config()`, pgsodium key | Deployed |
| `20260309000004_rls_policies.sql` | All RLS policies per §4.3 | Deployed |

#### Schema drift: v0.8 design changes

The v0.8 design revision (ADR-0005 Option 4: self-directed view) added columns to `participant_answers` that are **not yet in the deployed migration**:

| Column | Type | Purpose |
|--------|------|---------|
| `score` | `numeric(3,2) CHECK (score IS NULL OR score BETWEEN 0.0 AND 1.0)` | Individual answer score (FCS self-view) |
| `score_rationale` | `text` | LLM-generated explanation of score |
| `is_reassessment` | `boolean NOT NULL DEFAULT false` | Distinguishes re-assessment answers (Story 3.6) |

Additionally:
- `attempt_number` CHECK constraint needs updating: `CHECK (attempt_number >= 1 AND (NOT is_reassessment AND attempt_number <= 3 OR is_reassessment))`
- UNIQUE constraint needs updating: `UNIQUE (participant_id, question_id, is_reassessment, attempt_number)`
- Missing index: `idx_answers_participant ON participant_answers (participant_id)`

**Approach:** Create a new migration (`20260316000001_participant_answers_v08.sql`) to add these columns, update constraints, and add the missing index. Do not modify existing migrations — they may already be applied in local environments.

The TypeScript types file (`src/lib/supabase/types.ts`) also needs updating to include these new columns.

> **Implementation note (issue #50):** The spec did not specify explicit constraint names for the updated CHECK and UNIQUE constraints, relying on PostgreSQL auto-generation. In practice the auto-generated UNIQUE constraint name truncated to `participant_answers_participant_id_question_id_attempt_numb_key` (old) and would have truncated `is_reassessment` to `is_reassessm` for the new one — making future migrations that reference the name by derivation unreliable. Both constraints were given short explicit names: `chk_answers_attempt_number` and `uq_answers_participant_question_reassessment`. Future migrations should follow this pattern: always provide explicit constraint names rather than relying on auto-generation when column name combinations exceed ~35 characters.
>
> **Implementation note (issue #50):** Story 3.6 (re-assessment endpoint and business logic) has been deferred post-MVP. The `is_reassessment` column is retained as scaffolding — it costs nothing and avoids a future migration — but the `POST /api/assessments/[id]/reassess` endpoint and the re-assessment flow are not in scope until requirements are revisited.

#### Seed data strategy

Seed data lives in `supabase/seed.sql` and is loaded by `supabase db reset`. Provides a consistent baseline for local development and integration tests.

**Seed scenario:**

| Entity | Data |
|--------|------|
| Organisations | 2: `acme-corp` (active), `beta-inc` (active) |
| Org config | 1 per org with different defaults (acme: soft/70, beta: hard/80) |
| Repositories | 3: `acme/api` (active), `acme/web` (active), `beta/platform` (active) |
| Repository config | 1: `acme/web` overrides `prcc_question_count = 5` |
| Users (auth.users) | 3: `alice` (admin of acme), `bob` (member of acme), `carol` (admin of beta) |
| User orgs | Alice → acme (admin), Bob → acme (member), Carol → beta (admin) |
| Assessments | 2: one PRCC (acme/api, awaiting_responses), one FCS (acme/web, completed) |
| Questions | 3 per assessment |
| Participants | Alice + Bob on PRCC; Alice on FCS (submitted) |
| Answers | Alice's FCS answers (with scores for self-view testing) |

**Auth user seeding:** Supabase local dev supports seeding `auth.users` directly via SQL. Use fixed UUIDs for deterministic test data.

**UUID scheme for all seed entities** (each entity type gets its own UUID segment to avoid ambiguity in logs and error output):

```sql
-- Auth users:   a0000000-0000-0000-0000-00000000000{1,2,3}
-- Orgs:         00000000-0000-0000-0000-00000000000{1,2}
-- Repos:        00000000-0000-0000-0001-00000000000{1,2,3}
-- Assessments:  00000000-0000-0000-0002-00000000000{1,2}
-- Questions:    00000000-0000-0000-0003-00000000000{1..6}
-- Participants: 00000000-0000-0000-0004-00000000000{1..3}
-- Answers:      00000000-0000-0000-0005-00000000000{1..3}
```

> **Implementation note (issue #51):** The original spec assigned auth users UUIDs in the `00000000-0000-0000-0000-*` range (same as organisations). This caused ambiguity — the same UUID string could refer to either entity when reading test output or error messages. Auth user UUIDs were changed to use the `a0000000-0000-0000-0000-*` prefix. The pattern was also extended to all seed entities (repos, assessments, questions, participants, answers) to make any UUID instantly identifiable by its segment value.

#### Test factory functions

TypeScript factory functions for creating test data programmatically in integration tests. Located in `tests/helpers/factories.ts`.

```typescript
// tests/helpers/factories.ts

// Actual signatures as implemented:
function createTestOrg(client: SupabaseClient<Database>, overrides?: Partial<OrgRow>): Promise<string>
function createTestRepo(client: SupabaseClient<Database>, orgId: string, overrides?: Partial<RepoRow>): Promise<string>
function createTestAssessment(client: SupabaseClient<Database>, orgId: string, repositoryId: string, overrides?: Partial<AssessmentRow>): Promise<string>
function createTestParticipant(client: SupabaseClient<Database>, orgId: string, assessmentId: string, overrides?: Partial<ParticipantRow>): Promise<string>
function createTestQuestion(client: SupabaseClient<Database>, orgId: string, assessmentId: string, overrides?: Partial<QuestionRow>): Promise<string>
function createTestAnswer(client: SupabaseClient<Database>, options: CreateTestAnswerOptions): Promise<string>

interface CreateTestAnswerOptions {
  orgId: string;
  assessmentId: string;
  participantId: string;
  questionId: string;
  overrides?: Partial<AnswerRow>;
}
```

> **Implementation note (issue #51):** The spec showed named option interfaces (`CreateOrgOptions`, etc.) with camelCase field names. The implementation uses `Partial<XRow>` (generated database types) directly as the overrides parameter — this was the pattern already established by existing factories in the codebase, and avoids maintaining a parallel interface layer. All factory functions return `string` (the created row's `id`) rather than the full typed row. `createTestAnswer` uses a structured `CreateTestAnswerOptions` because it has four required foreign-key fields that cannot be expressed cleanly as overrides.

Factories use the Supabase **service role client** (bypasses RLS) so they can set up arbitrary test state. Each factory generates sensible defaults but allows overrides for any field.

#### Test isolation

Each integration test gets a clean database state. Two approaches evaluated:

1. **Transaction rollback** — Wrap each test in a transaction that rolls back. Fast but doesn't test commit behaviour.
2. **Truncation** — `TRUNCATE ... CASCADE` all tables between tests. Slightly slower but tests real commits.

**Decision:** Use truncation. A `resetDatabase()` helper in `tests/helpers/db.ts` cleans all public tables. Called in `beforeEach` for integration test suites.

> **Implementation note (issue #51):** The spec described `TRUNCATE ... CASCADE` and re-seeding auth users after truncation. The implementation uses cascade `DELETE` (not `TRUNCATE`) starting from root tables — `user_github_tokens` first (no org FK), then `organisations` (cascades to all other public tables). This is simpler than enumerating leaf tables for truncation order and has the same effect. Auth users are **not** cleared or re-seeded by `resetDatabase()` — the helper only cleans public schema tables. Use `createTestUser` / `deleteTestUser` from `tests/helpers/supabase.ts` to manage auth users in tests that require them. Additionally, `fileParallelism: false` was added to `vitest.config.ts` to prevent DB state races when multiple integration test files share the same local Supabase instance.

#### Declarative schema adoption

**Context:** The project currently uses hand-written migration files. Supabase's declarative schema feature allows defining the full desired schema state in `.sql` files under `supabase/schemas/`, then generating migrations automatically via `supabase db diff`.

**Rationale:** Schema files are the readable source of truth (full table definition visible in one place); migrations become generated artefacts rather than hand-authored ALTER statements. Reduces drift risk and manual error.

**Tasks:**

1. Create `supabase/schemas/` directory with three files consolidating current migrations:
   - `tables.sql` — all `CREATE TABLE` statements (from migrations 1, 2, and `context_file_patterns`)
   - `functions.sql` — all `CREATE FUNCTION` and `CREATE OR REPLACE FUNCTION` (from migrations 3 and `get_effective_config_context_patterns`)
   - `policies.sql` — all `CREATE POLICY` statements (from migration 4)
2. Verify local DB state matches the consolidated schema files (`supabase db diff` should produce empty output)
3. Update CLAUDE.md migration workflow: "Edit the relevant `supabase/schemas/*.sql` file → run `supabase db diff -f <name>` → commit both the updated schema file and generated migration"

**Convention going forward:** All schema changes start with editing the schema file; migrations are generated, never hand-authored. Add a comment header to each generated migration referencing the issue number and design doc section.

---

## 2.2 GitHub OAuth Authentication

**Stories:** 5.1
**Layers:** BE, FE

### HLD coverage assessment

- [§3.3 Auth/Session Flow](v1-design.md#33-authsession-flow) — covers the sequence; referenced only
- [§4.1 user_github_tokens](v1-design.md#user_github_tokens) — schema sufficient, referenced only
- PKCE flow detail, callback implementation, middleware chain, Supabase SSR setup — needs extension below

### Backend

#### Supabase SSR client setup

The existing `src/lib/supabase/client.ts` creates a browser client. Phase 2 needs server-side clients for:

1. **Server Component client** — reads cookies, used in RSC data fetching
2. **Route Handler client** — reads/writes cookies, used in API routes
3. **Middleware client** — refreshes JWT on every request
4. **Service Role client** — bypasses RLS, used by webhook handler and factories

```
src/lib/supabase/
  client.ts            — existing browser client (keep)
  env.ts               — shared env var validation (new)
  server.ts            — server component client (new)
  route-handler.ts     — route handler client (new)
  middleware.ts        — middleware client (new)
  service-role.ts      — service role client (new)
```

> **Implementation note (issue #52):** `env.ts` was added as a shared module to eliminate
> copy-pasted env var validation across all four client files. It exports `supabaseUrl` and
> `supabasePublishableKey` using a `?? IIFE` pattern that narrows the type to `string` (TypeScript
> does not narrow across conditional throws without the IIFE). The service role key is
> intentionally **not** exported from `env.ts` — it is consumed only in `service-role.ts` to
> prevent accidental use elsewhere.
>
> **Post-implementation correction (issue #82, smoke test):** The original `env.ts` used
> `process.env[key]` with a dynamic variable key. Next.js inlines `NEXT_PUBLIC_` vars at
> compile time via static property access only — `process.env[key]` returns `undefined` in the
> browser bundle. Fixed to use `process.env.NEXT_PUBLIC_SUPABASE_URL` and
> `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` directly, with the key passed as a label
> argument for the error message only.

`server.ts`, `route-handler.ts`, and `middleware.ts` use `createServerClient` from `@supabase/ssr`.
The middleware client writes cookies to **both** the incoming `NextRequest` (so downstream
server code sees the refreshed token in the same request cycle) and the outgoing `NextResponse`
(so the browser receives the new cookie).

> **Implementation note (issue #52):** The Server Component client's `setAll` callback must be
> wrapped in `try-catch`. `cookieStore.set()` throws inside React Server Components because RSCs
> cannot set cookies directly; only middleware can. Silently swallowing the error is the correct
> pattern — the middleware will handle the refresh on the next request.
>
> **Implementation note (issue #52):** The Service Role client uses `createClient` from
> `@supabase/supabase-js` — **not** `createServerClient` from `@supabase/ssr`. Using
> `createServerClient` for service role is a correctness bug: the SSR client inspects the
> request cookies and can override the `Authorization` header with the user's JWT, silently
> downgrading admin access to a user-scoped session. `createClient` with
> `{ auth: { persistSession: false, autoRefreshToken: false } }` is the correct pattern.

#### Auth callback route

```
src/app/auth/
  callback/route.ts    — OAuth callback handler
```

The callback route handles the Supabase PKCE code exchange and provider token capture:

```typescript
// src/app/auth/callback/route.ts

export async function GET(request: NextRequest): Promise<NextResponse> {
  // 1. Extract 'code' from query params
  // 2. Exchange code for session via supabase.auth.exchangeCodeForSession(code)
  // 3. Extract provider_token from session
  // 4. Encrypt and store in user_github_tokens (upsert)
  // 5. Trigger org membership sync (§2.3)  ← deferred to issue #54
  // 6. Redirect to /assessments (or stored returnTo URL)
}
```

> **Implementation note (issue #53):** The spec showed `storeProviderToken` as a separate helper
> function. The implementation inlines the service role RPC call directly in the GET handler — there
> is only one call site and no reuse benefit justifies the indirection.
>
> **Implementation note (issue #53):** Org membership sync (step 5) was deferred to §2.3.
> The callback redirects unconditionally to `/assessments` after storing the token.
> `returnTo` URL support was also deferred — hardcoded redirect is sufficient for Phase 2.

**Provider token capture:** The provider token is only available during the initial OAuth callback — Supabase does not store it. The RPC call is made directly from the GET handler:

```typescript
const serviceClient = createServiceRoleSupabaseClient();
await serviceClient.rpc('store_github_token', {
  p_user_id: user.id,
  p_token: provider_token,
});
```

**Database function for token storage:**

A new function `store_github_token(p_user_id uuid, p_token text)` handles encryption and upsert. This keeps the encryption logic in the database layer where pgsodium operates. Added to migration `20260321102925_store_github_token_fn.sql`.

#### Session middleware

```typescript
// src/middleware.ts (Next.js middleware)

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // 1. Create Supabase middleware client
  // 2. Call supabase.auth.getUser() — this refreshes the JWT if expired
  // 3. If no session and path requires auth: redirect to /auth/sign-in
  // 4. If session valid: pass through with updated cookies
}

export const config = {
  matcher: [
    // Match all routes except static files, auth callback, and public pages
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/webhooks/).*)',
  ],
};
```

**Public routes** (no auth required): `/auth/sign-in`, `/auth/callback`, `/api/webhooks/github`.

> **Implementation note (issue #53):** The spec listed `/` as a public route. The implementation
> protects `/` (unauthenticated requests redirect to `/auth/sign-in`). The matcher pattern excludes
> only `auth/` and `api/webhooks/` prefixes — the root path is protected. This is the correct
> behaviour: the home/assessments view requires authentication.

#### Sign-in page

```
src/app/auth/
  sign-in/page.tsx     — sign-in page with GitHub OAuth button
```

Minimal page with a "Sign in with GitHub" button. The page is split into two files:

```
src/app/auth/sign-in/
  page.tsx          — server component: reads ?error query param, renders SignInButton
  SignInButton.tsx  — client component ('use client'): calls signInWithOAuth on click
```

> **Implementation note (issue #53):** The spec specified a single `page.tsx`. The implementation
> splits into server page + `SignInButton.tsx` client component. Next.js App Router requires
> `'use client'` for interactive elements; the server component handles the `?error` query param
> (which is a `Promise` in Next.js 15 and must be `await`ed in a server component).
>
> The `SignInButton` also handles runtime OAuth initiation errors (e.g. popup blocked): on error it
> resets the loading state and displays the error message. This is in addition to the `?error`
> query param handling in the spec's error table.

`SignInButton` calls `supabase.auth.signInWithOAuth({ provider: 'github' })` with the callback URL set to `/auth/callback`. PKCE is enabled by default in `@supabase/ssr`.

**OAuth scopes:** `user:email`, `read:user` — must be passed explicitly in `signInWithOAuth` client code (see correction below); dashboard configuration alone is insufficient.

> **Post-implementation corrections (issue #82, smoke test):**
>
> 1. **Browser client must use `createBrowserClient` from `@supabase/ssr`**, not `createClient`
>    from `@supabase/supabase-js`. The vanilla `createClient` defaults to implicit flow, which
>    returns the session as a URL fragment (`#access_token=...`). Fragments are not sent to the
>    server, so the `/auth/callback` route never receives the `code` parameter. PKCE (which sends
>    `?code=...` as a query parameter) requires `createBrowserClient` from `@supabase/ssr`.
>
> 2. **OAuth scopes must also be passed in `signInWithOAuth` client code**, not only in the
>    Supabase dashboard. GitHub returns 403 on `/user/emails` without the `user:email` scope
>    explicitly requested. Required scopes: `user:email read:user`. The dashboard configuration
>    alone is insufficient.
>
> 3. **pgsodium deployment gap:** `store_github_token` requires `pgsodium` to be enabled and
>    `postgres` to have execute permission on `crypto_aead_det_encrypt`. On Supabase cloud,
>    the extension enable can be done via migration but the GRANT cannot — pgsodium crypto
>    functions are owned by the system superuser and `postgres` lacks grant option. Token
>    storage is currently non-functional on cloud. Under investigation: Supabase Vault as
>    alternative. Tracked in issue #82.

#### Sign-out

```
src/app/auth/
  sign-out/route.ts    — sign-out handler
```

Calls `supabase.auth.signOut()` and redirects to `/auth/sign-in`.

#### Error handling

| Error | Handling |
|-------|----------|
| Missing `code` param in callback | Redirect to `/auth/sign-in?error=missing_code` |
| Code exchange fails | Redirect to `/auth/sign-in?error=auth_failed` |
| Provider token missing | Log warning, continue (token may be captured on next sign-in) |
| Token encryption fails | Log error, continue (FCS flows will fail gracefully later) |

### Frontend

#### Sign-in page UI states

| State | Trigger | Display |
|-------|---------|---------|
| Default | Page load | "Sign in with GitHub" button |
| Loading | Button clicked | Spinner, button disabled |
| Error | `?error` query param | Error message above button |

---

## 2.3 Organisation Membership and Selection

**Stories:** 1.2, 5.2
**Layers:** BE, FE

### HLD coverage assessment

- [§3.3 Auth/Session Flow](v1-design.md#33-authsession-flow) — covers org selection; referenced only
- Org sync logic, multi-org UX, session storage — needs extension below

### Backend

#### Org membership sync

Called during auth callback (§2.2) after session is established. Fetches the user's GitHub org memberships and reconciles with `user_organisations`.

```
src/lib/supabase/
  org-sync.ts          — org membership sync logic
```

```typescript
// src/lib/supabase/org-sync.ts

/** Fetches a GitHub API endpoint; throws on non-2xx. */
async function githubFetch<T>(url: string, headers: Record<string, string>): Promise<T>

export async function syncOrgMembership(
  serviceClient: SupabaseClient<Database>,
  userId: string,
  providerToken: string,
): Promise<UserOrganisation[]>
```

**GitHub API calls (actual):** Uses the **live session provider token** directly — not a decrypted stored token. Three GitHub endpoints are used:

- `GET /user` — user identity (`id`, `login`); fetched in parallel with `/user/orgs`
- `GET /user/orgs` — list of orgs the user belongs to
- `GET /orgs/{org}/memberships/{username}` — role per org (one call per installed org, concurrent)

> **Implementation note (issue #54):** The spec said "decrypted from `user_github_tokens`". The actual implementation uses the session's live `provider_token` passed directly from the auth callback. Decrypting a stored token is unnecessary — the live token is available at sign-in time and is the freshest credential.

**Error handling (actual, not in original spec):**

| Failure | Behaviour |
|---------|-----------|
| Initial `/user` or `/user/orgs` fetch fails (network / GitHub 5xx) | Catch, log, preserve existing rows, return |
| `organisations` DB query fails | Check `.error`, log, preserve existing rows, return |
| Per-org membership fetch returns 5xx/4xx (not 404) | Mark as transient error; after all fetches, if any error → preserve all rows |
| Per-org membership fetch returns 404 | Confirmed non-member; treat as removed |

`syncOrgMembership` is **no-throw** by design. All failure modes return existing rows rather than deleting memberships incorrectly. The auth callback does not wrap it in try/catch.

> **Implementation note (issue #54):** The spec contained no error handling. Post-review analysis identified that unhandled throws from the initial GitHub fetch would silently swallow errors in the callback. All error paths now preserve existing memberships rather than risking false deletions.

**Stale membership removal:** If a user is removed from a GitHub org between sign-ins, their `user_organisations` row is deleted on next sync. This cascades to their visibility of that org's data via RLS.

**Tests (actual BDD specs — 7 total):**

- Given 2 installed orgs → both appear in `user_organisations`
- Given role changed since last login → `user_organisations` updated on sign-in
- Given org without app installed → does not appear in `user_organisations`
- Given removed from org → stale row deleted
- Given transient GitHub error on membership fetch → existing rows preserved
- Given GitHub server error on initial `/user/orgs` fetch → existing rows preserved _(added post-review, issue #54)_
- Given Supabase DB error querying installed orgs → existing rows preserved

**MSW mock factories** (in `tests/mocks/github.ts`):

```typescript
mockGitHubUser(user: {id: number; login: string})
mockUserOrgs(orgs: {id: number; login: string}[])
mockOrgMembershipRole(org: string, username: string, role: 'admin' | 'member')
```

#### Org selection storage

The selected org is stored in a cookie (`fcs-org-id`). Set by the org selection UI (§2.3 FE) and read by all API routes and server components.

```typescript
// src/lib/supabase/org-context.ts

// Type derived from the public next/headers API — avoids importing from internal next/dist paths.
type ReadonlyRequestCookies = Awaited<ReturnType<typeof nextCookies>>;

export function getSelectedOrgId(cookies: ReadonlyRequestCookies): string | null
export function setSelectedOrgId(response: NextResponse, orgId: string): void
```

> **Implementation note (issue #55):** `ReadonlyRequestCookies` is derived via
> `Awaited<ReturnType<typeof nextCookies>>` (importing `cookies as nextCookies` from
> `next/headers`) rather than importing from `next/dist/server/web/spec-extension/adapters/request-cookies`,
> which is an internal path and not a stable public contract.

If no org is selected and the user has exactly one org, auto-select it. If no org is selected and the user has multiple orgs, redirect to `/org-select`.

### Frontend

#### Org selection page

```
src/app/org-select/
  page.tsx             — org selection page (server component)
src/app/api/org-select/
  route.ts             — GET /api/org-select — sets fcs-org-id cookie and redirects
```

Displayed when a user with multiple orgs signs in and hasn't selected one yet, or when they click the org switcher.

> **Implementation note (issue #55):** A dedicated API route (`GET /api/org-select?orgId=...`) was
> added. Server components cannot set `httpOnly` cookies — only route handlers and middleware can.
> Single-org auto-redirect and the "Select" links both route through this handler, which validates
> auth (401) and org membership (403) before calling `setSelectedOrgId` and redirecting to
> `/assessments`.

#### Component tree

```
OrgSelectPage
  └── flat JSX (no sub-components)
        ├── Org name
        └── "Select" link (→ /api/org-select?orgId=...)
```

> **Implementation note (issue #55):** The spec prescribed `OrgList` and `OrgCard` sub-components
> with a repo count field. The implementation uses flat JSX in `page.tsx` — no sub-components were
> needed at this scale. `OrgCard` sub-component and repo count are deferred.
> _(OrgList / OrgCard sub-components — deferred)_
> _(Repo count in org card — deferred)_

#### Org switcher (header component)

```
src/components/
  org-switcher.tsx     — header org switcher
```

Renders the current org name. If multiple orgs are available, renders a list of links to switch org (each pointing to `/api/org-select?orgId=...`) plus an "All organisations" link to `/org-select`.

> **Implementation note (issue #55):** The spec described an interactive dropdown. The actual
> implementation is a static list of `<a>` links — no JavaScript interaction required. A full
> dropdown with click-to-open behaviour is deferred.

#### UI states

| State | Trigger | Display |
|-------|---------|---------|
| Loading | Fetching orgs | _(loading skeleton — deferred)_ |
| Single org | User has 1 org | Auto-redirect via `/api/org-select?orgId=...` → `/assessments` |
| Multiple orgs | User has 2+ orgs | Org list with select links |
| No orgs | User has no orgs with app installed | "No organisations found" message |

---

## 2.4 API Routes — Assessments

**Stories:** 2.4, 3.3, 5.3
**Layers:** BE

### HLD coverage assessment

- [§4.4 API Route Contracts](v1-design.md#44-api-route-contracts) — response shapes are definitive; referenced only
- Route handler structure, auth/org validation helpers, scoring trigger, error handling — needs extension below

### Backend

#### File structure

```
src/app/api/
  assessments/
    route.ts                       — GET /api/assessments (list)
    [id]/
      route.ts                     — GET /api/assessments/[id] (detail)
                                     PUT /api/assessments/[id] (skip/close)
      answers/
        route.ts                   — POST /api/assessments/[id]/answers
      reassess/
        route.ts                   — POST /api/assessments/[id]/reassess
```

#### Shared route utilities

```
src/lib/api/
  auth.ts              — extractUser(), requireAuth(), requireOrgAdmin()
  validation.ts        — validateBody()
  errors.ts            — ApiError class, error response helpers
  response.ts          — json(), paginated() response helpers
src/lib/supabase/
  route-handler-readonly.ts  — createReadonlyRouteHandlerClient()
```

> **Implementation note (issue #56):** `validateParams()` was listed in the spec but not implemented — deferred. A `route-handler-readonly.ts` helper was added to `src/lib/supabase/` because the auth functions only receive `request` (not `response`), so a client that performs a no-op `setAll` is needed to avoid middleware interference. This pattern is distinct from the existing `route-handler.ts` which requires both request and response.

```typescript
// src/lib/api/auth.ts

/** Extract authenticated user from Supabase session. Returns null if unauthenticated.
 *  Throws ApiError(500) if Supabase returns an error (infrastructure failure). */
async function extractUser(request: NextRequest): Promise<AuthUser | null>

/** Require authentication. Throws ApiError(401) if not authenticated. */
async function requireAuth(request: NextRequest): Promise<AuthUser>

/** Require Org Admin role.
 *  Throws ApiError(403) if not admin; ApiError(500) on DB query failure. */
async function requireOrgAdmin(request: NextRequest, orgId: string): Promise<AuthUser>

interface AuthUser {
  id: string;
  email: string;
  githubUserId: number;
  githubUsername: string;
}
```

> **Implementation note (issue #56):** Both `extractUser` and `requireOrgAdmin` check the Supabase `error` field and throw `ApiError(500)` with `console.error` logging on infrastructure failures. The spec was silent on this; the omission was a review finding.

```typescript
// src/lib/api/errors.ts

class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) { super(message); this.name = 'ApiError'; }
}

/** Maps ApiError instances to their status codes; logs and returns 500 for unknown errors. */
function handleApiError(error: unknown): NextResponse
```

> **Implementation note (issue #56):** `statusCode` and `details` are `readonly` in the implementation (spec omitted this). `handleApiError` calls `console.error` before returning 500 — the spec was silent on observability for the unknown-error branch.

```typescript
// src/lib/api/validation.ts

/** Throws ApiError(422, 'Invalid JSON body') if body is not valid JSON.
 *  Throws ApiError(422, 'Validation failed', { issues }) on schema failure. */
async function validateBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T>
```

> **Implementation note (issue #56):** Parameter type is `ZodType<T>` (not `ZodSchema<T>`), as `ZodSchema` is deprecated in Zod v4. `validateParams()` is deferred.

#### GET /api/assessments

See [v1-design.md §4.4 GET /api/assessments](v1-design.md#get-apiassessments) for response shape.

**Implementation notes:**
- Uses the user's Supabase client (RLS enforced) — automatically scopes by org membership and participant access
- Org Admin sees all assessments for the selected org; regular user sees only theirs
- Pagination via `range()` on the Supabase query
- `participant_count` and `completed_count` are derived from a subquery on `assessment_participants`
- Supports `status` filter in addition to the spec'd `type` filter

> **Implementation note (issue #57):** The spec said participant counts come from "a subquery on
> `assessment_participants`" using the user's Supabase client. This is wrong: the
> `participants_select_own` RLS policy limits non-admin users to their own row, so a user-session
> query would always return a count of 1. Participant counts are fetched via the **service client**
> (bypasses RLS) in a separate batch query after the main assessments query. Counts are
> non-sensitive aggregate metadata, so the service client is appropriate.
>
> Three module-level helpers were extracted to keep `GET` cognitive complexity within the
> SonarQube threshold (≤15):
> - `fetchParticipantCounts(assessmentIds)` — service-client batch query
> - `toListItem(row, counts)` — maps DB row + counts to `AssessmentListItem`
> - `validateEnumParam(value, allowed, paramName)` — throws `ApiError(400)` if value not in set
>
> Inline contract types (`AssessmentListItem`, `AssessmentsResponse`) with a JSDoc handler
> comment are now required on every route file — see ADR-0014.

#### GET /api/assessments/[id]

See [v1-design.md §4.4 GET /api/assessments/\[id\]](v1-design.md#get-apiassessmentsid) for response shape.

**Design decision (2026-03-24):** Self-view scores moved to `GET /api/assessments/[id]/scores`. The detail endpoint covers metadata, filtered questions, and participant counts. Score retrieval is FCS-only, post-submission, with multi-attempt processing — a distinct use case that does not belong in the detail fetch. `my_scores` removed from response shape.

**Sequence:**

```
1. requireAuth()
2. Fetch assessment (RLS gates org access — PGRST116 → 404)
3. Parallel:
   a. user_organisations → callerRole ('admin' | 'participant')
   b. assessment_questions (service client — RLS blocks non-admins from all rows)
   c. assessment_participants (service client — all rows for count)
   d. assessment_participants for caller (session client — own row)
4. filterQuestionFields() — null reference_answer unless FCS + admin + completed
5. Return response (no my_scores field)
```

**Column filtering logic (application layer):**

```typescript
function filterQuestionFields(
  questions: AssessmentQuestion[],
  assessmentType: 'prcc' | 'fcs',
  callerRole: 'admin' | 'participant',
  assessmentStatus: AssessmentStatus,
): FilteredQuestion[] {
  return questions.map(q => ({
    ...q,
    reference_answer:
      assessmentType === 'fcs'
      && callerRole === 'admin'
      && assessmentStatus === 'completed'
        ? q.reference_answer
        : null,
  }));
}
```

#### GET /api/assessments/[id]/scores

FCS participants only. Returns the caller's self-view scores after submission. Returns 404 for non-FCS assessments, unenrolled callers, or callers who have not yet submitted.

**Response shape:**

```typescript
{
  questions: {
    question_id: string;
    naur_layer: NaurLayer;
    question_text: string;
    my_answer: string;
    score: number;
    score_rationale: string;
  }[];
  reassessment_available: boolean;   // true when assessment status === 'completed'
  last_reassessment_at: string | null;
}
```

**Sequence:**

```
1. requireAuth()
2. Fetch assessment (RLS + type check — non-FCS → 404)
3. Fetch caller's participant row (session client — returns null if not enrolled)
4. If null or status !== 'submitted' → 404
5. Fetch participant_answers (service client, ordered by attempt_number desc)
6. Fetch assessment_questions (service client, for question metadata)
7. Per question: pick latest non-reassessment answer with non-null score + rationale
8. Sort by question_number; find latest reassessment timestamp
9. Return response
```

#### POST /api/assessments/[id]/answers

See [v1-design.md §4.4 POST /api/assessments/\[id\]/answers](v1-design.md#post-apiassessmentsidanswers) for request/response shape.

**Flow:**

```
1. requireAuth()
2. Verify caller is a participant (link_participant if needed)
3. Determine if first submission or re-attempt:
   - First: require answers for all questions
   - Re-attempt: require answers only for flagged questions
4. Store answers in participant_answers
5. For each answer: call relevance detection (engine)
6. If any irrelevant: return status='relevance_failed' with explanations
7. If all relevant:
   a. Update participant status to 'submitted'
   b. Check if all participants submitted
   c. If yes: trigger scoring pipeline (async)
   d. Return status='accepted'
```

**Scoring trigger:** When the last participant submits, the route calls the assessment pipeline's `scoreAssessment()` function. This runs synchronously within the request (scoring is fast — one LLM call per answer). The response includes the updated participation count.

#### POST /api/assessments/[id]/reassess

See [v1-design.md §4.4 POST /api/assessments/\[id\]/reassess](v1-design.md#post-apiassessmentsidreassess) for request/response shape.

FCS only. Scores each re-assessment answer individually and returns scores immediately. Does not affect the team aggregate.

#### PUT /api/assessments/[id]

See [v1-design.md §4.4 PUT /api/assessments/\[id\]](v1-design.md#put-apiassessmentsid) for request/response shape.

Two actions: `skip` (PRCC) and `close` (FCS). Both require Org Admin. Skip records the reason and updates the Check Run to `neutral`. Close triggers scoring of submitted answers.

#### Error handling

All routes use a consistent error handling pattern:

```typescript
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    // Route logic
  } catch (error) {
    return handleApiError(error);
  }
}
```

`handleApiError` maps `ApiError` instances to their status codes, and unknown errors to 500 with a generic message (no stack traces in production).

---

## 2.5 Assessment Answering UI

**Stories:** 5.3, 2.4
**Layers:** FE

### HLD coverage assessment

- No dedicated HLD section for answering UI — the L3 flows (§3.1, §3.2) describe the data flow but not the UI structure. Full detail below.

### Frontend

#### Page routes

| Route | Component | Data fetching | Auth |
|-------|-----------|--------------|------|
| `/assessments/[id]` | `AssessmentPage` | Server-side: `GET /api/assessments/[id]` | Required; must be participant |
| `/assessments/[id]/submitted` | `SubmittedPage` | Client-side redirect after submission | Required |

#### Component tree

```
AssessmentPage
  ├── AssessmentHeader
  │     ├── Type badge (PRCC / FCS)
  │     ├── Repository name
  │     └── PR number or Feature name
  ├── PRCCNotice (PRCC only)
  │     └── "Complete your PR review before submitting"
  ├── QuestionList
  │     └── QuestionCard (one per question)
  │           ├── Question number + Naur layer badge
  │           ├── Question text
  │           ├── AnswerTextArea
  │           └── RelevanceWarning (if re-attempt)
  │                 └── Explanation text + attempts remaining
  └── SubmitButton
        └── "Submit answers" (disabled until all filled)

SubmittedPage
  ├── Confirmation message
  ├── Participation progress ("You are 2 of 3")
  └── Link back to assessments list

AccessDeniedPage
  └── "You are not a participant on this assessment"

AlreadySubmittedPage
  └── "You have already submitted your answers"
```

#### Client state

State managed with React `useState` — no external state library needed for this flow.

```typescript
interface AnsweringState {
  answers: Record<string, string>;          // questionId → answer text
  submitting: boolean;
  relevanceResults: RelevanceResult[] | null; // null until first submission
  attemptCounts: Record<string, number>;     // questionId → attempt number
}
```

#### UI states

| State | Trigger | Display |
|-------|---------|---------|
| Loading | Initial page load | Skeleton: header + 3 question card placeholders |
| Answering | Data loaded, not yet submitted | Questions with text areas |
| Submitting | Submit button clicked | Spinner on button, text areas disabled |
| Relevance failed | API returns `relevance_failed` | Failed questions highlighted, explanation shown, re-answer prompt |
| Submitted | API returns `accepted` | Redirect to `/assessments/[id]/submitted` |
| Already submitted | Participant status is `submitted` | `AlreadySubmittedPage` |
| Access denied | User is not a participant | `AccessDeniedPage` |
| Error | API call fails | Error banner with retry button |

#### Re-answer flow

When the API returns `status: 'relevance_failed'`:
1. Questions marked as irrelevant are highlighted with the explanation
2. Remaining attempts count shown ("2 attempts remaining")
3. Only irrelevant questions are editable; relevant ones are locked
4. Submit button text changes to "Resubmit flagged answers"
5. On resubmit, only flagged question answers are sent to the API
6. If attempts exhausted (0 remaining), the question is accepted and locked

---

## 2.6 Role-Based Access and Navigation

**Stories:** 5.2, 5.4
**Layers:** BE, FE

### HLD coverage assessment

- No dedicated HLD section — navigation is an implementation detail. Full detail below.

### Backend

#### Route protection

Admin-only routes are protected server-side in their route handlers using `requireOrgAdmin()` from [§2.4](#24-api-routes--assessments). No separate middleware — each route handler validates independently.

Protected routes (Org Admin only):
- `/organisation` — org overview page
- `/organisation/settings` — org config page
- `/repos/[id]/settings` — repo config page
- `PUT /api/orgs/[orgId]/config`
- `PUT /api/repos/[repoId]/config`

### Frontend

#### Navigation layout

```
src/app/
  layout.tsx               — root layout (auth check, org context)
  (authenticated)/
    layout.tsx             — authenticated layout with navigation
    assessments/
      page.tsx             — My Assessments (landing page)
    organisation/
      page.tsx             — Org overview (admin only)
      settings/page.tsx    — Org config (admin only)
    repos/
      [id]/
        page.tsx           — Repo assessment history
        settings/page.tsx  — Repo config (admin only)
```

#### Navigation component

```
src/components/
  nav-bar.tsx              — top navigation bar
```

```
NavBar
  ├── Logo / App name
  ├── OrgSwitcher (from §2.3)
  ├── NavLinks
  │     ├── "My Assessments" (all users)
  │     ├── "Organisation" (admin only — hidden for non-admin)
  │     └── "Repositories" (admin only — hidden for non-admin)
  └── UserMenu
        ├── Username
        └── "Sign out" link
```

**Admin detection:** The nav bar reads the user's role from the org membership data (available via the Supabase client). Admin links are conditionally rendered — not shown to non-admins.

#### Landing page

After sign-in (and org selection if needed), users land on `/assessments` — their pending assessments list. This is the most common entry point and provides immediate actionability.

---

## 2.7 API Routes — Organisations and Configuration

**Stories:** 1.2, 1.3, 1.4
**Layers:** BE

### HLD coverage assessment

- [§4.4 Configuration endpoints](v1-design.md#configuration) — response shapes are definitive; referenced only
- Route handler implementation — brief detail below

### Backend

#### File structure

```
src/app/api/
  orgs/
    route.ts                       — GET /api/orgs (list user's orgs)
    [orgId]/
      config/
        route.ts                   — GET/PUT /api/orgs/[orgId]/config
  repos/
    [repoId]/
      config/
        route.ts                   — GET/PUT /api/repos/[repoId]/config
```

#### GET /api/orgs

Returns organisations the authenticated user belongs to. Uses the user's Supabase client (RLS scoped). Includes repository count per org (subquery).

#### GET/PUT /api/orgs/[orgId]/config

See [v1-design.md §4.4 config endpoints](v1-design.md#get-apiorgsorgiconfig) for response shape.

GET: requires org membership. PUT: requires Org Admin. Partial update — only fields present in the request body are updated. Validates field constraints (e.g., `score_threshold` 0–100) before writing.

#### GET/PUT /api/repos/[repoId]/config

See [v1-design.md §4.4 GET /api/repos/\[repoId\]/config](v1-design.md#get-apireposrepoidconfig) for response shape.

GET returns both `effective` (cascade-resolved via `get_effective_config()`) and `overrides` (raw repo config values). PUT updates `repository_config` — setting a field to `null` removes the override.

---

## Cross-References

### Internal (within this phase)

| Section | Depends on | Depended on by |
|---------|-----------|---------------|
| [§2.1 Database](#21-database-schema-and-migrations) | — | All other sections |
| [§2.2 Auth](#22-github-oauth-authentication) | [§2.1](#21-database-schema-and-migrations) | [§2.3](#23-organisation-membership-and-selection), [§2.4](#24-api-routes--assessments), [§2.5](#25-assessment-answering-ui), [§2.6](#26-role-based-access-and-navigation), [§2.7](#27-api-routes--organisations-and-configuration) |
| [§2.3 Org Membership](#23-organisation-membership-and-selection) | [§2.1](#21-database-schema-and-migrations), [§2.2](#22-github-oauth-authentication) | [§2.4](#24-api-routes--assessments), [§2.6](#26-role-based-access-and-navigation), [§2.7](#27-api-routes--organisations-and-configuration) |
| [§2.4 Assessment API](#24-api-routes--assessments) | [§2.1](#21-database-schema-and-migrations), [§2.2](#22-github-oauth-authentication), [§2.3](#23-organisation-membership-and-selection) | [§2.5](#25-assessment-answering-ui) |
| [§2.5 Answering UI](#25-assessment-answering-ui) | [§2.4](#24-api-routes--assessments) | — |
| [§2.6 Navigation](#26-role-based-access-and-navigation) | [§2.2](#22-github-oauth-authentication), [§2.3](#23-organisation-membership-and-selection) | — |
| [§2.7 Config API](#27-api-routes--organisations-and-configuration) | [§2.1](#21-database-schema-and-migrations), [§2.2](#22-github-oauth-authentication), [§2.3](#23-organisation-membership-and-selection) | — |

### External

- **Depends on:** [lld-artefact-pipeline.md](lld-artefact-pipeline.md) — the assessment engine (scoring, relevance detection) is called by §2.4 API routes. The engine is already implemented in Phase 1.
- **Depended on by:** Phase 3 LLD (PRCC flow) — builds on the auth, API routes, and database from this phase.

### Shared types

| Type | Location | Used by |
|------|----------|---------|
| `Database` (generated) | `src/lib/supabase/types.ts` | All sections |
| `AuthUser` | `src/lib/api/auth.ts` | §2.4, §2.6, §2.7 |
| `ApiError` | `src/lib/api/errors.ts` | §2.4, §2.7 |

---

## Tasks

### Task 1: Schema migration for v0.8 design changes

**Issue title:** Add score, score_rationale, is_reassessment to participant_answers
**Layer:** DB
**Depends on:** —
**Stories:** 3.4, 3.6, ADR-0005
**HLD reference:** [v1-design.md §4.1 participant_answers](v1-design.md#participant_answers)

**What:** Create a new migration adding `score`, `score_rationale`, `is_reassessment` columns to `participant_answers`. Update constraints and add missing index. Update TypeScript types.

**Acceptance criteria:**
- [ ] Migration applies cleanly on top of existing migrations
- [ ] `supabase db reset` succeeds
- [ ] `score` column accepts `NULL` and values 0.00–1.00
- [ ] `is_reassessment` defaults to `false`
- [ ] Updated UNIQUE constraint allows reassessment rows
- [ ] TypeScript types file updated to match new schema
- [ ] Existing tests still pass

**BDD specs:**

```
describe('participant_answers schema migration')
  describe('Given an existing database with v1 migrations')
    it('then the v0.8 migration applies without errors')
  describe('Given the updated participant_answers table')
    it('then score accepts null and values between 0.00 and 1.00')
    it('then score rejects values outside 0.00–1.00')
    it('then is_reassessment defaults to false')
    it('then the UNIQUE constraint allows same question with different is_reassessment')
```

**Files to create/modify:**
- `supabase/migrations/20260316000001_participant_answers_v08.sql` — new migration
- `src/lib/supabase/types.ts` — update `participant_answers` types

---

### Task 2: Database seed data and test factories

**Issue title:** Create seed data and test factory functions for integration tests
**Layer:** DB
**Depends on:** Task 1
**Stories:** 1.5
**HLD reference:** [v1-design.md §4.1](v1-design.md#41-database-schema)

**What:** Create comprehensive seed data for local development and TypeScript factory functions for creating test data in integration tests.

**Acceptance criteria:**
- [ ] `supabase db reset` loads seed data without errors
- [ ] Seed data includes 2 orgs, 3 repos, 3 users, 2 assessments
- [ ] Factory functions create valid records with sensible defaults
- [ ] `resetDatabase()` helper truncates all tables cleanly
- [ ] Factory README documents usage

**BDD specs:**

```
describe('Seed data')
  describe('Given a fresh database after supabase db reset')
    it('then 2 organisations exist')
    it('then 3 repositories exist')
    it('then user_organisations link users to their orgs')

describe('Test factories')
  describe('Given createOrg with default options')
    it('then it creates an active organisation')
  describe('Given createAssessment with required fields')
    it('then it creates an assessment with correct defaults')
  describe('Given resetDatabase')
    it('then all tables are empty')
```

**Files to create/modify:**
- `supabase/seed.sql` — seed data
- `tests/helpers/factories.ts` — test factory functions
- `tests/helpers/db.ts` — database reset helper

---

### Task 3: Supabase SSR client setup

**Issue title:** Configure Supabase SSR clients for server components, route handlers, and middleware
**Layer:** BE
**Depends on:** Task 1
**Stories:** 5.1
**HLD reference:** [v1-design.md §3.3](v1-design.md#33-authsession-flow)

**What:** Create server-side Supabase clients using `@supabase/ssr` for use in server components, API route handlers, Next.js middleware, and service role operations.

**Acceptance criteria:**
- [ ] Server component client reads cookies and returns authenticated user
- [ ] Route handler client reads/writes cookies
- [ ] Service role client bypasses RLS
- [ ] Middleware client refreshes expired JWTs
- [ ] All clients use the `Database` type for type safety

**BDD specs:**

```
describe('Supabase server client')
  describe('Given a valid session cookie')
    it('then getUser returns the authenticated user')
  describe('Given an expired session cookie')
    it('then the middleware refreshes the JWT')

describe('Supabase service role client')
  describe('Given a service role client')
    it('then it can read data across all orgs (bypasses RLS)')
```

**Files to create/modify:**
- `src/lib/supabase/env.ts` — shared env var validation (not in original spec; added for DRY)
- `src/lib/supabase/server.ts` — server component client
- `src/lib/supabase/route-handler.ts` — route handler client
- `src/lib/supabase/middleware.ts` — middleware client
- `src/lib/supabase/service-role.ts` — service role client (uses `@supabase/supabase-js`, not `@supabase/ssr`)
- `src/lib/supabase/client.ts` — updated to import from `env.ts`
- `tests/setup.ts` — env var fallbacks required so module-level validation in `env.ts` does not throw during unit test import

---

### Task 4: GitHub OAuth sign-in flow

**Issue title:** Implement GitHub OAuth sign-in with provider token capture
**Layer:** BE + FE
**Depends on:** Task 3
**Stories:** 5.1, ADR-0003
**HLD reference:** [v1-design.md §3.3](v1-design.md#33-authsession-flow)

**What:** Implement the sign-in page, auth callback route with provider token capture and encryption, sign-out route, and Next.js session middleware.

**Acceptance criteria:**
- [ ] Sign-in page renders "Sign in with GitHub" button
- [ ] Clicking button initiates Supabase PKCE OAuth flow
- [ ] Callback route exchanges code for session
- [ ] Provider token captured and encrypted in `user_github_tokens`
- [ ] Session middleware redirects unauthenticated users to sign-in
- [ ] Session middleware refreshes expired JWTs transparently
- [ ] Sign-out clears session and redirects to sign-in
- [ ] Public routes (webhooks, sign-in, callback) are not protected

**BDD specs:**

```
describe('Auth callback route')
  describe('Given a valid OAuth callback with auth code')
    it('then it exchanges for session and redirects to /assessments')
  describe('Given a provider token in the session')
    it('then it encrypts and stores the token in user_github_tokens')
  describe('Given a missing auth code')
    it('then it redirects to /auth/sign-in with error')

describe('Session middleware')
  describe('Given no session cookie on a protected route')
    it('then it redirects to /auth/sign-in')
  describe('Given a valid session cookie')
    it('then it allows the request to proceed')
  describe('Given a request to /api/webhooks/github')
    it('then it does not require authentication')

describe('E2E: Sign-in flow')
  it('Given I visit /assessments unauthenticated, then I am redirected to sign-in')
  it('Given I click sign in with GitHub, then I am redirected to GitHub OAuth')
```

**Files to create/modify:**
- `src/app/auth/sign-in/page.tsx` — sign-in page
- `src/app/auth/callback/route.ts` — OAuth callback handler
- `src/app/auth/sign-out/route.ts` — sign-out handler
- `src/middleware.ts` — Next.js middleware
- `supabase/migrations/20260316000002_store_github_token_fn.sql` — token storage function

---

### Task 5: Organisation membership sync

**Issue title:** Implement org membership sync from GitHub API on sign-in
**Layer:** BE
**Depends on:** Task 4
**Stories:** 1.2, 5.2
**HLD reference:** [v1-design.md §3.3](v1-design.md#33-authsession-flow)

**What:** On auth callback, fetch the user's GitHub org memberships, match against installed orgs, and populate `user_organisations`. Refresh on each sign-in.

**Acceptance criteria:**
- [ ] Org memberships synced from GitHub API on sign-in
- [ ] Only orgs with the app installed appear in `user_organisations`
- [ ] `github_role` reflects the user's actual org role (admin/member)
- [ ] Stale memberships removed on re-sync
- [ ] Works for users with 0, 1, or multiple matching orgs

**BDD specs:**

```
describe('Org membership sync')
  describe('Given a user who belongs to 2 orgs with the app installed')
    it('then both orgs appear in user_organisations')
  describe('Given a user whose org membership changed since last login')
    it('then user_organisations is updated on sign-in')
  describe('Given a user who belongs to an org without the app installed')
    it('then that org does not appear in user_organisations')
  describe('Given a user who was removed from an org')
    it('then the stale user_organisations row is deleted')
```

**Files to create/modify:**
- `src/lib/supabase/org-sync.ts` — org sync logic

---

### Task 6: Organisation selection UI

**Issue title:** Implement org selection page and header org switcher
**Layer:** FE
**Depends on:** Task 5
**Stories:** 1.2, 5.2
**HLD reference:** [v1-design.md §3.3](v1-design.md#33-authsession-flow)

**What:** Create the org selection page (for multi-org users) and header org switcher dropdown. Auto-select for single-org users. Store selection in cookie.

**Acceptance criteria:**
- [ ] Single-org users auto-redirected (no selection page shown)
- [ ] Multi-org users see org selection page
- [ ] Selecting an org sets cookie and redirects to `/assessments`
- [ ] Header org switcher shows current org and allows switching
- [ ] Zero-org users see "no organisations" message

**BDD specs:**

```
describe('E2E: Org selection')
  it('Given I sign in with one org, then I am auto-redirected to assessments')
  it('Given I sign in with multiple orgs, then I see the org selection page')
  it('Given I select an org, then all data is scoped to that org')
```

**Files created/modified (actual):**
- `src/app/org-select/page.tsx` — org selection page
- `src/app/api/org-select/route.ts` — cookie-setting route handler _(added; not in original spec)_
- `src/components/org-switcher.tsx` — header org switcher (static link list, not dropdown)
- `src/lib/supabase/org-context.ts` — org cookie helpers
- `vitest.config.ts` — added `esbuild: { jsx: 'automatic' }` for TSX test support

---

### Task 7: API route utilities and error handling

**Issue title:** Create shared API route utilities (auth, validation, errors)
**Layer:** BE
**Depends on:** Task 3
**Stories:** 5.1, 5.2
**HLD reference:** [v1-design.md §4.4 common error responses](v1-design.md#44-api-route-contracts)

**What:** Create shared utilities used by all API routes: auth extraction, org admin checks, request body validation, consistent error responses.

**Acceptance criteria:**
- [ ] `extractUser()` returns authenticated user or null
- [ ] `requireAuth()` throws 401 for unauthenticated requests
- [ ] `requireOrgAdmin()` throws 403 for non-admin users
- [ ] `ApiError` class supports status code, message, and details
- [ ] `handleApiError()` returns correct JSON responses
- [ ] Error responses match the common format from L4 contract

**BDD specs:**

```
describe('requireAuth')
  describe('Given a request with valid session')
    it('then it returns the AuthUser')
  describe('Given a request with no session')
    it('then it throws ApiError with status 401')

describe('requireOrgAdmin')
  describe('Given an org admin user')
    it('then it returns the AuthUser')
  describe('Given a non-admin user')
    it('then it throws ApiError with status 403')

describe('handleApiError')
  describe('Given an ApiError(422)')
    it('then it returns a 422 response with the error message')
  describe('Given an unknown error')
    it('then it returns a 500 response with generic message')
```

**Files to create/modify:**
- `src/lib/api/auth.ts` — auth helpers
- `src/lib/api/validation.ts` — request validation
- `src/lib/api/errors.ts` — error classes and handlers
- `src/lib/api/response.ts` — response helpers

---

### Task 8: GET /api/assessments (list)

**Issue title:** Implement GET /api/assessments list endpoint
**Layer:** BE
**Depends on:** Task 7
**Stories:** 2.4, 3.3
**HLD reference:** [v1-design.md §4.4 GET /api/assessments](v1-design.md#get-apiassessments)

**What:** List assessments for the current user with pagination and filtering. Org Admins see all org assessments; regular users see only their participations.

**Acceptance criteria:**
- [x] Returns assessments scoped by RLS (org membership + participation)
- [x] Supports `type`, `status`, `page`, `per_page` query parameters
- [x] Response shape matches L4 contract
- [x] Includes `participant_count` and `completed_count` per assessment
- [x] Pagination returns correct `total`, `page`, `per_page`

**BDD specs:**

```
describe('GET /api/assessments')
  describe('Given an org admin requesting assessments')
    it('then it returns all assessments for the org')
    it('then each assessment includes participant_count and completed_count')
  describe('Given a regular user (non-admin)')
    it('then it returns only assessments where they are a participant')
    it('then participant_count reflects all participants, not just the requesting user')
  describe('Given type=prcc filter')
    it('then it queries with the type filter')
  describe('Given an invalid type filter')
    it('then it returns 400')
  describe('Given an invalid status filter')
    it('then it returns 400')
  describe('Given pagination parameters page=2 per_page=10')
    it('then it returns the correct page with correct total')
  describe('Given a DB error')
    it('then it returns 500')
```

**Files created/modified:**
- `src/app/api/assessments/route.ts` — GET handler
- `tests/app/api/assessments.test.ts` — 11 BDD tests
- `docs/adr/0014-api-route-contract-types.md` — convention for inline contract types

---

### Task 9: GET /api/assessments/[id] (detail)

**Issue title:** Implement GET /api/assessments/[id] detail endpoint
**Layer:** BE
**Depends on:** Task 7
**Stories:** 2.4, 3.3, 3.4, 5.3
**HLD reference:** [v1-design.md §4.4 GET /api/assessments/\[id\]](v1-design.md#get-apiassessmentsid)

**What:** Return assessment details with questions. Filter reference answers and self-view scores based on assessment type, caller role, and status.

**Acceptance criteria:**
- [ ] Returns full assessment details with questions
- [ ] PRCC: reference answers always null
- [ ] FCS + Org Admin + completed: reference answers included
- [ ] FCS + participant + submitted: `my_scores` populated
- [ ] Non-participant/non-admin gets 404 (via RLS)
- [ ] Includes `my_participation` for the caller

**BDD specs:**

```
describe('GET /api/assessments/[id]')
  describe('Given a PRCC assessment')
    it('then reference answers are null')
  describe('Given a completed FCS assessment viewed by Org Admin')
    it('then reference answers are included')
  describe('Given a completed FCS assessment viewed by participant')
    it('then my_scores is populated with their scores')
    it('then reference answers are null')
  describe('Given a user who is not a participant or admin')
    it('then it returns 404')
```

**Files to create/modify:**
- `src/app/api/assessments/[id]/route.ts` — GET handler

---

### Task 10: POST /api/assessments/[id]/answers

**Issue title:** Implement POST /api/assessments/[id]/answers submission endpoint
**Layer:** BE
**Depends on:** Task 7
**Stories:** 2.4, 2.5, 5.3
**HLD reference:** [v1-design.md §4.4 POST /api/assessments/\[id\]/answers](v1-design.md#post-apiassessmentsidanswers)

**What:** Accept answer submissions from participants. Handle first submission and re-attempts for irrelevant answers. Trigger scoring when all participants complete.

**Acceptance criteria:**
- [ ] First submission requires answers for all questions
- [ ] Re-attempt requires answers only for flagged questions
- [ ] Runs relevance detection on each answer
- [ ] Returns `relevance_failed` with explanations for irrelevant answers
- [ ] Updates participant status to `submitted` when all answers relevant
- [ ] Triggers scoring when last participant submits
- [ ] Returns 422 for already-submitted participants
- [ ] Returns 422 when max attempts exhausted

**BDD specs:**

```
describe('POST /api/assessments/[id]/answers')
  describe('Given a valid participant submitting answers for the first time')
    it('then answers are stored and relevance checked')
  describe('Given all answers are relevant')
    it('then participant status is set to submitted')
  describe('Given some answers are irrelevant')
    it('then it returns relevance_failed with explanations')
  describe('Given a participant who already submitted')
    it('then it returns 422')
  describe('Given the last participant submits')
    it('then scoring is triggered automatically')
```

**Files to create/modify:**
- `src/app/api/assessments/[id]/answers/route.ts` — POST handler

---

### Task 11: PUT /api/assessments/[id] (skip/close) and POST reassess

**Issue title:** Implement PUT /api/assessments/[id] skip/close and POST reassess endpoints
**Layer:** BE
**Depends on:** Task 7
**Stories:** 2.7, 3.5, 3.6
**HLD reference:** [v1-design.md §4.4 PUT /api/assessments/\[id\]](v1-design.md#put-apiassessmentsid), [v1-design.md §4.4 POST /api/assessments/\[id\]/reassess](v1-design.md#post-apiassessmentsidreassess)

**What:** Implement skip (PRCC), close (FCS), and reassess (FCS) operations. All require appropriate authorisation.

**Acceptance criteria:**
- [ ] Skip: sets status to `skipped`, records reason/user/timestamp
- [ ] Skip: only valid for active PRCC assessments
- [ ] Close: triggers scoring of submitted answers for FCS
- [ ] Close: only valid for FCS in `awaiting_responses`
- [ ] Reassess: stores re-assessment answers with `is_reassessment = true`
- [ ] Reassess: scores immediately and returns scores
- [ ] Reassess: does not affect team aggregate
- [ ] Non-admin skip/close returns 403

**BDD specs:**

```
describe('PUT /api/assessments/[id] skip')
  describe('Given an org admin skipping an active PRCC assessment')
    it('then assessment status is set to skipped with reason')
  describe('Given a non-admin attempting to skip')
    it('then it returns 403')

describe('PUT /api/assessments/[id] close')
  describe('Given an org admin closing an FCS assessment')
    it('then scoring is triggered for submitted answers')

describe('POST /api/assessments/[id]/reassess')
  describe('Given a participant re-assessing a completed FCS')
    it('then answers are stored with is_reassessment=true')
    it('then scores are returned immediately')
  describe('Given a PRCC assessment')
    it('then it returns 403')
```

**Files to create/modify:**
- `src/app/api/assessments/[id]/route.ts` — PUT handler (add to existing file from Task 9)
- `src/app/api/assessments/[id]/reassess/route.ts` — POST handler

---

### Task 12: Assessment answering page

**Issue title:** Create assessment answering page with question display and answer submission
**Layer:** FE
**Depends on:** Task 10
**Stories:** 5.3, 2.4
**HLD reference:** —

**What:** Build the assessment answering page: display questions, collect answers via text areas, submit to API, handle relevance re-answer flow, show confirmation.

**Acceptance criteria:**
- [ ] Questions displayed with Naur layer badges
- [ ] Submit button disabled until all text areas filled
- [ ] PRCC notice shown for PRCC assessments
- [ ] Relevance failure: flagged questions highlighted with explanation
- [ ] Re-answer: only flagged questions editable, attempts shown
- [ ] Successful submission redirects to confirmation page
- [ ] Already-submitted participants see completion message
- [ ] Non-participants see access denied page

**BDD specs:**

```
describe('E2E: Assessment answering')
  it('Given I am a participant, when I visit the assessment page, then I see the questions')
  it('Given I fill all answers and submit, then I see the confirmation page')
  it('Given I have already submitted, when I revisit, then I see the completion message')
  it('Given I am not a participant, when I visit, then I see access denied')
```

**Files to create/modify:**
- `src/app/(authenticated)/assessments/[id]/page.tsx` — answering page
- `src/app/(authenticated)/assessments/[id]/submitted/page.tsx` — confirmation page
- `src/components/question-card.tsx` — question display component
- `src/components/relevance-warning.tsx` — relevance failure display

---

### Task 13: Navigation layout and role-based visibility

**Issue title:** Implement navigation layout with role-based route protection
**Layer:** BE + FE
**Depends on:** Task 6
**Stories:** 5.2, 5.4
**HLD reference:** —

**What:** Create the authenticated layout with navigation bar. Hide admin-only links for non-admins. Protect admin routes server-side. Landing page shows pending assessments.

**Acceptance criteria:**
- [ ] Navigation bar shows correct links based on user role
- [ ] Admin-only pages return 403 for non-admins
- [ ] Landing page (`/assessments`) shows pending assessments
- [ ] Org switcher visible in nav bar

**BDD specs:**

```
describe('E2E: Navigation')
  it('Given I am an org admin, then I see Organisation in navigation')
  it('Given I am a regular user, then I do not see admin-only links')
  it('Given I am a regular user visiting /organisation, then I see 403')
```

**Files to create/modify:**
- `src/app/(authenticated)/layout.tsx` — authenticated layout
- `src/components/nav-bar.tsx` — navigation bar
- `src/app/(authenticated)/assessments/page.tsx` — assessments list page

---

### Task 14: Config API routes

**Issue title:** Implement organisation and repository config API routes
**Layer:** BE
**Depends on:** Task 7
**Stories:** 1.2, 1.3, 1.4
**HLD reference:** [v1-design.md §4.4 Configuration](v1-design.md#configuration)

**What:** Implement CRUD endpoints for org-level and repo-level configuration. Config cascade resolved via `get_effective_config()`.

**Acceptance criteria:**
- [ ] `GET /api/orgs` returns user's organisations with repo counts
- [ ] `GET /api/orgs/[orgId]/config` returns org config (admin only)
- [ ] `PUT /api/orgs/[orgId]/config` updates config with validation
- [ ] `GET /api/repos/[repoId]/config` returns effective + overrides
- [ ] `PUT /api/repos/[repoId]/config` updates overrides; null removes override
- [ ] Non-admin PUT returns 403
- [ ] Field validation enforced (e.g., score_threshold 0–100)

**BDD specs:**

```
describe('GET /api/orgs')
  describe('Given an authenticated user with 2 orgs')
    it('then it returns both organisations')

describe('PUT /api/orgs/[orgId]/config')
  describe('Given an org admin updating enforcement mode')
    it('then the config is updated and returned')
  describe('Given a non-admin')
    it('then it returns 403')

describe('GET /api/repos/[repoId]/config')
  describe('Given a repo with no explicit config')
    it('then effective values match org defaults')
  describe('Given a repo with explicit overrides')
    it('then overrides take precedence in effective values')

describe('PUT /api/repos/[repoId]/config')
  describe('Given setting a field to null')
    it('then the override is removed and effective inherits from org')
```

**Files to create/modify:**
- `src/app/api/orgs/route.ts` — GET /api/orgs
- `src/app/api/orgs/[orgId]/config/route.ts` — GET/PUT org config
- `src/app/api/repos/[repoId]/config/route.ts` — GET/PUT repo config
