# Session Log — 2026-04-08 Session 3 — #191 cross-doc auth reconcile

## Issue

[#191](https://github.com/mironyx/feature-comprehension-score/issues/191) — chore: cross-doc grep & fix — reconcile `provider_token` / `user_github_tokens` / `read:org` references across `docs/`. Part of epic [#176](https://github.com/mironyx/feature-comprehension-score/issues/176) (onboarding-auth / org-membership-via-installation-token).

## PR

[#198](https://github.com/mironyx/feature-comprehension-score/pull/198) — merged to `main`.

## Work completed

One-pass reconciliation of documents outside the new HLD that still referenced the OAuth-user-token auth path removed by ADR-0020.

- **`docs/requirements/v1-requirements.md`** — Story 5.1 minimum OAuth scopes line updated: dropped `read:org` and `repo`, now lists `user:email` / `read:user` only and points to ADR-0020 + `github-auth-hld.md`. This is the one target-state doc that needed real content changes.
- **Superseded-in-part banners** added (blockquote at top, same pattern as ADR-0003 from #189) to:
  - `docs/design/lld-phase-2-web-auth-db.md`
  - `docs/design/spike-003-github-check-api.md`
  - `docs/design/spike-004-supabase-auth-github-oauth.md`
  - `docs/plans/2026-03-03-v1-requirements-plan.md`
  - `docs/plans/2026-03-09-v1-implementation-plan.md`
- **Left unchanged (intentional):**
  - `docs/adr/0003-auth-supabase-auth-github-oauth.md` already carries a superseded banner from #189.
  - Target-state docs — `github-auth-hld.md`, `ADR-0020`, `lld-onboarding-auth-resolver.md`, `lld-onboarding-auth-cutover.md`, `req-onboarding-and-auth.md`, `2026-04-07-onboarding-auth-epic.md`. These legitimately reference the old tokens/scopes because they define the replacement.
  - Timestamped session logs, drift reports, retros — treated as historical/git-history-equivalent per the acceptance criteria.

## Decisions made

- **No LLD for this task** — per the issue body ("documentation-only task. No LLD. No source code changes"). `/lld-sync` skipped accordingly.
- **Banner over rewrite for historical docs.** The phase-2 LLD, spikes, and original plans are snapshots of past design thinking. Rewriting them to match the new model would destroy the historical record; banners make the supersession explicit while preserving the artefact. This matches the precedent already set by #189 for ADR-0003.
- **Session logs and drift reports left alone.** The acceptance criteria permit "git history" as a valid location for stale references. Dated session/report files are the documentary equivalent of git history — adding superseded banners to every one would be churn with no value.
- **v1-requirements.md was the only target-state doc with a real drift.** The one scope bullet contradicted the new HLD; it was updated to point at ADR-0020 rather than deleted, so requirements still fully specify auth.

## Review feedback

`/pr-review-v2` — no findings. Docs-only diff (40 insertions, 1 deletion), no source/framework/config files touched.

## CI

`ci-probe` agent reported no workflow runs triggered for the PR branch — likely because workflows have path filters excluding docs-only changes. PR merged after team-lead review.

## Verification

Post-edit grep across `docs/` for `provider_token|user_github_tokens|get_github_token|/user/orgs|syncOrgMembership|read:org`: all remaining hits fall into one of the three allowed buckets per the acceptance criteria:

1. New HLD / target-state docs describing the old path being removed.
2. Historical LLDs / spikes / plans now carrying a superseded banner.
3. Dated session / report / retro logs (historical, git-history-equivalent).

## Notes

- Local `markdownlint` / `tsc` / `vitest` not run — no node in this environment. Relied on CI (which did not gate on docs-only paths anyway) and on the banner pattern being identical to ADR-0003's, which has already shipped.

## Next steps

Remaining onboarding-auth epic tasks on the board: `#187` (v1-design.md §3 rewrite — now merged per team-lead), `#189` (ADR-0003 banner — already in place), `#190` (GITHUB_APP_PRIVATE_KEY runbook). Epic #176 can progress once those land.
