# Session 2 — 2026-04-08 — Runbook: `GITHUB_APP_PRIVATE_KEY`

**Issue:** [#190](https://github.com/mironyx/feature-comprehension-score/issues/190)
**PR:** [#196](https://github.com/mironyx/feature-comprehension-score/pull/196)
**Parent epic:** [#176](https://github.com/mironyx/feature-comprehension-score/issues/176)

## Work completed

- New `docs/runbooks/github-app-key.md` — dev/CI/prod provisioning, 90-day rotation
  (zero-downtime multi-key flow), incident response, and blast radius summary.
  Anchored to HLD §6 — the runbook is the operational counterpart, not a second source
  of truth.
- `.env.example` — added `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` placeholders,
  each with a comment pointing to the runbook. `PRIVATE_KEY` placeholder is
  double-quoted to model the `\n` literal-escape requirement.
- `CLAUDE.md` Key References — added a `Runbooks` row so future agents can find
  `docs/runbooks/` without guessing.

## Decisions made

- **No LLD.** Issue #190 is explicitly documentation-only; the HLD is the design
  artefact it anchors to. Skipped `/lld-sync` deliberately.
- **Filename `github-app-key.md`** (per issue scope), not `github-app-key-rotation.md`
  as the HLD §6.3 footnote mentions. Issue #191 (cross-doc grep & reconcile) will
  catch the HLD reference drift; not fixing it in this PR to keep scope tight.
- **Runbook is ops-first, not reference-first.** Blast radius section goes *first*
  so on-call sees the consequence before the procedure. Procedures are
  copy-pasteable `gcloud` / `gh secret` commands with concrete secret names.
- **Incident step 1 = revoke in GitHub UI**, not rotate Secret Manager. Matches
  HLD §6.4 — GitHub-side revocation invalidates App JWTs within seconds; Secret
  Manager rotation is step 2.

## Review feedback addressed

None — `/pr-review-v2 196` returned a clean no-issues comment (docs-only diff,
no code/framework/design-reference files). CI green across lint, type, unit,
integration, Docker build, and E2E (run 24141980322).

## Next steps

- **#188** — ADR-0020 addendum (security / key management). Already in progress
  on a sibling branch.
- **#187** — rewrite `v1-design.md` §3 token contexts.
- **#189** — ADR-0003 superseded banner.
- **#191** — cross-doc grep & reconcile (will catch the HLD §6.3 footnote that
  still references `github-app-key-rotation.md`).
- **Ops follow-up:** `gh` token on the workstation is missing `read:project`
  scope — `scripts/gh-project-status.sh add` failed at session start. Run
  `gh auth refresh -s read:project` before the next session.
- **Ops follow-up:** local Prometheus at `localhost:9090` was unreachable, so
  feature cost figures are `TBD` in the PR body and omitted from the
  retrospective below.

## Cost retrospective

PR body `Usage` section left as `TBD` — Prometheus unreachable at both PR
creation and feature-end. No delta to analyse. Drivers that *would* matter for
a code task (fix cycles, agent spawns, context compaction) did not apply:

- **Fix cycles:** zero. Single-commit docs change.
- **Agent spawns:** two — `ci-probe` (background) and self-run pr-review-v2
  short-circuited (docs-only, no Agent A/B/C launched).
- **Context compaction:** none.
- **LLD gaps:** N/A — no LLD.

**Improvement action for future docs-only tasks:** the pr-review-v2 skill's
single-agent path still spins up a full review harness for pure markdown diffs.
Worth a short-circuit at Step 2 ("if all changed files are `.md` / `.env*` /
`CLAUDE.md`, do a manual sanity check and post a no-issues comment") to save
the agent round-trip. Captured here for a future process retro.
