// Tests for validateRetrievalSettings — client-side validation for the retrieval settings form.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import { describe, it, expect } from 'vitest';
import { validateRetrievalSettings } from '@/app/(authenticated)/organisation/retrieval-settings-validation';
import type { RetrievalSettings } from '@/app/api/organisations/[id]/retrieval-settings/service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_DEFAULTS: RetrievalSettings = {
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateRetrievalSettings', () => {
  describe('Given a valid settings object (the defaults)', () => {
    it('then it returns no errors', () => {
      expect(validateRetrievalSettings(VALID_DEFAULTS)).toEqual([]);
    });
  });

  describe('Given rubric_cost_cap_cents at the minimum boundary (0)', () => {
    it('then it returns no errors', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, rubric_cost_cap_cents: 0 };

      expect(validateRetrievalSettings(settings)).toEqual([]);
    });
  });

  describe('Given rubric_cost_cap_cents at the maximum boundary (500)', () => {
    it('then it returns no errors', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, rubric_cost_cap_cents: 500 };

      expect(validateRetrievalSettings(settings)).toEqual([]);
    });
  });

  describe('Given rubric_cost_cap_cents is -1 (below minimum)', () => {
    it('then it returns an error mentioning spend cap or cost', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, rubric_cost_cap_cents: -1 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/spend cap|cost/i);
    });
  });

  describe('Given rubric_cost_cap_cents is 501 (above maximum)', () => {
    it('then it returns an error mentioning spend cap or cost', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, rubric_cost_cap_cents: 501 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/spend cap|cost/i);
    });
  });

  describe('Given rubric_cost_cap_cents is a non-integer (1.5)', () => {
    it('then it returns an error mentioning spend cap or cost', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, rubric_cost_cap_cents: 1.5 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/spend cap|cost/i);
    });
  });

  describe('Given retrieval_timeout_seconds at the minimum boundary (10)', () => {
    it('then it returns no errors', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, retrieval_timeout_seconds: 10 };

      expect(validateRetrievalSettings(settings)).toEqual([]);
    });
  });

  describe('Given retrieval_timeout_seconds at the maximum boundary (600)', () => {
    it('then it returns no errors', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, retrieval_timeout_seconds: 600 };

      expect(validateRetrievalSettings(settings)).toEqual([]);
    });
  });

  describe('Given retrieval_timeout_seconds is 9 (below minimum)', () => {
    it('then it returns an error mentioning timeout', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, retrieval_timeout_seconds: 9 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/timeout/i);
    });
  });

  describe('Given retrieval_timeout_seconds is 601 (above maximum)', () => {
    it('then it returns an error mentioning timeout', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, retrieval_timeout_seconds: 601 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/timeout/i);
    });
  });

  describe('Given retrieval_timeout_seconds is a non-integer (120.5)', () => {
    it('then it returns an error mentioning timeout', () => {
      const settings: RetrievalSettings = { ...VALID_DEFAULTS, retrieval_timeout_seconds: 120.5 };

      const errors = validateRetrievalSettings(settings);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatch(/timeout/i);
    });
  });

  describe('Given both numeric fields are invalid simultaneously', () => {
    it('then it returns two errors, one per field', () => {
      const settings: RetrievalSettings = {
        ...VALID_DEFAULTS,
        rubric_cost_cap_cents: -1,
        retrieval_timeout_seconds: 9,
      };

      const errors = validateRetrievalSettings(settings);

      expect(errors).toHaveLength(2);
    });
  });
});
