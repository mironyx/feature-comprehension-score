# LLD — Onboarding & Auth: Sign-in Telemetry

**Parent epic:** #176 — Onboarding & Auth — installation-token org membership
**Plan:** [docs/plans/2026-04-07-onboarding-auth-epic.md](../plans/2026-04-07-onboarding-auth-epic.md) Task 6
**Related:** [req-onboarding-and-auth.md](../requirements/req-onboarding-and-auth.md) §O.5, ADR-0016 (structured logging — Pino), [lld-onboarding-auth-cutover.md](lld-onboarding-auth-cutover.md) §4 (stub call site)
**Status:** Revised
**Date:** 2026-04-07
**Revised:** 2026-04-10 | Issue #182

| Version | Date | Notes |
|---|---|---|
| 0.1 | 2026-04-07 | Draft |
| 0.2 | 2026-04-10 | Issue #182 — helper built; callback wiring deferred |

## 1. Purpose

Emit exactly one structured telemetry event per sign-in outcome, as required by O.5. The call sites already exist in `/auth/callback/route.ts` after Task 3 (as the `emitSigninEvent` stub); this task provides the real helper and wires it in.

No separate observability LLD exists in this repo today, so the telemetry helper lives inline under this task rather than updating an existing doc.

## 2. HLD coverage

Requirement O.5 is the full contract: one of three event names, with a fixed payload.

## 3. Events

| Event name | When emitted | Payload |
|---|---|---|
| `signin.success` | `resolveUserOrgsViaApp` returned ≥ 1 matching org | `{ user_id, github_user_id, matched_org_count }` |
| `signin.no_access` | `resolveUserOrgsViaApp` returned 0 matching orgs | `{ user_id, github_user_id, matched_org_count: 0 }` |
| `signin.error` | `exchangeCodeForSession` failed, or `resolveUserOrgsViaApp` threw, or the identity metadata was malformed | `{ user_id, github_user_id, matched_org_count: 0 }` — `user_id` may be `null` for early failures |

Events are emitted via the existing Pino `logger` (ADR-0016) at `info` level with a stable `event` field:

```ts
logger.info({
  event: 'signin.success',
  user_id: '...',
  github_user_id: 12345,
  matched_org_count: 2,
}, 'sign-in outcome');
```

This matches the repo's existing structured-logging convention and requires no new infrastructure. A downstream log sink (GCP Cloud Logging) can filter on `event` to produce onboarding funnel metrics.

## 4. Layers

### 4.1 Backend

**New file:** `src/lib/observability/signin-events.ts`

```ts
import { logger } from '@/lib/logger';

export type SigninOutcome = 'success' | 'no_access' | 'error';

export interface SigninEventPayload {
  user_id: string | null;
  github_user_id: number | null;
  matched_org_count: number;
}

export function emitSigninEvent(outcome: SigninOutcome, payload: SigninEventPayload): void {
  logger.info({ event: `signin.${outcome}`, ...payload }, 'sign-in outcome');
}
```

Null-tolerance on `user_id` and `github_user_id` is deliberate: `signin.error` may fire before the session is exchanged, at which point the identity is not yet known. Tests assert the helper accepts nulls and serialises them as `null` in the log line.

### 4.2 Call sites (modifications to `auth/callback/route.ts`)

_(deferred → depends on #179 — callback route refactor)_

Task 3 already left stubs for this. This task imports `emitSigninEvent` and replaces the stub:

- On `missing_code`: `emitSigninEvent('error', { user_id: null, github_user_id: null, matched_org_count: 0 })`.
- On `exchangeCodeForSession` failure: same as above.
- On malformed identity metadata: `emitSigninEvent('error', { user_id: user.id, github_user_id: null, matched_org_count: 0 })`.
- On resolver success with ≥ 1 match: `emitSigninEvent('success', { user_id, github_user_id, matched_org_count })`.
- On resolver success with 0 matches: `emitSigninEvent('no_access', { ... matched_org_count: 0 })`.
- On resolver throw: `emitSigninEvent('error', { user_id, github_user_id, matched_org_count: 0 })`.

Exactly one event per request — enforced by the early-return structure of the callback.

> **Implementation note (issue #182):** The callback wiring was deferred because #179 (callback route refactor) had not yet been merged. The `emitSigninEvent` helper is complete and tested; §4.2 will be applied in the issue that resolves the #179 dependency.

## 5. Tests

**New file:** `src/lib/observability/signin-events.test.ts`.

```ts
describe('emitSigninEvent', () => {
  it('emits signin.success with the given payload');
  it('emits signin.no_access with matched_org_count 0');
  it('emits signin.error when user_id is null');
  it('includes the event field on every emission');
});
```

**Extend:** `src/app/auth/callback/route.test.ts` (create if it does not exist). _(deferred → depends on #179)_

```ts
describe('/auth/callback telemetry', () => {
  it('emits exactly one signin.success on a happy-path sign-in');
  it('emits exactly one signin.no_access when no orgs match');
  it('emits exactly one signin.error when resolveUserOrgsViaApp throws');
  it('emits exactly one signin.error when the code is missing');
  it('never emits more than one event per request');
});
```

These tests stub the logger (`vi.spyOn(logger, 'info')`) and assert call counts and arguments.

## 6. Acceptance criteria

- [x] `src/lib/observability/signin-events.ts` exports `emitSigninEvent` with the signature above.
- [ ] Every branch of `/auth/callback/route.ts` emits exactly one event. _(deferred → depends on #179)_
- [x] The `event` field on each log line is exactly one of `signin.success`, `signin.no_access`, `signin.error`.
- [x] Payload fields: `user_id` (string | null), `github_user_id` (number | null), `matched_org_count` (number).
- [x] Helper tests in §5 pass. Callback telemetry tests deferred (see §4.2 note).
- [x] `npx tsc --noEmit` passes.

## 7. Non-goals

- Wiring into a real metrics backend (Prometheus, GCP, etc.). The log sink handles this.
- Instrumenting any other endpoint.
- Counters, histograms, or OpenTelemetry — Pino log lines are sufficient for V1 per ADR-0016.

## 8. Task

**Task 6 — Sign-in telemetry events**

Depends on Task 3. Estimated ~80 lines including tests.
