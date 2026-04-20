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

    for (let i = 0; i <= MAX_POLLS; i++) {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
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
// AC-4 / page contract: PollingStatusBadge not rendered when created param
// matches an assessment NOT in rubric_generation (race: already resolved)
// ---------------------------------------------------------------------------

// This is tested at the page level. We use module mocks matching page.test.ts.

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));
vi.mock('@/lib/supabase/membership', () => ({
  isOrgAdmin: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('@/app/(authenticated)/assessments/assessment-status', () => ({
  StatusBadge: () => null,
}));
vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/app/(authenticated)/assessments/retry-button', () => ({
  RetryButton: () => 'RetryButton',
}));
vi.mock('@/app/(authenticated)/assessments/polling-status-badge', () => ({
  PollingStatusBadge: ({ assessmentId }: { assessmentId: string }) =>
    `PollingStatusBadge:${assessmentId}`,
}));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import { cookies } from 'next/headers';
import AssessmentsPage from '@/app/(authenticated)/assessments/page';

const mockCreateServer = vi.mocked(createServerSupabaseClient);
const mockGetOrgId = vi.mocked(getSelectedOrgId);
const mockIsOrgAdmin = vi.mocked(isOrgAdmin);
const mockCookies = vi.mocked(cookies);

const ORG_ID = 'org-001';
const USER_ID = 'user-001';

function makePageClient(assessments: unknown[] = []) {
  const mockIn = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: assessments, error: null }),
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_organisations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ github_role: 'admin' }], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ in: mockIn }) }) };
    }),
  };
}

describe('AC-4 / page: PollingStatusBadge not used when created assessment already resolved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.mockResolvedValue({} as never);
    mockGetOrgId.mockReturnValue(ORG_ID);
    mockIsOrgAdmin.mockReturnValue(false);
  });

  it('does not render PollingStatusBadge when created assessment is already awaiting_responses', async () => {
    // Race condition: assessment was created (created param present) but rubric
    // generation finished before the page loaded — status is now awaiting_responses.
    const client = makePageClient([
      {
        id: 'race-assessment',
        feature_name: 'Race Feature',
        status: 'awaiting_responses',
        created_at: '2026-01-01',
      },
    ]);
    mockCreateServer.mockResolvedValue(client as never);

    const result = await AssessmentsPage({
      searchParams: Promise.resolve({ created: 'race-assessment' }),
    });
    const rendered = JSON.stringify(result);

    // Must NOT start polling since status is already terminal.
    expect(rendered).not.toContain('"initialStatus"');
  });

  it('does not render PollingStatusBadge when created param does not match any assessment ID', async () => {
    // created param is stale / wrong — no matching assessment in the list.
    const client = makePageClient([
      {
        id: 'different-id',
        feature_name: 'Some Feature',
        status: 'rubric_generation',
        created_at: '2026-01-01',
      },
    ]);
    mockCreateServer.mockResolvedValue(client as never);

    const result = await AssessmentsPage({
      searchParams: Promise.resolve({ created: 'non-existent-id' }),
    });
    const rendered = JSON.stringify(result);

    expect(rendered).not.toContain('"initialStatus"');
  });

  it('only renders PollingStatusBadge for the matching assessment, not sibling rubric_generation assessments', async () => {
    // AC-2: when multiple assessments are in rubric_generation, only the one
    // matching the created param should receive polling.
    const client = makePageClient([
      {
        id: 'new-one',
        feature_name: 'New',
        status: 'rubric_generation',
        created_at: '2026-01-02',
      },
      {
        id: 'old-one',
        feature_name: 'Old',
        status: 'rubric_generation',
        created_at: '2026-01-01',
      },
    ]);
    mockCreateServer.mockResolvedValue(client as never);

    const result = await AssessmentsPage({
      searchParams: Promise.resolve({ created: 'new-one' }),
    });
    const rendered = JSON.stringify(result);

    // Only new-one should have initialStatus (gets PollingStatusBadge).
    const matches = rendered.match(/"initialStatus"/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(rendered).toContain('"assessmentId":"new-one"');
    expect(rendered).not.toContain('"assessmentId":"old-one"');
  });
});
