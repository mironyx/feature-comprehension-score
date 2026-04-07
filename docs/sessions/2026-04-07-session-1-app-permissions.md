# Session log — 2026-04-07 #1

**Issue:** #177 — feat: add members:read permission to GitHub App + publish permissions list
**PR:** [#184](https://github.com/mironyx/feature-comprehension-score/pull/184)
**Epic:** #176 — Onboarding & Auth

## Work completed

- Created [docs/onboarding/customer-setup-guide.md](../onboarding/customer-setup-guide.md) as a stub containing the authoritative "Required GitHub App permissions" section per LLD §3.3, including the new `Members: Read-only` entry from ADR-0020.
- Out-of-band (GitHub App settings UI, not in repo):
  - Added `Members: Read-only` permission to the FCS GitHub App.
  - Saved changes → GitHub auto-emailed re-consent request to mironyx owners.
  - mironyx owner accepted re-consent. Verified via the active permissions list on the installation page: "Read access to checks, code, issues, members, metadata, and pull requests".

## Decisions made

- **LLD verification shortcut.** The LLD specified a full curl verification path (mint App JWT → exchange for installation token → `GET /orgs/mironyx/memberships/<user>`). In practice this is ~30 minutes of token plumbing for a one-off check. We accepted the simpler alternative: confirming `members` appears in the active permissions list on the mironyx installation page. The real end-to-end proof will come naturally when Task 2 (`resolveUserOrgsViaApp`) runs for the first time. LLD should be updated to reflect this in a follow-up.
- **Organization webhook event — deferred.** Discussed enabling the Organization webhook event in the same re-consent cycle to support future user-removal handling without a second consent round. Not done this session; can be batched with a later permission change or handled when Task 2+ needs it.
- **cspell failures are pre-existing.** No cspell config in repo; British English spellings fail across all existing docs. Not introduced by this PR — noted in PR body.

## Review feedback addressed

None — trivial docs stub, no review findings.

## Next steps / follow-ups

- Update LLD §3.2 / §5 to replace the curl verification step with "confirm active permissions list shows `members`" (noted as TODO).
- Consider enabling the Organization webhook event before Task 2 lands, to avoid a second re-consent cycle when user-removal handling is added.
- Proceed to Task 2 of epic #176: `resolveUserOrgsViaApp` helper.

## Cost

Queried in Step 2.5 — see PR comment on #184.
