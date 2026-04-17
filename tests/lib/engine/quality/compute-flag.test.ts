/**
 * Tests for computeArtefactQualityFlag — §11.2b four-quadrant flag matrix.
 * Issue: #238
 *
 * Scale conventions (from FlagInput JSDoc in compute-flag.ts):
 *   fcs_score                      — 0..1  (multiply × 100 to compare against fcs_low_threshold)
 *   artefact_quality_score         — 0..100 integer
 *   artefact_quality_low_threshold — 0..1  (multiply × 100 to compare against quality score)
 *   fcs_low_threshold              — 0..100 integer
 *
 * Four quadrants (thresholds 0.4 quality / 60 FCS used throughout, i.e. 40/60 on normalised scale):
 *   quality < 40 AND fcs < 60  → 'comprehension_and_documentation_risk'
 *   quality ≥ 40 AND fcs < 60  → 'comprehension_gap'
 *   quality < 40 AND fcs ≥ 60  → 'tacit_knowledge_concentration'
 *   quality ≥ 40 AND fcs ≥ 60  → null (healthy)
 *
 * Null-result cases:
 *   artefact_quality_status = 'unavailable' → { key: null, copy: null }
 *   artefact_quality_status = 'pending'     → { key: null, copy: null }
 *   fcs_score = null                        → { key: null, copy: null }
 *   artefact_quality_score = null           → { key: null, copy: null }
 */

