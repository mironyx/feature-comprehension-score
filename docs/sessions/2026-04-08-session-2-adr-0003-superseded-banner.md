# Session 2026-04-08 — ADR-0003 superseded banner (#189)

## Work completed

- Added a "Superseded in part" banner to `docs/adr/0003-auth-supabase-auth-github-oauth.md`
  pointing at [ADR-0020](../adr/0020-org-membership-via-installation-token.md).
- Status line updated from `Accepted` → `Accepted (superseded in part)`.
- Identity-provider choice (Supabase Auth + GitHub OAuth for sign-in / session management)
  remains in force; only the authorisation half (`provider_token` → `/user/orgs`) is marked
  superseded.
- PR: [#194](https://github.com/mironyx/feature-comprehension-score/pull/194)
- Issue: #189 (parent epic #176)

## Decisions made

- Banner implemented as a blockquote directly under the metadata block, not as a new
  top-level section — matches the convention used elsewhere for superseded-in-part ADRs
  and keeps the ADR body intact.
- `/lld-sync` skipped: docs-only task with no LLD (issue body explicitly states "No LLD.
  No source code changes.").
- `/diag` and feature-evaluator skipped: no source or test files changed.

## Review feedback addressed

None — no review cycle beyond creation.

## Next steps

- Siblings in the same epic #176 remain open: #187 (rewrite `v1-design.md` §3),
  #188 (ADR-0020 addendum), #190 (runbook `GITHUB_APP_PRIVATE_KEY`), #191 (cross-doc
  grep & reconcile).

## Notes / environment issues

- `gh-project-status.sh add 189 "in progress"` failed: gh token missing `read:project`
  scope. Board state for #189 was not updated from this worktree.
- `node`/`npx` were not available in this shell environment, so `markdownlint-cli2`,
  `tsc`, and `vitest` could not be run locally. CI on the PR validated the change.
- `.env.test.local` does not exist in the main repo; symlink step was a no-op.

## Cost retrospective

Cost script not run (no `node` / prometheus textfile access from this worktree and gh
token lacked project scopes). This was a minimal docs-only edit (1 file, +8/-1); expected
cost is negligible. No fix cycles, no compaction, no agent spawns beyond the scaffold.

**Improvement action:** ensure worktrees created by `/feature-team` inherit a working
node toolchain and a gh token with `read:project` scope so verification and board updates
are not silently skipped.
