# Kernel — Canonical Building Blocks

**Status:** Living document. Updated by `/lld-sync` when implementation introduces a new reusable helper, or in the same change that retires one.

This is the curated list of helpers, types, and entry points that every new feature must use. The bar for inclusion is high: an entry exists here only because (a) re-implementing it has caused drift in the past, or (b) it is a non-obvious composition root the codebase depends on. **Not exhaustive** — minor utilities live in their modules, not here.

`/architect` and `/lld` MUST read this file as part of context-gathering. Any LLD that touches a topic covered below MUST reference the kernel entry by import path in its "Reused helpers — DO NOT re-implement" table, and code samples MUST call the listed function by name (not inline its body).

---

## API composition root

| Symbol | Path | Purpose |
|---|---|---|
| `createApiContext(request) → Promise<ApiContext>` | `@/lib/api/context` | The only way to obtain infrastructure clients in a route handler. Composes `supabase` (readonly), `adminSupabase` (secret key), `user` (authenticated), `orgId` (from cookie). Throws `ApiError(401)` for unauthenticated requests. |
| `ApiContext` | `@/lib/api/context` | The injected dependency. Services receive `ApiContext`; **services must never call `createClient()` or any infra factory**. |
| `ctx.orgId: string \| null` | `@/lib/api/context` | The selected org id, already populated from the `fcs-org-id` cookie. Use this; do not re-read the cookie or derive `orgId` from request body / project rows. A null value means no org selected — services typically respond `ApiError(401, 'no_org_selected')`. |

## Auth & membership (API side)

| Symbol | Path | Purpose |
|---|---|---|
| `requireAuth(request) → Promise<AuthUser>` | `@/lib/api/auth` | Lower-level than `createApiContext` — used inside the context factory. New routes should not call this directly. |
| `assertOrgAdmin(ctx, orgId)` | `@/lib/api/repo-admin-gate` | Throws `ApiError(401)` if no membership, `ApiError(403)` unless `github_role = 'admin'`. |
| `assertOrgAdminOrRepoAdmin(ctx, orgId)` | `@/lib/api/repo-admin-gate` | Throws `ApiError(401)` / `ApiError(403)`. The default gate for project-write routes. |
| `isOrgAdminOrRepoAdmin(ctx, orgId) → Promise<boolean>` | `@/lib/api/repo-admin-gate` | Boolean variant. Use when the caller wants to branch, not gate. |
| `readSnapshot(ctx, orgId) → Promise<RepoAdminSnapshot \| null>` | `@/lib/api/repo-admin-gate` | Returns `{ githubRole, adminRepoGithubIds }`. Use when finer-grained checks are needed (e.g. per-repo admin filtering). |
| `RepoAdminSnapshot` | `@/lib/api/repo-admin-gate` | Type exported alongside the helpers. Do not redefine. |

## Auth & membership (server pages — no `ApiContext` available)

| Symbol | Path | Purpose |
|---|---|---|
| `getSelectedOrgId(cookies) → string \| null` | `@/lib/supabase/org-context` | Page-side equivalent of `ctx.orgId`. Pages call this with the `cookies()` accessor; do not re-implement the cookie read. |
| `setSelectedOrgId(response, orgId)` | `@/lib/supabase/org-context` | Sets the cookie on a `NextResponse`. |
| `readMembershipSnapshot(supabase, userId, orgId) → Promise<MembershipSnapshot \| null>` | `@/lib/supabase/membership` | Shared core: single `user_organisations` query, normalised to `{ githubRole, adminRepoGithubIds }`. Both API and page wrappers delegate to this — do not inline the query. |
| `getOrgRole(supabase, userId, orgId) → Promise<'admin' \| 'repo_admin' \| null>` | `@/lib/supabase/membership` | Page-side role discriminant; delegates to `readMembershipSnapshot`. |
| `isAdminOrRepoAdmin(supabase, userId, orgId) → Promise<boolean>` | `@/lib/supabase/membership` | Boolean variant of `getOrgRole`. |

## Validation, response, errors

| Symbol | Path | Purpose |
|---|---|---|
| `validateBody(request, schema) → Promise<T>` | `@/lib/api/validation` | Parses JSON body, runs Zod, throws `ApiError(400)` on failure. Replaces hand-rolled `await request.json()` + `schema.safeParse`. |
| `json(payload, status?)` | `@/lib/api/response` | The only response constructor for success paths. Defaults to 200. |
| `paginated(rows, total, page, pageSize)` | `@/lib/api/response` | Wraps a list response in the standard pagination envelope. |
| `ApiError(status, code, details?)` | `@/lib/api/errors` | The only error class. Carries HTTP status + machine-readable code. |
| `handleApiError(e) → NextResponse` | `@/lib/api/errors` | The only catch in a route handler — converts `ApiError` and unknowns to a `NextResponse`. |

