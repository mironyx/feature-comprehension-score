// Tests for PollingStatusBadge rendering behaviour.
// Mocks useStatusPoll and asserts rendered output via direct function invocation.
// V2 Epic 18, Story 18.3. Issue: #274

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock useStatusPoll so the badge is rendered with controlled snapshot data
// ---------------------------------------------------------------------------

vi.mock('@/app/(authenticated)/assessments/use-status-poll', () => ({
  useStatusPoll: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useStatusPoll } from '@/app/(authenticated)/assessments/use-status-poll';
import { PollingStatusBadge } from '@/app/(authenticated)/assessments/polling-status-badge';

// ---------------------------------------------------------------------------
// Helper — flatten a React element tree into plain text for assertion
// ---------------------------------------------------------------------------

function renderToText(el: ReturnType<typeof PollingStatusBadge>): string {
  if (el === null || el === undefined) return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  if (!el || typeof el !== 'object') return '';
  const node = el as { props?: { children?: unknown } };
  const children = node.props?.children;
  if (Array.isArray(children)) {
    return children.map(renderToText).join('');
  }
  if (children !== null && children !== undefined) {
    return renderToText(children as ReturnType<typeof PollingStatusBadge>);
  }
  return '';
}

/**
 * Collect every leaf element from the tree that has a given role attribute.
 */
function findByRole(
  el: ReturnType<typeof PollingStatusBadge>,
  role: string,
): unknown[] {
  if (!el || typeof el !== 'object') return [];
  const node = el as { props?: Record<string, unknown>; type?: unknown };
  const results: unknown[] = [];
  if (node.props?.role === role) results.push(el);
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findByRole(child as ReturnType<typeof PollingStatusBadge>, role));
    }
  } else if (children !== null && children !== undefined) {
    results.push(
      ...findByRole(children as ReturnType<typeof PollingStatusBadge>, role),
    );
  }
  return results;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSESSMENT_ID = 'assess-uuid-001';
