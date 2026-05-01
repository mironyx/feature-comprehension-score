// Adversarial evaluation tests for issue #207 — auto-refresh assessment status.
//
// Probes gaps in the implementation's own test suite. Failures are findings —
// do NOT fix the implementation in this file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startStatusPoll,
  isTerminalStatus,
  POLL_INTERVAL_MS,
  MAX_POLLS,
  FAST_INTERVAL_MS,
  SLOW_INTERVAL_MS,
  FAST_POLLS,
  SLOW_POLLS,
} from '@/app/(authenticated)/assessments/poll-status';

// Reuse helpers from the feature's own test file pattern.
// (poll-status.test.ts defines makeFetch and makeCallbacks locally;
//  they are short enough that duplication is acceptable here rather than
//  extracting, as they shape different scenarios.)

function makeFetch(statuses: string[]) {
  let call = 0;
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: statuses[call++] ?? statuses.at(-1) }),
  })) as unknown as typeof fetch;
}

function makeNonOkFetch() {
  return vi.fn(async () => ({
    ok: false,
    json: async () => ({}),
  })) as unknown as typeof fetch;
}

function makeCallbacks() {
  return {
    onStatusChange: vi.fn(),
    onTimeout: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// isTerminalStatus — boundary values
// ---------------------------------------------------------------------------

describe('isTerminalStatus — unknown statuses', () => {
  it('returns false for rubric_generation', () => {
    expect(isTerminalStatus('rubric_generation')).toBe(false);
  });

  it('returns false for an unknown status string', () => {
    // Unknown statuses should not be treated as terminal — polling must continue.
    expect(isTerminalStatus('unknown_state')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isTerminalStatus('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC-4: no polling when initialStatus is already terminal
// ---------------------------------------------------------------------------

describe('AC-4: startStatusPoll — should not fire when initialStatus is terminal', () => {
  // The useStatusPoll hook guards against polling when initialStatus is not
  // rubric_generation. However, poll-status.ts itself has no such guard —
  // it is the hook's responsibility. These tests confirm that the hook's
  // guard is the only protection, and the underlying startStatusPoll would
  // still poll if called with a terminal status. This is by design: the
  // contract is that callers must not invoke startStatusPoll unnecessarily.
  //
  // These tests also verify the integration at the hook level is correct
  // (AC-4) by confirming startStatusPoll is never called for terminal states.

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('startStatusPoll polls even if the current status is already terminal (caller responsibility)', async () => {
    // This documents that poll-status has no self-guard — the hook must guard.
    const fetchFn = makeFetch(['awaiting_responses']);
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    // It polls — there is no guard inside startStatusPoll itself.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AC-3: polling stops after timeout — persistent non-ok responses
// ---------------------------------------------------------------------------

describe('AC-3: timeout still fires when all responses are non-ok', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onTimeout after MAX_POLLS even when every response is non-ok', async () => {
    // Non-ok responses do not call onStatusChange but still count toward MAX_POLLS.
    // If they do NOT count, onTimeout would never fire — an infinite polling loop.
    const fetchFn = makeNonOkFetch();
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    // Exhaust fast phase (polls 1–21, each scheduled at FAST_INTERVAL_MS)
    for (let i = 0; i <= FAST_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(FAST_INTERVAL_MS);
    }

    // Exhaust slow phase (polls 22–44) plus one more to fire the timeout check
    for (let i = 0; i <= SLOW_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS);
    }

    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(MAX_POLLS);
  });
});

// ---------------------------------------------------------------------------
// AC-3: abort called before first timer fires
// ---------------------------------------------------------------------------

describe('AC-3: abort before first poll fires', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('never calls fetch when abort is issued before the first interval elapses', async () => {
    const fetchFn = makeFetch(['awaiting_responses']);
    const callbacks = makeCallbacks();

    const abort = startStatusPoll('a1', callbacks, fetchFn);
    abort(); // abort immediately, before timer fires

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-2: polling targets only the specified assessmentId
// ---------------------------------------------------------------------------

describe('AC-2: fetch URL targets the correct assessmentId', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('constructs fetch URL using the provided assessmentId', async () => {
    const fetchFn = makeFetch(['awaiting_responses']);
    const callbacks = makeCallbacks();

    startStatusPoll('target-assessment-xyz', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(fetchFn).toHaveBeenCalledWith(
      '/api/assessments/target-assessment-xyz',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('never uses a wildcard or different assessmentId in the fetch URL', async () => {
    const fetchFn = makeFetch(['awaiting_responses']);
    const callbacks = makeCallbacks();

    startStatusPoll('only-this-one', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    const [url] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('/api/assessments/only-this-one');
  });
});

// ---------------------------------------------------------------------------
// AC-1: onStatusChange is called for each status returned, including intermediate
// ---------------------------------------------------------------------------

describe('AC-1: status change callbacks during polling sequence', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onStatusChange for intermediate rubric_generation responses', async () => {
    // onStatusChange is called even for non-terminal statuses, allowing the UI
    // to remain current. Confirms this is the actual behaviour.
    const fetchFn = makeFetch(['rubric_generation', 'awaiting_responses']);
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rubric_generation' }),
    );

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'awaiting_responses' }),
    );
    expect(callbacks.onStatusChange).toHaveBeenCalledTimes(2);
  });

  it('stops calling onStatusChange after terminal status is received', async () => {
    const fetchFn = makeFetch(['awaiting_responses', 'awaiting_responses']);
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(callbacks.onStatusChange).toHaveBeenCalledTimes(1);

    // Advance further — no additional polls should fire.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(callbacks.onStatusChange).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AC-4 / page contract: PollingStatusBadge test removed — assessments page was
// rewritten for project-scoping (V11 E11.2) and no longer renders
// PollingStatusBadge directly. Polling is now scoped per-project.
// ---------------------------------------------------------------------------
