// pollStatus — core polling logic for assessment status refresh.
// Pure async function, framework-agnostic. Issue: #207
// Progress fields added for V2 Epic 18, Story 18.3.

export const POLL_INTERVAL_MS = 3_000;
export const MAX_POLLS = 20; // ~60s total

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
}

export interface PollCallbacks {
  onStatusChange: (snapshot: PollSnapshot) => void;
  onTimeout: () => void;
}

interface AssessmentPollResponse {
  status: string;
  rubric_progress?: string | null;
  rubric_progress_updated_at?: string | null;
}

function toSnapshot(data: AssessmentPollResponse): PollSnapshot {
  return {
    status: data.status,
    rubricProgress: data.rubric_progress ?? null,
    rubricProgressUpdatedAt: data.rubric_progress_updated_at ?? null,
  };
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
        timerId = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      const data = await res.json() as AssessmentPollResponse;
      const snapshot = toSnapshot(data);
      callbacks.onStatusChange(snapshot);
      if (isTerminalStatus(snapshot.status)) return;
    } catch { // fire-and-forget — network errors retry on next poll interval
      if (controller.signal.aborted) return;
    }

    timerId = setTimeout(poll, POLL_INTERVAL_MS);
  };

  timerId = setTimeout(poll, POLL_INTERVAL_MS);

  return () => {
    controller.abort();
    clearTimeout(timerId);
  };
}