## Supabase client factories (use the right one for the context)

| Factory | Path | When |
|---|---|---|
| `createApiContext` | `@/lib/api/context` | API route handlers — preferred entry; gives you both clients pre-composed. |
| `createReadonlyRouteHandlerClient(request)` | `@/lib/supabase/route-handler-readonly` | Inside `createApiContext` only. Reads cookies; honours RLS. |
| `createSecretSupabaseClient()` | `@/lib/supabase/secret` | Inside `createApiContext` only. Bypasses RLS — used for admin writes. |
| `createServerSupabaseClient()` | `@/lib/supabase/server` | Server components / pages. Honours RLS via cookies. |
| `createMiddlewareSupabaseClient(request, response)` | `@/lib/supabase/middleware` | `middleware.ts` only. |
| `supabase` (browser) | `@/lib/supabase/client` | Client components only. |

## Engine modules (pure domain logic — no framework imports)

| Module | Path | Purpose |
|---|---|---|
| `fcs-pipeline` | `@/lib/engine/fcs-pipeline` | Rubric pipeline: `triggerRubricGeneration`, `retriggerRubricForAssessment`, `extractArtefacts`, `finaliseRubric`, plus retry/error helpers and `CreateFcsResponse`. **Never re-implement.** Established by E11.2 T2.2. |

## Project / org context loaders

| Symbol | Path | Purpose |
|---|---|---|
| `loadOrgPromptContext(supabase, orgId, projectId?)` | `@/lib/supabase/org-prompt-context` | Reads `organisation_contexts` row (org-level or project-level). Returns the full row including jsonb fields. |
| `loadOrgRetrievalSettings(...)` | `@/lib/supabase/org-retrieval-settings` | Loads retrieval settings with defaults applied. |
| `RetrievalSettingsSchema`, `DEFAULT_RETRIEVAL_SETTINGS` | `@/lib/supabase/org-retrieval-settings` | Zod schema + defaults. |

## Type sources

| Type | Path | Purpose |
|---|---|---|
| `Database` | `@/lib/supabase/types` | Generated Supabase types. Patch manually only when the generator is unavailable; coordinate via the migration that introduced the column. |
| `AuthUser` | `@/lib/api/auth` | The authenticated user shape carried by `ApiContext`. |

---

## Anti-patterns this kernel exists to prevent

These are the duplicate-implementation patterns we have already corrected once via `/lld-sync`. Do not introduce them again.

- Inlining the `user_organisations` membership query in any layer — both surfaces delegate to the shared core `readMembershipSnapshot` in `@/lib/supabase/membership`. API callers use `assertOrgAdminOrRepoAdmin` / `readSnapshot`; page callers use `getOrgRole`.
- Inline cookie reads of `fcs-org-id` — use `ctx.orgId` (API) or `getSelectedOrgId(cookies)` (page).
- Deriving `org_id` from the request body or a project row to set the *selected* org — `ctx.orgId` is the source of truth. Project-row reads are for *tenant isolation checks* (`project.org_id === ctx.orgId`), not for setting `orgId`.
- Calling `createClient()` / `createSecretSupabaseClient()` inside a service — use the injected `ApiContext`.
- Hand-rolled `await request.json()` + Zod parse — use `validateBody`.
- Hand-rolled `try/catch` returning `Response.json` — use `handleApiError` and `json` / `ApiError`.
- Defining a local `RepoAdminSnapshot` interface — import the canonical type.
- Re-implementing rubric pipeline functions outside `@/lib/engine/fcs-pipeline`.
- Constructing `/assessments/${id}` hrefs when rendering assessment list items — after T2.3 (issue #412) the correct shape is `/projects/${project_id}/assessments/${id}`. PRCC rows have `project_id === null` and must render as non-navigable `<span>` elements; never use `href="#"` as a placeholder.

---

## Maintenance

- **`/lld-sync` updates this file** when an implementation introduces a new exported helper that ought to be reusable, or when a corrected LLD reveals a re-implementation pattern. The kernel grows organically; we do not pre-populate.
- **Removing an entry** requires the symbol to be deleted from the codebase in the same change.
- **Renaming an entry** requires updating every LLD that references it; `/lld-sync` flags references that no longer resolve.
- Entries should be one line. If a helper needs more than a one-line description, link to its file.
