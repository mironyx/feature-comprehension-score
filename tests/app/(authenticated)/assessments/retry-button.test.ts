// Tests for RetryButton UI guardrails — disabled states, guardrail messages, attempt-count labels.
// Design reference: docs/design/lld-e18.md §18.2 "UI — RetryButton guardrails"
// Issue: #273

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// Module mocks — must precede component import.
// RetryButton is a client component ('use client') — it calls useRouter and
// useState. We stub both so the component body can be invoked in the node
// test environment (renderToStaticMarkup with SSR-compatible React hooks).
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

// Stub useState to return [initialValue, noopSetter] — allows the component
// to be rendered without a real React root while keeping initial state values.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { ReactElement } from 'react';
import { RetryButton, RetryButtonProps } from '@/app/(authenticated)/assessments/retry-button';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderButton(props: RetryButtonProps): string {
  return renderToStaticMarkup(RetryButton(props) as ReactElement);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSESSMENT_ID = 'assessment-uuid-001';
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RetryButton guardrails (§18.2)', () => {
  // -------------------------------------------------------------------------
  // Contract 1: max retries reached — button disabled, message shown
  // -------------------------------------------------------------------------

  describe('Given retryCount equals maxRetries (3 of 3)', () => {
    it('then the button is disabled', () => {
      // AC [lld §18.2: retryCount >= maxRetries → disabled]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 3,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).toContain('disabled');
    });

    it('then the rendered output contains "Maximum retries reached (3 of 3)"', () => {
      // AC [lld §18.2: max-retries message]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 3,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).toContain('Maximum retries reached (3 of 3)');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 2: retryCount > maxRetries (stale data edge case — check is >=)
  // -------------------------------------------------------------------------

  describe('Given retryCount exceeds maxRetries (4 of 3 — stale data)', () => {
    it('then the button is disabled', () => {
      // AC [lld §18.2: >= check, not ===]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 4,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).toContain('disabled');
    });

    it('then the max-retries message is still shown (not a crash or blank)', () => {
      // AC [lld §18.2: edge case retryCount > maxRetries still shows message]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 4,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).toContain('Maximum retries reached');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 3: non-retryable error — button disabled, specific message shown
  // -------------------------------------------------------------------------

  describe('Given errorRetryable is false and retryCount < maxRetries', () => {
    it('then the button is disabled', () => {
      // AC [lld §18.2: errorRetryable === false → disabled]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: false,
      });
      expect(html).toContain('disabled');
    });

    it('then the rendered output contains "This error is not retryable"', () => {
      // AC [lld §18.2: non-retryable message]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: false,
      });
      expect(html).toContain('This error is not retryable');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 4: max-retries takes precedence when both conditions are true
  // -------------------------------------------------------------------------

  describe('Given retryCount >= maxRetries AND errorRetryable is false', () => {
    it('then the max-retries message takes precedence over the non-retryable message', () => {
      // AC [lld §18.2: first-match wins — maxReached checked before nonRetryable]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 3,
        maxRetries: MAX_RETRIES,
        errorRetryable: false,
      });
      expect(html).toContain('Maximum retries reached (3 of 3)');
      expect(html).not.toContain('This error is not retryable');
    });

    it('then the button is disabled', () => {
      // AC [lld §18.2: both conditions → disabled]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 3,
        maxRetries: MAX_RETRIES,
        errorRetryable: false,
      });
      expect(html).toContain('disabled');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 5: button enabled with attempt-count label when retries remain
  // -------------------------------------------------------------------------

  describe('Given retryCount < maxRetries and errorRetryable is true', () => {
    it('then the button is NOT disabled for retryCount=1', () => {
      // AC [lld §18.2: retries remain → enabled]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 1,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      // A disabled button carries the disabled attribute; enabled buttons do not
      // Note: check absence of disabled attribute value (not just the word)
      expect(html).not.toMatch(/disabled=""/);
    });

    it('then the label contains "Retry (Attempt 2 of 3)" for retryCount=1', () => {
      // AC [lld §18.2: attempt label — retryCount=1 → Attempt 2]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 1,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      expect(html).toContain('Retry (Attempt 2 of 3)');
    });

    it('then the label contains "Retry (Attempt 1 of 3)" for retryCount=0', () => {
      // AC [lld §18.2: attempt label — retryCount=0 → Attempt 1]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      expect(html).toContain('Retry (Attempt 1 of 3)');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 6: errorRetryable === null does NOT trigger the non-retryable path
  // -------------------------------------------------------------------------

  describe('Given errorRetryable is null (unknown — pre-E18.1 data) and retryCount < maxRetries', () => {
    it('then the button is enabled (null is not treated as false)', () => {
      // AC [lld §18.2: === false check must not match null]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).not.toContain('This error is not retryable');
    });

    it('then the attempt-count label is shown', () => {
      // AC [lld §18.2: null errorRetryable → normal enabled state with attempt label]
      const html = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: null,
      });
      expect(html).toContain('Retry (Attempt 1 of 3)');
    });
  });

  // -------------------------------------------------------------------------
  // Contract 7: distinct attempt labels for distinct retryCount values
  // -------------------------------------------------------------------------

  describe('Given successive retry attempts', () => {
    it('then retryCount=0 and retryCount=1 produce distinct labels', () => {
      // AC [lld §18.2: label increments with attempts]
      const htmlFirst = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 0,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      const htmlSecond = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 1,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      expect(htmlFirst).toContain('Attempt 1 of 3');
      expect(htmlSecond).toContain('Attempt 2 of 3');
      expect(htmlFirst).not.toContain('Attempt 2 of 3');
      expect(htmlSecond).not.toContain('Attempt 1 of 3');
    });

    it('then retryCount=1 and retryCount=2 produce distinct labels', () => {
      // AC [lld §18.2: label increments — second pair]
      const htmlSecond = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 1,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      const htmlThird = renderButton({
        assessmentId: ASSESSMENT_ID,
        retryCount: 2,
        maxRetries: MAX_RETRIES,
        errorRetryable: true,
      });
      expect(htmlSecond).toContain('Attempt 2 of 3');
      expect(htmlThird).toContain('Attempt 3 of 3');
      expect(htmlSecond).not.toContain('Attempt 3 of 3');
    });
  });
});