const FRESH_TIMESTAMP = new Date(Date.now() - 10_000).toISOString(); // 10s ago — not stale
const STALE_TIMESTAMP = new Date(Date.now() - 300_000).toISOString(); // 300s ago — stale

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PollingStatusBadge rendering behaviour (Story 18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // AC 18: renders progress label when rubric_progress is non-null and not stale
  // -------------------------------------------------------------------------

  describe("Given status='rubric_generation', rubric_progress='llm_request', timestamp fresh", () => {
    it("then renders the progress label 'Waiting for LLM response'", () => {
      // AC 18 [req §18.3: non-null progress → label shown]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'llm_request',
        rubricProgressUpdatedAt: FRESH_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).toContain('Waiting for LLM response');
    });
  });

  describe("Given rubric_progress='llm_tool_call' (agentic retrieval in progress)", () => {
    it("then renders 'Retrieving additional files from repository'", () => {
      // AC 18 + AC 11 [req §18.3: llm_tool_call label]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'llm_tool_call',
        rubricProgressUpdatedAt: FRESH_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).toContain('Retrieving additional files from repository');
    });
  });

  describe("Given rubric_progress='artefact_extraction' and fresh timestamp", () => {
    it("then renders 'Extracting artefacts from repository'", () => {
      // AC 18 [req §18.3]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'artefact_extraction',
        rubricProgressUpdatedAt: FRESH_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).toContain('Extracting artefacts from repository');
    });
  });

  // -------------------------------------------------------------------------
  // AC 21: no progress label when rubric_progress is null
  // -------------------------------------------------------------------------

  describe('Given rubric_progress is null', () => {
    it('then no progress label is rendered', () => {
      // AC 21 [req §18.3: null progress → no label]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: null,
        rubricProgressUpdatedAt: null,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      // None of the known progress labels should appear
      expect(text).not.toContain('Extracting artefacts');
      expect(text).not.toContain('Waiting for LLM response');
      expect(text).not.toContain('Retrieving additional files');
      expect(text).not.toContain('Processing LLM response');
      expect(text).not.toContain('Saving results');
    });

    it('then no stale warning is rendered when progress is null', () => {
      // AC 21 [req §18.3: null progress → no stale warning]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: null,
        rubricProgressUpdatedAt: null,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const alerts = findByRole(el, 'alert');
      const alertText = alerts.map((a) => renderToText(a as ReturnType<typeof PollingStatusBadge>)).join('');
      expect(alertText).not.toContain('stalled');
    });
  });

  // -------------------------------------------------------------------------
  // AC 19: stale warning shown when rubric_progress_updated_at > 240s ago
  // -------------------------------------------------------------------------

  describe('Given rubric_progress_updated_at is older than 240 seconds', () => {
    it("then renders 'Generation may be stalled — consider retrying'", () => {
      // AC 19 [req §18.3: stale → show warning]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'llm_request',
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).toContain('Generation may be stalled — consider retrying');
    });

    it('then the stale warning has role="alert"', () => {
      // AC 19 [lld §18.3: warning element for accessibility]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'llm_request',
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const alerts = findByRole(el, 'alert');
      const alertText = alerts.map((a) => renderToText(a as ReturnType<typeof PollingStatusBadge>)).join('');
      expect(alertText).toContain('Generation may be stalled');
    });

    it('then the progress label is NOT shown alongside the stale warning', () => {
      // AC 19: when stale, progress label is replaced by the warning [lld §18.3 render logic]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'llm_request',
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).not.toContain('Waiting for LLM response');
    });
  });

  // -------------------------------------------------------------------------
  // AC 20: stale warning NOT shown once status transitions to terminal state
  // -------------------------------------------------------------------------

  describe("Given rubric_progress_updated_at is stale AND status='rubric_failed' (terminal)", () => {
    it('then no stale warning is rendered', () => {
      // AC 20 [req §18.3: stale warning removed on terminal status]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_failed',
        rubricProgress: null,
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_failed' });
      const text = renderToText(el);
      expect(text).not.toContain('Generation may be stalled');
    });
  });

  describe("Given rubric_progress_updated_at is stale AND status='awaiting_responses' (terminal)", () => {
    it('then no stale warning is rendered', () => {
      // AC 20 [req §18.3: stale warning removed on awaiting_responses terminal status]
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'awaiting_responses',
        rubricProgress: null,
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'awaiting_responses' });
      const text = renderToText(el);
      expect(text).not.toContain('Generation may be stalled');
    });
  });

  // -------------------------------------------------------------------------
  // Regression: progress label not shown when stale (AC 19 complement)
  // -------------------------------------------------------------------------

  describe('Given rubric_progress is non-null but timestamp is stale', () => {
    it('then progress label text is suppressed (stale warning takes precedence)', () => {
      // Regression for #274: progress label must not appear when isProgressStale is true
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_generation',
        rubricProgress: 'rubric_parsing',
        rubricProgressUpdatedAt: STALE_TIMESTAMP,
        timedOut: false,
      });

      const el = PollingStatusBadge({ assessmentId: ASSESSMENT_ID, initialStatus: 'rubric_generation' });
      const text = renderToText(el);
      expect(text).not.toContain('Processing LLM response');
      expect(text).toContain('Generation may be stalled — consider retrying');
    });
  });
});

// ---------------------------------------------------------------------------
// Helper — find all nodes in the tree whose `.type` matches a given reference
// ---------------------------------------------------------------------------

function findByType(el: unknown, targetType: unknown): unknown[] {
  if (!el || typeof el !== 'object') return [];
  const node = el as { type?: unknown; props?: Record<string, unknown> };
  const results: unknown[] = node.type === targetType ? [el] : [];
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const c of children) results.push(...findByType(c, targetType));
  } else if (children != null) {
    results.push(...findByType(children, targetType));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Imports needed by Fix B tests
// ---------------------------------------------------------------------------

import { RetryButton } from '@/app/(authenticated)/assessments/retry-button';

// ---------------------------------------------------------------------------
// #377 regression tests — RetryButton removed from PollingStatusBadge
// RetryButton was moved to the Organisation admin view (issue #377).
// PollingStatusBadge must never render RetryButton, regardless of status.
// ---------------------------------------------------------------------------

describe('PollingStatusBadge does not render RetryButton (#377 — moved to org view)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given polling detects rubric_failed', () => {
    it('then RetryButton is never rendered (retry moved to org admin view)', () => {
      vi.mocked(useStatusPoll).mockReturnValue({
        status: 'rubric_failed',
        rubricErrorCode: 'rate_limit',
        rubricRetryCount: 0,
        rubricErrorRetryable: true,
        rubricProgress: null,
        rubricProgressUpdatedAt: null,
        timedOut: false,
      });

      const el = PollingStatusBadge({
        assessmentId: ASSESSMENT_ID,
        initialStatus: 'rubric_generation',
      });

      const retryButtons = findByType(el, RetryButton);
      expect(retryButtons).toHaveLength(0);
    });
  });
});