import { describe, it, expect } from 'vitest';
import {
  computeArtefactQualityFlag,
  type FlagInput,
} from '@/lib/engine/quality/compute-flag';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a FlagInput with sensible defaults; override only what the test cares about. */
function makeInput(overrides: Partial<FlagInput> = {}): FlagInput {
  return {
    fcs_score: 0.8,                       // 80 — above threshold (60)
    artefact_quality_score: 80,           // 80 — above threshold (40)
    artefact_quality_status: 'success',
    artefact_quality_low_threshold: 0.4,  // 40 on normalised scale
    fcs_low_threshold: 60,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Four-quadrant cases
// ---------------------------------------------------------------------------

describe('computeArtefactQualityFlag', () => {

  // Property 1 — bottom-left quadrant: both below threshold → comprehension_and_documentation_risk
  // [lld §11.2b] "quality < threshold AND fcs < threshold"
  describe('Given quality 30 and FCS 0.5 with thresholds 0.4/60', () => {
    it('then key = "comprehension_and_documentation_risk"', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 30,
        fcs_score: 0.5,    // 50 < 60
        artefact_quality_low_threshold: 0.4,  // 40
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('comprehension_and_documentation_risk');
    });
  });

  // Property 2 — top-left quadrant: quality above threshold, FCS below → comprehension_gap
  // [lld §11.2b] "quality >= threshold AND fcs < threshold"
  describe('Given quality 80 and FCS 0.5 with thresholds 0.4/60', () => {
    it('then key = "comprehension_gap"', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 80,
        fcs_score: 0.5,    // 50 < 60
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('comprehension_gap');
    });
  });

  // Property 3 — bottom-right quadrant: quality below threshold, FCS above → tacit_knowledge_concentration
  // [lld §11.2b] "quality < threshold AND fcs >= threshold"
  describe('Given quality 30 and FCS 0.8 with thresholds 0.4/60', () => {
    it('then key = "tacit_knowledge_concentration"', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 30,
        fcs_score: 0.8,    // 80 >= 60
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('tacit_knowledge_concentration');
    });
  });

  // Property 4 — top-right quadrant: both above threshold → null (healthy)
  // [lld §11.2b] "quality >= threshold AND fcs >= threshold → null"
  describe('Given quality 80 and FCS 0.8 with thresholds 0.4/60', () => {
    it('then key = null and copy = null (healthy)', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 80,
        fcs_score: 0.8,
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Null-result guard cases
  // ---------------------------------------------------------------------------

  // Property 5 — status 'unavailable' → no flag regardless of scores
  // [lld §11.2b invariant #7]: "unavailable → no flag computed"
  describe('Given artefact_quality_status = "unavailable"', () => {
    it('then key = null and copy = null regardless of scores and thresholds', () => {
      // Scores would otherwise produce 'comprehension_and_documentation_risk'
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 10,
        fcs_score: 0.1,
        artefact_quality_status: 'unavailable',
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // Property 6 — status 'pending' → no flag
  // [lld §11.2b]: "status = 'pending' → null (no flag)"
  describe('Given artefact_quality_status = "pending"', () => {
    it('then key = null and copy = null regardless of scores', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 10,
        fcs_score: 0.1,
        artefact_quality_status: 'pending',
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // Property 7 — fcs_score null → no flag
  // [lld §11.2b]: "fcs_score = null → null (no flag)"
  describe('Given fcs_score = null', () => {
    it('then key = null and copy = null', () => {
      const result = computeArtefactQualityFlag(makeInput({
        fcs_score: null,
        artefact_quality_score: 10,
        artefact_quality_status: 'success',
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // Property 8 — artefact_quality_score null → no flag
  // [lld §11.2b]: "artefact_quality_score = null → null (no flag)"
  describe('Given artefact_quality_score = null', () => {
    it('then key = null and copy = null', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: null,
        fcs_score: 0.1,
        artefact_quality_status: 'success',
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Copy text contract
  // ---------------------------------------------------------------------------

  // Property 9 — non-null key → non-null copy
  // [lld §11.2b]: FlagResult has copy paired with key
  describe('Given a flag is raised (key is non-null)', () => {
    it('then copy is also non-null (copy is paired with key)', () => {
      const flaggedInputs: FlagInput[] = [
        makeInput({ artefact_quality_score: 10, fcs_score: 0.1 }),    // comprehension_and_documentation_risk
        makeInput({ artefact_quality_score: 80, fcs_score: 0.1 }),    // comprehension_gap
        makeInput({ artefact_quality_score: 10, fcs_score: 0.9 }),    // tacit_knowledge_concentration
      ];
      for (const input of flaggedInputs) {
        const result = computeArtefactQualityFlag(input);
        expect(result.key).not.toBeNull();
        expect(result.copy).not.toBeNull();
      }
    });
  });

  // Property 10 — null key → null copy
  // [lld §11.2b]: "returns { key: null, copy: null } for ... the healthy quadrant"
  describe('Given no flag is raised (key is null)', () => {
    it('then copy is also null', () => {
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 80,
        fcs_score: 0.9,
      }));
      expect(result.key).toBeNull();
      expect(result.copy).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Boundary conditions
  // ---------------------------------------------------------------------------

  // Property 11 — quality exactly at threshold → NOT flagged (>= comparison)
  // [issue #238 spec]: "quality >= threshold → not low-quality"
  describe('Given quality score exactly equals the threshold boundary (quality = 40, threshold = 0.4)', () => {
    it('then quality is NOT considered below threshold (boundary is inclusive)', () => {
      // quality=40, threshold*100=40 → quality >= threshold → not flagged for quality
      // fcs=0.1 → FCS below threshold → should be 'comprehension_gap', not 'comprehension_and_documentation_risk'
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 40,
        fcs_score: 0.1,      // low FCS, to distinguish the quadrant
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('comprehension_gap');
    });
  });

  // Property 12 — FCS score exactly at threshold → NOT flagged (>= comparison)
  // [issue #238 spec]: "fcs >= threshold → not low-FCS"
  describe('Given FCS score exactly equals the threshold boundary (fcs = 0.6, threshold = 60)', () => {
    it('then FCS is NOT considered below threshold (boundary is inclusive)', () => {
      // fcs=0.6 → 60 >= 60 → not flagged for FCS
      // quality=10 → low quality → should be 'tacit_knowledge_concentration', not 'comprehension_and_documentation_risk'
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 10,
        fcs_score: 0.6,      // exactly at threshold
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('tacit_knowledge_concentration');
    });
  });

  // Property 13 — quality just below threshold → flagged
  describe('Given quality score one point below the threshold (quality = 39, threshold = 0.4)', () => {
    it('then quality IS considered below threshold', () => {
      // fcs=0.9 → FCS above threshold → tacit_knowledge_concentration
      const result = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 39,
        fcs_score: 0.9,
        artefact_quality_low_threshold: 0.4,
        fcs_low_threshold: 60,
      }));
      expect(result.key).toBe('tacit_knowledge_concentration');
    });
  });

  // Property 14 — return value always has both key and copy fields (shape invariant)
  describe('Given any valid input', () => {
    it('then the return value always has both "key" and "copy" fields', () => {
      const inputs: FlagInput[] = [
        makeInput(),
        makeInput({ artefact_quality_status: 'unavailable' }),
        makeInput({ artefact_quality_status: 'pending' }),
        makeInput({ fcs_score: null }),
        makeInput({ artefact_quality_score: null }),
        makeInput({ artefact_quality_score: 10, fcs_score: 0.1 }),
        makeInput({ artefact_quality_score: 80, fcs_score: 0.1 }),
        makeInput({ artefact_quality_score: 10, fcs_score: 0.9 }),
      ];
      for (const input of inputs) {
        const result = computeArtefactQualityFlag(input);
        expect(result).toHaveProperty('key');
        expect(result).toHaveProperty('copy');
      }
    });
  });

  // Property 15 — function is pure: same input → same output (no I/O side effects)
  // [lld §11.2b] computeArtefactQualityFlag is listed as a pure function
  describe('Given identical inputs called twice', () => {
    it('then it returns the same result both times (pure function)', () => {
      const input = makeInput({ artefact_quality_score: 30, fcs_score: 0.4 });
      const first = computeArtefactQualityFlag(input);
      const second = computeArtefactQualityFlag(input);
      expect(first.key).toBe(second.key);
      expect(first.copy).toBe(second.copy);
    });
  });

  // Property 16 — each of the three non-null keys is distinct in the output copy text
  // [issue #238]: each quadrant maps to a named flag key; copy should be specific per key
  describe('Given the three flag quadrant inputs', () => {
    it('then each quadrant produces a different copy string', () => {
      const risk = computeArtefactQualityFlag(
        makeInput({ artefact_quality_score: 10, fcs_score: 0.1 }),
      );
      const gap = computeArtefactQualityFlag(
        makeInput({ artefact_quality_score: 80, fcs_score: 0.1 }),
      );
      const tacit = computeArtefactQualityFlag(
        makeInput({ artefact_quality_score: 10, fcs_score: 0.9 }),
      );

      // All three must have copy text
      expect(risk.copy).not.toBeNull();
      expect(gap.copy).not.toBeNull();
      expect(tacit.copy).not.toBeNull();

      // All three copies must be distinct
      expect(risk.copy).not.toBe(gap.copy);
      expect(gap.copy).not.toBe(tacit.copy);
      expect(risk.copy).not.toBe(tacit.copy);
    });
  });

  // Property 17 — threshold change takes effect immediately (no historical recomputation)
  // [lld §Invariant 6]: threshold change applies to display, not stored scores
  describe('Given the same score but different thresholds', () => {
    it('then the flag changes when only the threshold changes (not a stored historical value)', () => {
      const belowThreshold = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 50,
        fcs_score: 0.4,
        artefact_quality_low_threshold: 0.6,   // threshold=60, score=50 → below
        fcs_low_threshold: 50,                  // threshold=50, fcs=40 → below
      }));
      const aboveThreshold = computeArtefactQualityFlag(makeInput({
        artefact_quality_score: 50,
        fcs_score: 0.4,
        artefact_quality_low_threshold: 0.4,   // threshold=40, score=50 → above
        fcs_low_threshold: 30,                  // threshold=30, fcs=40 → above
      }));

      expect(belowThreshold.key).toBe('comprehension_and_documentation_risk');
      expect(aboveThreshold.key).toBeNull();
    });
  });

});
