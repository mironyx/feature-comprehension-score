// pollStatus — core polling logic for assessment status refresh.
// Pure async function, framework-agnostic. Issue: #207

export const POLL_INTERVAL_MS = 3_000;
export const MAX_POLLS = 20; // ~60s total

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'awaiting_responses',
  'rubric_failed',
]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

export interface PollCallbacks {
  onStatusChange: (status: string) => void;
  onTimeout: () => void;
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
      const data = await res.json() as { status: string };
      callbacks.onStatusChange(data.status);
      if (isTerminalStatus(data.status)) return;
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
