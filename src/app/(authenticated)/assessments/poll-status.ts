// pollStatus — core polling logic for assessment status refresh.
// Pure async function, framework-agnostic. Issue: #207
// Progress fields added for V2 Epic 18, Story 18.3.
// Adaptive polling and error fields added for #333.

export const FAST_INTERVAL_MS = 3_000;
export const SLOW_INTERVAL_MS = 10_000;
export const FAST_POLLS = 20;   // ~60s at 3s
export const SLOW_POLLS = 24;   // ~240s at 10s — total ~300s

// Backward-compat aliases used by eval tests
export const POLL_INTERVAL_MS = FAST_INTERVAL_MS;
export const MAX_POLLS = FAST_POLLS + SLOW_POLLS;

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'awaiting_responses',
  'rubric_failed',
]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface PollSnapshot {
  readonly status: string;
  readonly rubricProgress: string | null;
  readonly rubricProgressUpdatedAt: string | null;
  readonly rubricErrorCode: string | null;
  readonly rubricRetryCount: number;
  readonly rubricErrorRetryable: boolean | null;
}

export interface PollCallbacks {
  onStatusChange: (snapshot: PollSnapshot) => void;
  onTimeout: () => void;
}

interface AssessmentPollResponse {
  status: string;
  rubric_progress?: string | null;
  rubric_progress_updated_at?: string | null;
  rubric_error_code?: string | null;
  rubric_retry_count?: number;
  rubric_error_retryable?: boolean | null;
}

function toSnapshot(data: AssessmentPollResponse): PollSnapshot {
  return {
    status: data.status,
    rubricProgress: data.rubric_progress ?? null,
    rubricProgressUpdatedAt: data.rubric_progress_updated_at ?? null,
    rubricErrorCode: data.rubric_error_code ?? null,
    rubricRetryCount: data.rubric_retry_count ?? 0,
    rubricErrorRetryable: data.rubric_error_retryable ?? null,
  };
}

function currentInterval(pollCount: number): number {
  return pollCount <= FAST_POLLS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
}

/**
 * Starts polling GET /api/assessments/[id] for status changes.
 * Returns an abort function to stop polling.
 */
export function startStatusPoll(
  assessmentId: string,
  callbacks: PollCallbacks,
  fetchFn: typeof fetch = fetch,
): () => void {
  const controller = new AbortController();
  let pollCount = 0;
  let timerId: ReturnType<typeof setTimeout>;

  const poll = async () => {
    pollCount += 1;
    if (pollCount > MAX_POLLS) {
      callbacks.onTimeout();
      return;
    }

    try {
      const res = await fetchFn(`/api/assessments/${assessmentId}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        timerId = setTimeout(poll, currentInterval(pollCount));
        return;
      }
      const data = await res.json() as AssessmentPollResponse;
      const snapshot = toSnapshot(data);
      callbacks.onStatusChange(snapshot);
      if (isTerminalStatus(snapshot.status)) return;
    } catch { // fire-and-forget — network errors retry on next poll interval
      if (controller.signal.aborted) return;
    }

    timerId = setTimeout(poll, currentInterval(pollCount));
  };

  timerId = setTimeout(poll, currentInterval(pollCount));

  return () => {
    controller.abort();
    clearTimeout(timerId);
  };
}
