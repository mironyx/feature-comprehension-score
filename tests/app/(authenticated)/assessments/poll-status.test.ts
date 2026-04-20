// Tests for poll-status — core polling logic for assessment status refresh.
// Issue: #207

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startStatusPoll,
  isTerminalStatus,
  POLL_INTERVAL_MS,
  MAX_POLLS,
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
    it('calls onTimeout after MAX_POLLS', async () => {
      const fetchFn = makeFetch(['rubric_generation']);
      const callbacks = makeCallbacks();

      startStatusPoll('a1', callbacks, fetchFn);

      for (let i = 0; i <= MAX_POLLS; i++) {
        await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
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
