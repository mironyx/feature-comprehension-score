# Session log — 2026-04-10 — Session 1 — #182 Sign-in telemetry events

**Branch:** `feat/signin-telemetry`
**PR:** [#200](https://github.com/mironyx/feature-comprehension-score/pull/200)
**Issue:** [#182](https://github.com/mironyx/feature-comprehension-score/issues/182)
**Status:** Merging via `/feature-end` (crash recovery)

> **Note:** This session was recovered from a crashed `/feature-team` teammate. The original
> implementation session could not be identified from the prom file (known gap — issue #203:
> `tag-session.py` finds the lead's JSONL via `/proc` rather than each teammate's JSONL).
> Session history was reconstructed from `git diff main...HEAD` and the PR body.

---

## Work completed

- **`src/lib/observability/signin-events.ts`** — new helper `emitSigninEvent` built exactly to
  LLD §4.1 spec. Exports `SigninOutcome`, `SigninEventPayload`, and `emitSigninEvent`. Uses the
  shared Pino `logger` (ADR-0016) at `info` level with a stable `event` field.
- **`src/lib/observability/signin-events.test.ts`** — 4 unit tests covering all three outcomes,
  null identity fields, and the stable `event` field contract. All pass.
- Markdown lint fixes committed separately.

## Decisions made

- **Partial implementation (deferred scope):** §4.2 (callback route wiring) deferred because
  #179 had not yet merged. The LLD scope implied both helper _and_ wiring; the PR notes this
  explicitly and calls out a follow-up PR after #179 merges.
- **Test file location:** `src/lib/observability/signin-events.test.ts` — co-located with the
  source file rather than under `tests/lib/`. Consistent with other unit test placement in this
  directory.

## Review feedback addressed

No review feedback — PR #200 was straightforward. PR was created by the teammate; no changes
were required post-creation.

## LLD sync

- §4.2 and §5 callback tests marked deferred (→ depends on #179).
- §6 ACs: 1, 3, 4, 5 (helper) checked; AC2 (callback wiring) deferred.
- Version: 0.1 → 0.2.

## Next steps / follow-up

- **Issue #179** — sign-in cutover to installation-token org membership. Once merged, a follow-up
  issue should wire `emitSigninEvent` into the callback route branches and close #182 fully.
- **Issue #203** — fix `tag-session.py` so teammates capture their own JSONL session IDs rather
  than the lead's. This will restore accurate session cost tracking for `/feature-team` runs.

## Cost retrospective

### Cost summary

Session cost data is unavailable — the teammate's session was not registered in the prom file
(see issue #203). PR body records no cost figures. No delta can be computed.

### Cost drivers

| Driver | Assessment |
|--------|-----------|
| Session not in prom | **Root cause:** `tag-session.py` follows `/proc` parent PID to the lead's process, not the teammate's. All cost for this feature was attributed to the lead session (FCS-182 was written with lead session ID). |
| Crash recovery overhead | `/feature-end` recovery path introduced in this session — adds agent-team crash recovery and session ID persistence to PR bodies going forward. |

### Improvement actions

- **Issue #203** (fix tag-session.py): teammates must print their own session ID so the lead can
  register it. This restores accurate per-teammate cost tracking.
- **Session ID in PR body**: added to `feature-core` Step 8 and `feature-end` Step 1 — future
  crash recoveries will find the session ID without relying on the prom file.
