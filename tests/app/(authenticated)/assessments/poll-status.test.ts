// Tests for poll-status — core polling logic for assessment status refresh.
// Issue: #207

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetch(statuses: string[]) {
  let call = 0;
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ status: statuses[call++] ?? statuses.at(-1) }),
  })) as unknown as typeof fetch;
}

function makeCallbacks() {
  return {
    onStatusChange: vi.fn(),
    onTimeout: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isTerminalStatus', () => {
  it('returns true for awaiting_responses', () => {
    expect(isTerminalStatus('awaiting_responses')).toBe(true);
  });

  it('returns true for rubric_failed', () => {
    expect(isTerminalStatus('rubric_failed')).toBe(true);
  });

  it('returns false for rubric_generation', () => {
    expect(isTerminalStatus('rubric_generation')).toBe(false);
  });
});

describe('startStatusPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Given status resolves to awaiting_responses', () => {
    it('calls onStatusChange and stops polling', async () => {
      const fetchFn = makeFetch(['awaiting_responses']);
      const callbacks = makeCallbacks();

      startStatusPoll('a1', callbacks, fetchFn);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_responses' }),
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);

      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given status resolves to rubric_failed', () => {
    it('calls onStatusChange and stops polling', async () => {
      const fetchFn = makeFetch(['rubric_failed']);
      const callbacks = makeCallbacks();

      startStatusPoll('a1', callbacks, fetchFn);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rubric_failed' }),
      );
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given status remains rubric_generation then resolves', () => {
    it('continues polling until terminal status', async () => {
      const fetchFn = makeFetch([
        'rubric_generation',
        'rubric_generation',
        'awaiting_responses',
      ]);
      const callbacks = makeCallbacks();

      startStatusPoll('a1', callbacks, fetchFn);

      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      }

      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(callbacks.onStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'awaiting_responses' }),
      );
    });
  });

  describe('Given polling exceeds max attempts', () => {
    it('calls onTimeout after exhausting both fast and slow phases', async () => {
      const fetchFn = makeFetch(['rubric_generation']);
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

  describe('Given abort is called', () => {
    it('stops polling', async () => {
      const fetchFn = makeFetch(['rubric_generation']);
      const callbacks = makeCallbacks();

      const abort = startStatusPoll('a1', callbacks, fetchFn);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      abort();

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given fetch returns non-ok response', () => {
    it('retries on next interval', async () => {
      let call = 0;
      const fetchFn = vi.fn(async () => {
        call++;
        if (call === 1) return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => ({ status: 'awaiting_responses' }) };
      }) as unknown as typeof fetch;
      const callbacks = makeCallbacks();

      startStatusPoll('a1', callbacks, fetchFn);

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(callbacks.onStatusChange).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      expect(callbacks.onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'awaiting_responses' }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Adaptive polling intervals (#333 Fix C)
// ---------------------------------------------------------------------------

describe('Adaptive polling intervals (#333 Fix C)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Given FAST_POLLS + SLOW_POLLS intervals, then total coverage is at least 300 seconds', () => {
    // I5 [lld §Fix C]: total polling window >= 300s
    const totalMs = FAST_POLLS * FAST_INTERVAL_MS + SLOW_POLLS * SLOW_INTERVAL_MS;
    expect(totalMs).toBeGreaterThanOrEqual(300_000);
  });

  it('Given polling has run FAST_POLLS times without terminal status, then the next poll is scheduled at SLOW_INTERVAL_MS', async () => {
    // I6 [lld §Fix C]: interval shifts from FAST_INTERVAL_MS to SLOW_INTERVAL_MS after the fast phase.
    // currentInterval uses pollCount <= FAST_POLLS, so poll FAST_POLLS+1 fires at FAST_INTERVAL_MS
    // (scheduled at the end of poll FAST_POLLS when pollCount == FAST_POLLS).
    // Poll FAST_POLLS+2 is the first one scheduled at SLOW_INTERVAL_MS (pollCount == FAST_POLLS+1).
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'rubric_generation' }),
    })) as unknown as typeof fetch;
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    // Advance through FAST_POLLS + 1 polls (all still fire at FAST_INTERVAL_MS each)
    for (let i = 0; i < FAST_POLLS + 1; i++) {
      await vi.advanceTimersByTimeAsync(FAST_INTERVAL_MS);
    }

    const callsAfterTransitionPoll = fetchFn.mock.calls.length;
    expect(callsAfterTransitionPoll).toBe(FAST_POLLS + 1);

    // Advancing by FAST_INTERVAL_MS (3s) should NOT trigger poll FAST_POLLS+2 — it is now in the slow phase
    await vi.advanceTimersByTimeAsync(FAST_INTERVAL_MS);
    expect(fetchFn).toHaveBeenCalledTimes(FAST_POLLS + 1); // no extra call at 3s

    // Advancing the remaining gap to reach SLOW_INTERVAL_MS SHOULD trigger poll FAST_POLLS+2
    await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS - FAST_INTERVAL_MS);
    expect(fetchFn).toHaveBeenCalledTimes(FAST_POLLS + 2);
  });

  it('Given polling is in the slow phase and a terminal status arrives, then polling stops immediately', async () => {
    // I6 [lld §Fix C] + [lld §Fix C state diagram]: stop on terminal during slow phase
    const slowPhaseCallsBeforeTerminal = 2;
    const terminalAfterCall = FAST_POLLS + slowPhaseCallsBeforeTerminal;
    let callCount = 0;

    const fetchFn = vi.fn(async () => {
      callCount += 1;
      const status = callCount <= terminalAfterCall ? 'rubric_generation' : 'rubric_failed';
      return {
        ok: true,
        json: async () => ({ status }),
      };
    }) as unknown as typeof fetch;
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    // Advance through fast phase
    for (let i = 0; i < FAST_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(FAST_INTERVAL_MS);
    }

    // Advance through 3 slow intervals: 2 non-terminal + 1 terminal
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS);
    }

    expect(callbacks.onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'rubric_failed' }),
    );

    const callsAtTerminal = fetchFn.mock.calls.length;

    // No further polls after the terminal status
    await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS * 2);
    expect(fetchFn).toHaveBeenCalledTimes(callsAtTerminal);
  });

  it('Given polling exhausts all FAST_POLLS + SLOW_POLLS attempts, then onTimeout is called', async () => {
    // I5 [lld §Fix C]: onTimeout fires after the full two-phase window
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'rubric_generation' }),
    })) as unknown as typeof fetch;
    const callbacks = makeCallbacks();

    startStatusPoll('a1', callbacks, fetchFn);

    // Exhaust the fast phase
    for (let i = 0; i < FAST_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(FAST_INTERVAL_MS);
    }

    // Exhaust the slow phase
    for (let i = 0; i < SLOW_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS);
    }

    // One extra slow interval to trigger the poll that detects exhaustion and calls onTimeout
    await vi.advanceTimersByTimeAsync(SLOW_INTERVAL_MS);

    expect(callbacks.onTimeout).toHaveBeenCalledTimes(1);
  });
});
