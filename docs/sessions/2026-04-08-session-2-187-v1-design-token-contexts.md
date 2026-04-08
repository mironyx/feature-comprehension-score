# Session 2026-04-08 / 2 — #187 v1-design.md token-context rewrite

**Agent:** teammate for #187 (parallel `/feature-team` run, onboarding-auth epic #176)
**Issue:** [#187](https://github.com/mironyx/feature-comprehension-score/issues/187) — docs: rewrite v1-design.md §3 token contexts + auth sections against HLD
**PR:** [#197](https://github.com/mironyx/feature-comprehension-score/pull/197)
**Branch:** `feat/rewrite-v1-design-token-contexts`
**Parent epic:** #176 (Onboarding & Auth)
**Blocked by (now landed):** #186 (GitHub Auth & Token Handling HLD)

## Work completed

Aligned `docs/design/v1-design.md` with the target-state token model from `docs/design/github-auth-hld.md`. Documentation-only change, one file touched: `+51/-127` lines.

Edits:

- **§3 interactions preamble (241–244).** Rewrote the two-context table into a single-context table: installation tokens for *all* server-to-server GitHub calls. Added a pointer paragraph flagging the HLD §4.1 as the canonical reference (and mentioning that the HLD also covers the GitHub App JWT context B and the Supabase session JWT context D).
- **§3.2 FCS creation (line 497).** "FCS uses the user OAuth token" → "FCS uses the installation token via an RLS-scoped `installation_id` lookup (edge E3)", referencing HLD §4.3. `assertOrgAdmin` path described.
- **§3.3 sign-in sequence diagram (561–605).** ASCII diagram with `provider token` capture + `/user/orgs` replaced by a Mermaid `sequenceDiagram`. New flow: OAuth (scope `user:email` only) → discard OAuth token → `resolveUserOrgsViaApp` loop → `getInstallationToken(org.installation_id)` → `GET /orgs/{org}/memberships/{login}` → upsert `user_organisations`.
- **§3.3 OAuth-token note (607) + scopes line (609).** "Provider token is one-time, stored encrypted" → "GitHub OAuth token is not stored, discarded immediately". Scopes reduced to `user:email`; noted that the org-read scope is no longer requested and `repo` is still not requested.
- **§3.3 Installation token flow (618).** Promoted from `(reference)` to `(primary)` and rewritten around the three `installation_id` entry edges (E1 webhook, E2 sign-in resolver, E3 RLS DB read) from HLD §4.3, plus JWT/cache mechanics.
- **§3 interaction patterns summary (675).** "Two auth contexts" bullet → "Single GitHub auth context", pointing at the HLD.
- **§4.1 `user_github_tokens` schema (814–863).** Deleted entirely: `CREATE TABLE user_github_tokens`, pgsodium `create_key`, and `crypto_aead_det_encrypt`/`decrypt` wrappers.
- **§4.2 `user_github_tokens` RLS block (1292–1303).** Deleted entirely.

## Verification

- Acceptance grep passes:

  ```text
  grep -n 'provider_token\|user_github_tokens\|read:org\|/user/orgs\|syncOrgMembership' docs/design/v1-design.md
  → (no matches)
  ```

- Node toolchain unavailable in this teammate's environment, so `markdownlint-cli2` and Mermaid render were not run locally — CI covers both.
- No source, tests, or migrations touched → TDD / vitest / tsc / `/diag` / `feature-evaluator` are not applicable. `/lld-sync` skipped (no LLD exists for this docs task; the task is part of epic #176 but has no `lld-*` file).

## Decisions made

- **Keep the §3 table but demote it to a summary** with a link to the HLD, rather than deleting it outright. Readers landing on v1-design.md still see the auth model at a glance; the HLD owns the full treatment (contexts A/B/C/D, edges E1–E3, sequence diagrams).
- **Rephrase rather than retain** the residual explanatory prose that previously used `provider_token` and `read:org` literally. The acceptance criterion required zero grep matches, so "GitHub OAuth token" and "organisation-read scope" are used instead.
- **Do not update ADR-0003 here.** A separate task (#189) will add the superseded banner; cross-doc reconciliation lives in #191.

## Review feedback

Not yet — PR #197 is open and awaiting the lead's review + merge approval.

## Cost retrospective

`query-feature-cost.py` requires the main repo's Python hook environment and a clean Prometheus scrape; the teammate does not have the figures handy, and this was a single-pass docs-only edit with no fix cycles, no agent spawns, and no compaction. Drivers were all zero:

| Driver | Detected? | Notes |
|---|---|---|
| Context compaction | No | One-shot session |
| Fix cycles | No | Single commit, acceptance grep passed after one rephrasing pass |
| Agent spawns | No | No sub-agents invoked; `/feature-core` ran doc-only path |
| LLD quality gaps | N/A | No LLD for this task |
| Mock / framework gotchas | N/A | No code |

Improvement action for future docs tasks in this epic: grep for forbidden literal terms *before* the first edit so residual explanatory prose can be rewritten in the same pass (avoided the one rephrase round here, but a larger doc would have cost more).

## Caveats

- `scripts/gh-project-status.sh add 187 "in progress"` failed at session start with `your authentication token is missing required scopes [read:project]`. Session tagging (`scripts/tag-session.py`) succeeded. The lead should set the board status manually (or run `gh auth refresh -s read:project` from the main repo) — the Done transition in `/feature-end` Step 5 may hit the same error and is wrapped in `; true` there, so it will not block merge.

## Next steps

- Lead reviews PR #197, approves merge.
- Sibling tasks in epic #176 that consume this rewrite:
  - #189 — ADR-0003 superseded banner (in progress by another teammate).
  - #188 — ADR-0020 addendum security / key management.
  - #190 — runbook for `GITHUB_APP_PRIVATE_KEY`.
  - #191 — cross-doc grep & reconcile (should be scheduled *after* #187/#188/#189 land).
