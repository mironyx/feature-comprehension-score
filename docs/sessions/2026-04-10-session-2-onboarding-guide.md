# Session: 2026-04-10 Session 2 — Customer Onboarding Guide

**Issue:** #183 — docs: customer onboarding guide — install, sign in, first assessment
**Epic:** #176 — Onboarding & Auth — installation-token org membership
**PR:** #204
**Branch:** `feat/onboarding-guide-v2`

## Work completed

1. Expanded `docs/onboarding/customer-setup-guide.md` from a permissions-only stub
   (seeded by #177) into a full customer walkthrough covering:
   - Step 1: Install the GitHub App (with permissions table retained from #177)
   - Step 2: Sign in (OAuth flow, org picker, "No access" troubleshooting)
   - Step 3: Add team members (GitHub org membership as source of truth, roles)
   - Step 4: Run your first assessment (form fields, artefact extraction, results)
   - Troubleshooting table for common onboarding issues
2. Added `cspell.json` — repo-wide gap: no cspell config existed, so British English
   spellings (`organisation`, `artefact`, `authorise`) and project terms (`PRCC`,
   `Supabase`, `mironyx`) were flagged on every doc. Set `language: en-GB` and added
   a project word list.

## Decisions made

- **No LLD sync needed:** issue is docs-only with no LLD. Design reference is the
  requirements doc §O.6 directly.
- **Guide describes post-cutover state:** the sign-in section states OAuth requests
  only `read:user`, which is the target per requirements §O.1. Current code still has
  `read:org repo` scopes — these will be dropped when #179 (sign-in cutover) merges.
  Accepted as intentional; noted in PR review.
- **Branch renamed to `feat/onboarding-guide-v2`:** the original `feat/onboarding-guide`
  had a stale remote branch from a prior attempt. Used a fresh branch name to avoid
  history conflicts.

## Review feedback

- pr-review-v2: 0 blockers, 1 warning (OAuth scopes describe post-cutover state).
  No action needed — intentional per requirements.

## Cost retrospective

Cost data unavailable — session tagging ran in the worktree but the Prometheus
prom file was in the main repo's monitoring directory. The cost query script could
not find session data for FCS-183.

**Improvement action:** Ensure the prom file path is accessible from worktrees, or
symlink the monitoring directory alongside `.env.test.local`.

## Next steps

- #179 — feat: sign-in cutover to installation-token org membership (top of board)
- Once #179 merges, the onboarding guide's OAuth scope description becomes accurate.
