# Session: 2026-04-01 Session 1 — Fix link_participant auth.uid() (#133)

## Work completed

- **Issue:** #133 — fix: link_participant RPC called with service-role client — auth.uid() returns NULL
- **PR:** #155 — fix: call link_participant with user client so auth.uid() resolves
- **Branch:** `fix/fix-link-participant-auth-uid`

### Core fix

Changed `adminSupabase.rpc('link_participant', ...)` to `supabase.rpc('link_participant', ...)`
in `src/app/assessments/[id]/page.tsx`. The SQL function uses `auth.uid()` internally, which
returns NULL when called via the service-role client (no user session). The function is
`SECURITY DEFINER` so it bypasses RLS regardless of calling client.

### Pre-existing CI fixes (included in this PR)

1. **Markdownlint errors** in `docs/design/lld-phase-2-demo-ready.md` — table column count
   mismatch (3 cells in 2-column table) and blank lines inside blockquote.
2. **Next.js PageProps constraint** — `AssessmentsPage` had optional `searchParams` with default
   `= {}`, which doesn't satisfy the `PageProps` constraint. Made `searchParams` required and
   updated 10 test call sites.
3. **Missing `GITHUB_WEBHOOK_SECRET`** in CI — the webhook route validates this env var at
   module load time; Docker build and E2E steps lacked a placeholder value.

## Decisions made

- Used the user's authenticated client for `link_participant` RPC — the `SECURITY DEFINER`
  attribute on the SQL function means RLS is bypassed regardless.
- Fixed pre-existing CI failures in-band rather than deferring to separate issues.
- LLD §2.5 updated to correct the `adminSupabase` reference to `supabase`.

## Review feedback

- PR review found 0 blockers, 1 warning (stale LLD reference) — resolved via `/lld-sync`.

## Cost retrospective

| Metric | PR creation | Final | Delta |
|--------|------------|-------|-------|
| Cost | $1.10 | $5.92 | $4.82 |
| Output tokens | 6,958 | 29,597 | 22,639 |

### Cost drivers

1. **Pre-existing CI failures (dominant):** Three separate CI fix cycles (markdownlint, PageProps
   type, GITHUB_WEBHOOK_SECRET) each required a commit-push-wait cycle plus a ci-probe agent
   spawn. The actual bug fix was trivial — the CI cleanup was ~80% of the cost.
2. **CI probe agents (4 spawns):** Each ci-probe waited 5+ minutes for GitHub Actions to complete,
   consuming cache-read tokens while blocking.
3. **PR review agent:** One quality agent spawn re-read the diff.

### Improvement actions

- Pre-existing CI failures should be fixed on `main` before branching for features — they
  compound costs across every parallel feature branch.
- Consider a "CI health" check issue to track and fix broken builds proactively.

## Next steps

- Check project board for next Todo item.
