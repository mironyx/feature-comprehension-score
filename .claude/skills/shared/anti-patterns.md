# Known Framework Anti-Patterns (Static Checklist)

Scan the diff for these regardless of which frameworks are imported. A package can be
current and non-deprecated while specific usage patterns within it are wrong.

Add new anti-patterns to this file as the team discovers them. This list is the
institutional memory of "things we've learned the hard way."

## Supabase

- `supabaseAnonKey` or `SUPABASE_ANON_KEY` used in any server-side file (API routes,
  server actions, middleware, `*.server.ts`, files under `src/lib/engine/`, `src/app/api/`).
  The anon key is for client-side only. Server-side must use `SUPABASE_SERVICE_ROLE_KEY`.
  Severity: **block** (security — anon key bypasses RLS on the server even when RLS
  policies exist).
- `createClient` called with anon key in a server context → **block** same reason.
- `.from('table')` without `.select(...)` — returns all columns, exposes schema → **warn**.
- `createClient` on the server without service role key and no evidence of RLS → **warn**.
- Multiple `.from()` write calls (upsert/insert/update/delete) in a single function with no
  transaction wrapping — if any step after the first fails, the DB is left partially written
  → **warn**. Fix: move multi-step writes into a PostgreSQL function called via `.rpc()` so
  all writes are atomic. Exception: if writes are genuinely independent (failure of one cannot
  corrupt the other), note this in the finding.

## Next.js

- `cookies()`, `headers()` called outside an async server component or route handler → **block**.
- `"use client"` directive on a file that imports server-only modules → **block**.
- `process.env.NEXT_PUBLIC_*` accessed in server-only code (leaks to client bundle) → **warn**.
- `getServerSideProps` in the App Router (Pages Router pattern, wrong paradigm) → **warn**.

## General secrets / env

- Any hardcoded secret, API key, or token string not referencing `process.env` → **block**.
- `process.env.SOMETHING` used without a null check or fallback in production code → **warn**.

## TypeScript

- `as unknown as X` double cast — usually hiding a type error → **warn**.
- Non-null assertion `!` on values that could genuinely be null → **warn**.
