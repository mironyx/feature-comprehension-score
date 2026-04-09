// Sign-in telemetry events.
// Design reference: docs/design/lld-onboarding-auth-telemetry.md
//
// Emits one structured Pino log line per sign-in outcome with a stable
// `event` field (`signin.success` | `signin.no_access` | `signin.error`).
// Downstream log sinks (e.g. GCP Cloud Logging) filter on `event` to build
// the onboarding funnel metrics described in requirement O.5.

import { logger } from '@/lib/logger';

export type SigninOutcome = 'success' | 'no_access' | 'error';

export interface SigninEventPayload {
  /** Supabase user id. Null for failures that occur before session exchange. */
  user_id: string | null;
  /** GitHub numeric user id. Null when identity metadata is unavailable. */
  github_user_id: number | null;
  /** Number of matching orgs resolved via the installation token. 0 for error/no_access. */
  matched_org_count: number;
}

/**
 * Emit exactly one sign-in outcome event.
 *
 * Uses the shared Pino `logger` per ADR-0016. The `event` field is prefixed
 * with `signin.` so a single filter can select all onboarding telemetry.
 */
export function emitSigninEvent(outcome: SigninOutcome, payload: SigninEventPayload): void {
  logger.info({ event: `signin.${outcome}`, ...payload }, 'sign-in outcome');
}
