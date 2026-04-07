# LLD — Onboarding & Auth: GitHub App `members:read` Permission

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 1
**Related:** ADR-0020 §Decision point 5, ADR-0001
**Status:** Draft
**Date:** 2026-04-07

## 1. Purpose

Add the `members:read` (Organisation members → Read-only) permission to the FCS GitHub App so that `resolveUserOrgsViaApp` (Task 2) can call `GET /orgs/{org}/memberships/{username}` using the installation token. Document the re-consent procedure for existing installs (currently: mironyx).

This task is mostly **out-of-band work in the GitHub App settings UI** plus a small docs change. There is no application code change.

## 2. HLD coverage

Covered by ADR-0020 §Decision point 5 and §Consequences→Negative. No further HLD work.

## 3. Layers

### 3.1 GitHub App manifest

**Change:** add Organisation permission `Members: Read-only` to the FCS GitHub App.

**Where:** GitHub App settings UI at `https://github.com/organizations/mironyx/settings/apps/<app-slug>/permissions` (production App).

**No repo artefact for the manifest itself** — the App manifest is owned by GitHub, not version-controlled in this repo. If at any point we begin keeping an App manifest JSON in-repo for replay/automation, that file is updated as part of this task. A grep for `manifest` under the repo confirmed no current manifest file exists.

### 3.2 Re-consent procedure for existing installs

Per ADR-0020 §Consequences→Negative: a permission change causes GitHub to email org owners requesting re-consent. The installation continues to work on the **old** permission set until an owner approves. Our new `resolveUserOrgsViaApp` will fail with 403 for any install that has not re-consented.

**Procedure (out-of-band, manual):**

1. In the App settings, click "Request" on the new permission — this emails owners of every installation.
2. For mironyx: owner clicks the GitHub email → "Review request" → "Accept new permissions".
3. Verify re-consent landed: `GET /orgs/mironyx/memberships/<known-member>` returns 200 using a freshly minted installation token.

Re-consent must be verified **before** Task 3 (sign-in cutover) merges, otherwise production sign-in will break.

### 3.3 Docs

Add a section **"Required GitHub App permissions"** to `docs/onboarding/customer-setup-guide.md` listing every permission the App requests, each with a one-line justification. This section is the authoritative list Task 7 (the full onboarding guide) will expand around.

**Permissions list** (to be verified against the live App at implementation time):

| Permission | Scope | Why we need it |
|---|---|---|
| Contents | Read-only | Read PR source files for artefact extraction (ADR-0001, ADR-0011) |
| Pull requests | Read-only | Enumerate PRs and read diffs, comments, reviews |
| Checks | Read & write | Post FCS/PRCC Check Runs on PRs (ADR-0006) |
| Metadata | Read-only | Mandatory for all GitHub Apps |
| **Members** | **Read-only** | **New in ADR-0020: verify org membership at sign-in** |

The file `docs/onboarding/customer-setup-guide.md` does not yet exist; Task 1 creates it with the permissions section only. Task 7 fills in the surrounding walkthrough (install → sign in → add team → first assessment).

## 4. File changes

| File | Action | Notes |
|---|---|---|
| `docs/onboarding/customer-setup-guide.md` | **create** | Permissions section only; header + list. |
| (GitHub App settings) | **update out-of-band** | Add `members:read`. Not in repo. |

No source code changes. No schema changes. No tests.

## 5. Acceptance criteria

- [ ] FCS GitHub App has `Members: Read-only` permission enabled in GitHub's App settings.
- [ ] mironyx installation has re-consented to the new permission set, verified by a successful `GET /orgs/mironyx/memberships/<known-member>` using a freshly minted installation token.
- [ ] `docs/onboarding/customer-setup-guide.md` exists with a "Required GitHub App permissions" section listing every permission the App requests, each with a one-line justification.
- [ ] `npx markdownlint-cli2 "docs/onboarding/customer-setup-guide.md"` passes.
- [ ] `npx cspell "docs/onboarding/customer-setup-guide.md"` passes.

## 6. BDD specs

Not applicable — no code under test. Verification is manual (GitHub UI) + markdown lint.

## 7. Risks

- **Re-consent never arrives:** owner ignores the email. Mitigation: verify within 24 hours; if not done, ping the owner directly before Task 3 merges.
- **Verification requires minting an installation token**, which the current codebase does not do (see §8). For verification purposes, use a one-off `curl` with an App JWT from the local shell; no permanent code is needed for this task.

## 8. Known gap (raised for Task 2)

The existing code in `src/lib/github/client.ts` authenticates Octokit with the **stored user provider token** via Vault, not with an App installation token. ADR-0020's claim that "repo access already uses the installation token" is aspirational — the code path does not yet exist. Task 2 must introduce the App installation token helper (JWT signing + `POST /app/installations/{id}/access_tokens`) as part of the resolver. This LLD flags the gap; Task 2 owns the fix.

## 9. Task

**Task 1 — Add `members:read` to GitHub App + publish permissions list**

Steps:

1. Enable `Members: Read-only` in the FCS GitHub App settings (GitHub UI).
2. Click "Request" to trigger re-consent email to installation owners.
3. Have mironyx owner approve the re-consent.
4. Verify with `curl` using a freshly minted App JWT → installation token → `GET /orgs/mironyx/memberships/<member>`.
5. Create `docs/onboarding/customer-setup-guide.md` with the "Required GitHub App permissions" section only.
6. Commit, PR, merge.
