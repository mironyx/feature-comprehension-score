// Tests for OrgThresholdsSchema Zod contract and default threshold constants.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237

import { describe, it, expect } from 'vitest';
import {
  OrgThresholdsSchema,
  ARTEFACT_QUALITY_THRESHOLD_DEFAULT,
  FCS_LOW_THRESHOLD_DEFAULT,
} from '@/lib/engine/org-thresholds';

// ---------------------------------------------------------------------------
// Default constant values
// ---------------------------------------------------------------------------

describe('OrgThresholds default constants', () => {
  describe('Given the exported ARTEFACT_QUALITY_THRESHOLD_DEFAULT constant', () => {
    it('then it equals 0.4 (LLD §Invariant 9: default artefact_quality_low = 40)', () => {
      expect(ARTEFACT_QUALITY_THRESHOLD_DEFAULT).toBe(0.4);
    });
  });

  describe('Given the exported FCS_LOW_THRESHOLD_DEFAULT constant', () => {
    it('then it equals 60', () => {
      expect(FCS_LOW_THRESHOLD_DEFAULT).toBe(60);
    });
  });
});

// ---------------------------------------------------------------------------
// OrgThresholdsSchema — valid inputs
// ---------------------------------------------------------------------------

describe('OrgThresholdsSchema', () => {
  describe('Given a valid object with artefact_quality_threshold=0.6 and fcs_low_threshold=60', () => {
    it('then it parses successfully', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Given artefact_quality_threshold=0 (lower bound)', () => {
    it('then it parses successfully', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0,
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Given artefact_quality_threshold=1 (upper bound)', () => {
    it('then it parses successfully', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 1,
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Given fcs_low_threshold=0 (lower bound)', () => {
    it('then it parses successfully', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Given fcs_low_threshold=100 (upper bound)', () => {
    it('then it parses successfully', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 100,
      });
      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // artefact_quality_threshold — rejection cases
  // ---------------------------------------------------------------------------

  describe('Given artefact_quality_threshold below 0', () => {
    it('then it rejects with a validation error', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: -0.01,
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given artefact_quality_threshold above 1', () => {
    it('then it rejects with a validation error', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 1.01,
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given artefact_quality_threshold is a string', () => {
    it('then it rejects with a validation error', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: '0.6',
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given artefact_quality_threshold is missing', () => {
    it('then it rejects because the field is required', () => {
      const result = OrgThresholdsSchema.safeParse({
        fcs_low_threshold: 60,
      });
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // fcs_low_threshold — rejection cases
  // ---------------------------------------------------------------------------

  describe('Given fcs_low_threshold below 0', () => {
    it('then it rejects with a validation error', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given fcs_low_threshold above 100', () => {
    it('then it rejects with a validation error', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given fcs_low_threshold is a non-integer (e.g. 60.5)', () => {
    it('then it rejects because the field must be an integer', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given fcs_low_threshold is missing', () => {
    it('then it rejects because the field is required', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.6,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Given both fields are missing', () => {
    it('then it rejects', () => {
      const result = OrgThresholdsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Inferred type shape
  // ---------------------------------------------------------------------------

  describe('Given a successfully parsed object', () => {
    it('then the result data contains artefact_quality_threshold and fcs_low_threshold', () => {
      const result = OrgThresholdsSchema.safeParse({
        artefact_quality_threshold: 0.75,
        fcs_low_threshold: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.artefact_quality_threshold).toBe(0.75);
        expect(result.data.fcs_low_threshold).toBe(50);
      }
    });
  });
});
