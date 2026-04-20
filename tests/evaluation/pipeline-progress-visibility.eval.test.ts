// Adversarial evaluation tests for issue #274 — pipeline progress visibility (§18.3).
//
// Purpose: probe the one genuine gap in the test-author's coverage.
//
// Gap: poll-status.ts `toSnapshot` maps `rubric_progress` / `rubric_progress_updated_at`
// from the API JSON into `rubricProgress` / `rubricProgressUpdatedAt` on PollSnapshot.
// No existing test verifies this mapping. The feature tests use a `makeFetch` helper
// that only sets `status`, so all `expect.objectContaining({ status: ... })` assertions
// pass even if the field mapping is broken. If `toSnapshot` used the wrong key name the
// badge would never show a progress label, but no test would catch it.
//
// Failures here are findings — do NOT modify the implementation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startStatusPoll,
  POLL_INTERVAL_MS,
} from '@/app/(authenticated)/assessments/poll-status';

// ---------------------------------------------------------------------------
// Fetch factory — returns a response with progress fields set
// ---------------------------------------------------------------------------

function makeFetchWithProgress(payload: {
  status: string;
  rubric_progress: string | null;
  rubric_progress_updated_at: string | null;
}) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

function makeCallbacks() {
  return {
    onStatusChange: vi.fn(),
    onTimeout: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// AC-6 / toSnapshot: progress fields flow from API response to snapshot
// ---------------------------------------------------------------------------

describe('poll-status: toSnapshot maps rubric_progress fields into PollSnapshot', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('then onStatusChange receives rubricProgress from API rubric_progress field', async () => {
    // This is the gap: if toSnapshot uses a wrong key name the callback gets null,
    // and no existing test would catch it (all use objectContaining({ status: ... }) only).
    const fetchFn = makeFetchWithProgress({
      status: 'rubric_generation',
      rubric_progress: 'llm_request',
      rubric_progress_updated_at: '2026-04-20T10:00:00.000Z',
    });
    const callbacks = makeCallbacks();

    startStatusPoll('assess-001', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rubric_generation',
        rubricProgress: 'llm_request',
      }),
    );
  });

  it('then onStatusChange receives rubricProgressUpdatedAt from API rubric_progress_updated_at field', async () => {
    const TIMESTAMP = '2026-04-20T10:05:30.000Z';
    const fetchFn = makeFetchWithProgress({
      status: 'rubric_generation',
      rubric_progress: 'persisting',
      rubric_progress_updated_at: TIMESTAMP,
    });
    const callbacks = makeCallbacks();

    startStatusPoll('assess-002', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rubricProgressUpdatedAt: TIMESTAMP,
      }),
    );
  });

  it('then rubricProgress is null in snapshot when API returns rubric_progress=null', async () => {
    const fetchFn = makeFetchWithProgress({
      status: 'awaiting_responses',
      rubric_progress: null,
      rubric_progress_updated_at: null,
    });
    const callbacks = makeCallbacks();

    startStatusPoll('assess-003', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rubricProgress: null,
        rubricProgressUpdatedAt: null,
      }),
    );
  });

  it('then rubricProgress is null in snapshot when API response omits the rubric_progress field entirely', async () => {
    // toSnapshot uses `?? null` — missing field must degrade to null, not undefined.
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'rubric_generation' }), // no progress fields at all
    })) as unknown as typeof fetch;
    const callbacks = makeCallbacks();

    startStatusPoll('assess-004', callbacks, fetchFn);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        rubricProgress: null,
        rubricProgressUpdatedAt: null,
      }),
    );
  });
});
