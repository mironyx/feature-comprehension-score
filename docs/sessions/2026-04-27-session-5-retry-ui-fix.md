# Session Log — 2026-04-27 — Session 5 — fix: retry UI frozen after 429

## Summary

Investigated and fixed a cluster of UI bugs around the rubric retry flow. The
LLM client already had auto-retry with exponential backoff for 429s (up to 3
attempts). The manual `RetryButton` only appears after all automatic retries are
exhausted. The bugs were entirely in the frontend state management.

## Root causes found

**Creation page (`create-assessment-form.tsx`):**
`useStatusPoll` stops its poll loop when it hits a terminal status
(`rubric_failed`). `router.refresh()` from `RetryButton` is inert for client
components — React does not reset `useState` when props change. So after retry,
the UI stayed frozen on `rubric_failed` with the poll loop dead.

**Organisation admin view (`assessment-overview-table.tsx` +
`deleteable-assessment-table.tsx`):**
`DeleteableAssessmentTable` holds `assessments` in `useState(initialAssessments)`.
React never re-initialises `useState` from props, so `router.refresh()` fetched
fresh server data but the local list stayed stale — the button went back to its
label, old content remained.

**Retry button label bug:**
`getButtonLabel` always showed the attempt label even when disabled. With
`retryCount=3` and `maxRetries=3`, this produced "Retry (Attempt 4 of 3)" next
to "Maximum retries reached (3 of 3)".

**Post-retry state on org view:**
After a retry, the row transitioned to `rubric_generation` with
`PollingStatusBadge` rendering live status. But when the generation failed again
(`rubric_failed`), `PollingStatusBadge` showed "Failed" while the local state
still had `rubric_generation`, so `RetryButton` was not shown — user had to
manually refresh.

## Changes

| File | Change |
| --- | --- |
| `retry-button.tsx` | `onSuccess?` prop; extracted `getButtonLabel` to fix label bug |
| `use-status-poll.ts` | `pollKey` param; effect resets snapshot and restarts poll when key increments |
| `create-assessment-form.tsx` | `CreationProgress`: `pollKey` state + `onSuccess={() => setPollKey(k=>k+1)}` |
| `assessment-overview-table.tsx` | `PollingStatusBadge` for `rubric_generation` rows instead of static `StatusBadge` |
| `deleteable-assessment-table.tsx` | `useEffect(() => setAssessments(initialAssessments), [initialAssessments])` syncs server data after `router.refresh()` |
| `polling-status-badge.tsx` | Calls `router.refresh()` on terminal status so org table re-syncs, `RetryButton` reappears |
| `types.ts` | Added `warn` to `LLMLogger` interface |
| `client.ts` | `logger.warn` on each auto-retry attempt with attempt number and error code |
| `deleteable-assessment-table.test.ts` | `PollingStatusBadge` mock; GROUP 5 (rubric_generation renders badge); GROUP 6 (useEffect sync); `useEffect: vi.fn()` in React mock |
| `client.test.ts` | `warn: vi.fn()` in mock; retry logging test |
| `create-assessment-progress.test.ts` | `pollKey`/`onSuccess` wiring source-text tests |

## Key design note

`PollingStatusBadge` now calls `router.refresh()` internally on terminal status.
This is what closes the loop on the org view: fresh server data arrives →
`useEffect` in `DeleteableAssessmentTable` syncs state → row re-renders with
correct status and `RetryButton` if needed.

## Commit

`378d450` — fix: restore UI responsiveness after LLM retry
