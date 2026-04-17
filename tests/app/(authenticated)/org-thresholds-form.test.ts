// Tests for validateOrgThresholds — client-side validation helper.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237

import { describe, it, expect } from 'vitest';
import type { OrgThresholds } from '@/lib/engine/org-thresholds';
import { validateOrgThresholds } from '@/app/(authenticated)/organisation/org-thresholds-validation';

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validateOrgThresholds', () => {
  describe('Given valid thresholds at their defaults (0.6, 60)', () => {
    it('then it returns no errors', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 60,
      };

      expect(validateOrgThresholds(t)).toEqual([]);
    });
  });

  describe('Given artefact_quality_threshold=0 and fcs_low_threshold=0 (both lower bounds)', () => {
    it('then it returns no errors', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 0,
        fcs_low_threshold: 0,
      };

      expect(validateOrgThresholds(t)).toEqual([]);
    });
  });

  describe('Given artefact_quality_threshold=1 and fcs_low_threshold=100 (both upper bounds)', () => {
    it('then it returns no errors', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 1,
        fcs_low_threshold: 100,
      };

      expect(validateOrgThresholds(t)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // artefact_quality_threshold validation
  // ---------------------------------------------------------------------------

  describe('Given artefact_quality_threshold below 0', () => {
    it('then it returns an error mentioning artefact quality', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: -0.01,
        fcs_low_threshold: 60,
      };

      const errors = validateOrgThresholds(t);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/artefact/i);
    });
  });

  describe('Given artefact_quality_threshold above 1', () => {
    it('then it returns an error mentioning artefact quality', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 1.01,
        fcs_low_threshold: 60,
      };

      const errors = validateOrgThresholds(t);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/artefact/i);
    });
  });

  // ---------------------------------------------------------------------------
  // fcs_low_threshold validation
  // ---------------------------------------------------------------------------

  describe('Given fcs_low_threshold below 0', () => {
    it('then it returns an error mentioning FCS', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: -1,
      };

      const errors = validateOrgThresholds(t);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/fcs/i);
    });
  });

  describe('Given fcs_low_threshold above 100', () => {
    it('then it returns an error mentioning FCS', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: 0.6,
        fcs_low_threshold: 101,
      };

      const errors = validateOrgThresholds(t);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/fcs/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Both fields invalid — two independent errors
  // ---------------------------------------------------------------------------

  describe('Given both thresholds out of range', () => {
    it('then it returns two errors (one per field)', () => {
      const t: OrgThresholds = {
        artefact_quality_threshold: -0.5,
        fcs_low_threshold: 150,
      };

      const errors = validateOrgThresholds(t);

      expect(errors).toHaveLength(2);
    });
  });
});
