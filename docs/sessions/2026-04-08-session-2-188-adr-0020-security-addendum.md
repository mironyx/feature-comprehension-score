# Session log — 2026-04-08 session 2 — ADR-0020 security addendum (#188)

## Work completed

- Issue: #188 — `docs: ADR-0020 addendum — security/key-management + current-state correction`
- PR: #195 — <https://github.com/mironyx/feature-comprehension-score/pull/195>
- Parent epic: #176 (onboarding-auth)

Edits, all in `docs/adr/0020-org-membership-via-installation-token.md`:

1. **Correction block** prepended to §"What the user OAuth provider token is actually used
   for today". Marks the audit in that section as aspirational (i.e. the intended end state
   of this ADR) rather than a description of `main` at the time the ADR was accepted, and
   points readers at `docs/design/github-auth-hld.md` (HLD from #186) as the authoritative
   current-state source of truth.
2. **New "Security: GitHub App private key management" section**, inserted before
   "Open Questions". Covers:
   - Storage tiers: `.env.local` (dev, gitignored), GitHub Actions encrypted secret (CI),
     Google Secret Manager entry `github-app-private-key` mounted into Cloud Run.
   - Never in source, `.env.example`, logs, errors, or `console.log` debug aids.
   - Zero-downtime rotation exploiting GitHub's support for multiple active private keys
     (generate new → update Secret Manager → redeploy → verify telemetry → delete old).
     Annual minimum cadence.
   - Revocation / incident response: delete the compromised key first, replace second,
     audit Google Secret Manager + GH Actions + GitHub App audit logs, rotate any
     co-exposed credentials, record as a retro entry.
   - Blast radius: what an attacker with key + App ID can and cannot do; ~1h residual
     access window per minted installation token after key deletion (installation tokens
     are not individually revocable).
   - Quarterly IAM audit: Cloud Run service account + named human operators only; drift
     from Terraform-declared list is resolved before the review issue closes.

## Decisions made

- Kept the corrected-but-wrong audit section in place and annotated it with a correction
  block rather than rewriting it. Rationale: the section correctly describes the end state
  the ADR delivers; rewriting would duplicate the HLD and obscure the intent.
- Documented rotation as zero-downtime (multiple active keys) rather than a break-glass
  cutover. GitHub supports this natively, so there is no reason to build anything custom
  around it.
- Defined blast-radius time floor as ~1h (installation-token lifetime) — recorded
  explicitly so incident playbooks cannot claim "key deleted = exposure over".
- Quarterly Secret Manager IAM audit tied to a tracked issue with a Terraform-vs-live
  comparison checklist, rather than a soft convention.

## Review feedback addressed

None — PR just opened. The issue explicitly notes "No PR review of design principles —
this is text."

## LLD sync

**Skipped.** This task has no LLD — the issue body states "This is a documentation-only
task. No LLD. No source code changes."

## Notes and caveats

- Node toolchain is not available in the worktree shell used this session, so
  `markdownlint-cli2`, `vitest`, `tsc`, and `npm run lint` could not be run locally.
  CI runs these on the PR; any failures will be addressed there.
- `/diag` skipped — docs-only change, no source files touched.
- `feature-evaluator` skipped — docs-only, no LLD.
- `scripts/gh-project-status.sh add 188 "in progress"` failed at session start because
  the local `gh` token lacks the `read:project` scope; the board was not moved.
  `/feature-end` will attempt the `done` transition which will likely fail the same way;
  if so, the board needs to be updated manually (or the token refreshed with
  `gh auth refresh -s read:project`).
- `scripts/query-feature-cost.py` could not reach Prometheus (monitoring stack not
  running locally), so the PR body carries `TBD` placeholders for Cost / Tokens / Time
  and the `*-pr` / `*-final` cost labels were not applied to the issue or the PR.

## Cost retrospective

Final cost not available — Prometheus was unreachable from the worktree shell, so
neither the PR-creation snapshot nor the final total could be queried. When the
monitoring stack is back up, `scripts/query-feature-cost.py FCS-188 --issue 188 --pr 195
--stage final` can be run manually to backfill the labels.

Subjective cost drivers for this task:

| Driver | Observed | Impact |
|---|---|---|
| Context compaction | None | — |
| Fix cycles | Zero — single-shot doc edit | — |
| Agent spawns | Zero (docs-only, no evaluator / pr-review / diag) | — |
| LLD quality gaps | N/A | — |
| Mock / framework gotchas | N/A | — |
| Tooling availability | `npx` missing in worktree shell, Prometheus down, `gh` scope missing | Low but cumulative friction — three "cannot run locally" outcomes in one session |

**Improvement actions for next session:**

- Run `gh auth refresh -s read:project` at the start of a parallel-team session so
  `gh-project-status.sh` works without manual intervention.
- Ensure the worktree shell can reach the repo's Node toolchain before starting even a
  docs-only task — markdown lint is part of the verification contract.
- Bring up the monitoring stack (or make the cost script fail gracefully enough to still
  apply labels from whatever partial data it has) so cost tracking is not lost on
  environment mismatches.

## Next steps

- Remaining epic-176 doc cleanup tasks queued: #187, #189, #190, #191.
- Once CI on #195 is green and the PR is merged, the correction block's link becomes
  live against `main`, which closes the loop with HLD #186.
