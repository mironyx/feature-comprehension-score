# Team Session — Epic 18: Pipeline Observability & Recovery

**Date:** 2026-04-21
**Lead:** team-lead (feature-team-272-274-273)
**Epic:** #271 — Pipeline Observability & Recovery (E18)

## Issues shipped

| Issue | Story | PR | Branch | Merged |
|-------|-------|----|--------|--------|
| #272 | Pipeline error capture & structured logging (E18.1) | #275 | feat/e18-error-capture-logging | 2026-04-21 |
| #274 | Pipeline progress visibility (E18.3) | #276 | feat/e18-progress-visibility | 2026-04-21 |
| #273 | Assessment retry guardrails & error display (E18.2) | #277 | feat/e18-retry-guardrails | 2026-04-21 |

## Cross-cutting decisions

- **ADR-0025 scope extended mid-run:** teammate-272 introduced the `org_id` predicate rule for service-role writes. teammate-273 immediately applied it to the retry service, and issue #278 was raised to audit all remaining `adminSupabase` usages. This cross-cut all three tasks.
- **`onToolCall` callback as shared hook:** #272 added the engine-layer callback; #274 reused it for progress updates. Correct sequencing — #274 depended on the hook existing, but the soft coupling in the original Mermaid diagram meant they ran in parallel. No conflict because they touched different engine files (only `tables.sql` was the real risk).
- **`tables.sql` soft coupling became a real conflict:** #272 and #274 both added columns to `tables.sql` in the same wave. The epic's dashed edge was insufficient — this should have been a solid dependency. Architect skill updated in both repos to enforce the rule: shared source files = hard dependency = different waves.

## Coordination events

- Wave 1 (#272 + #274) spawned in parallel; wave 2 (#273) held until both PRs merged.
- Wave 1 CI: first run on #275 exposed a pre-existing markdownlint issue (`||` in a session log table cell) — fixed in `d52f36b` with `[skip ci]` on main to prevent re-trigger.
- User added `org_id` security scoping to #272 mid-review (commit `962d444`); ADR-0025 written in-band. This added ~$3 cost and one CI cycle but the right call.
- `gh-create-issue.sh --add-to-board` silently skipped board add because `gh-project-status.sh` lacked executable bit. Fixed in `bc17dd7`.
- teammate-274 sent only idle notifications for ~30 min before being nudged for a full report — protocol gap where the teammate reported to itself rather than the lead.

## What worked / what didn't

**Worked:**
- Wave-by-wave sequencing held: #273 had all error columns available from day one.
- Per-teammate TDD discipline tight: evaluator stayed in audit mode on all three (0–4 adversarial tests each, not backfilling).
- ADR-0025 written and applied immediately across the wave — no drift lag.

**Didn't:**
- Soft coupling in `tables.sql` should have been a hard wave dependency in the LLD. Led to potential merge conflict risk (mitigated by luck of independent columns).
- teammate-274 idle-notification-only period wasted ~30 min and one lead nudge.
- `gh-create-issue.sh` silent failure on board add wasted a manual step and extra tokens.

## Process notes for `/retro`

- Add to `/architect` skill: shared source files are hard wave dependencies, not soft. ✓ Done (commit `df7a72e`).
- Fix `gh-project-status.sh` executable bit in repo setup / onboarding docs so new clones don't hit this.
- Investigate why teammate-274's full report message didn't arrive — possible idle-before-send race in the agent protocol.
