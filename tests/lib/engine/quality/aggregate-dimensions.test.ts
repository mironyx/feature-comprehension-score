/**
 * Tests for aggregateDimensions — §11.1a pure weighted aggregation function.
 *
 * Weight constants (from weights.ts):
 *   Intent-adjacent (≥ 60% total):
 *     adr_references:   0.20
 *     linked_issues:    0.20
 *     design_documents: 0.15
 *     pr_description:   0.10   → 0.65 total
 *   Code-adjacent (≤ 40% total):
 *     test_coverage:    0.20
 *     commit_messages:  0.15   → 0.35 total
 *
 * Missing-dimension behaviour (property 20):
 *   The stub JSDoc says "Missing dimensions contribute 0."
 *   Tests encode that contract. If the implementation chooses to throw instead,
 *   property 20 test will fail and the contract must be updated.
 */

import { describe, it, expect } from 'vitest';
import { aggregateDimensions } from '@/lib/engine/quality/aggregate-dimensions';
import {
  DIMENSION_WEIGHTS,
  INTENT_ADJACENT_KEYS,
} from '@/lib/engine/quality/weights';
import type { ArtefactQualityDimension } from '@/lib/engine/llm/schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dim(
  key: ArtefactQualityDimension['key'],
  sub_score: number,
): ArtefactQualityDimension {
  return { key, sub_score, category: 'test', rationale: 'test rationale' };
}

function allDimsAtScore(score: number): ArtefactQualityDimension[] {
  return (Object.keys(DIMENSION_WEIGHTS) as ArtefactQualityDimension['key'][]).map(k =>
    dim(k, score),
  );
}

const CODE_ADJACENT_KEYS: readonly ArtefactQualityDimension['key'][] = [
  'test_coverage',
  'commit_messages',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aggregateDimensions', () => {

  // Property 13 — all at 100 → 100
  describe('Given six dimensions all at sub-score 100', () => {
    it('then it returns 100', () => {
      const result = aggregateDimensions(allDimsAtScore(100));
      expect(result).toBe(100);
    });
  });

  // Property 14 — all at 0 → 0
  describe('Given six dimensions all at sub-score 0', () => {
    it('then it returns 0', () => {
      const result = aggregateDimensions(allDimsAtScore(0));
      expect(result).toBe(0);
    });
  });

  // Property 15 — intent-adjacent at 100, code-adjacent at 0 → aggregate ≥ 60
  describe('Given intent-adjacent dimensions at 100 and code-adjacent at 0', () => {
    it('then it returns ≥ 60 (the ≥ 60% intent-adjacent invariant)', () => {
      const dims = [
        ...INTENT_ADJACENT_KEYS.map(k => dim(k, 100)),
        ...CODE_ADJACENT_KEYS.map(k => dim(k, 0)),
      ];
      const result = aggregateDimensions(dims);
      expect(result).toBeGreaterThanOrEqual(60);
    });
  });

  // Property 16 — code-adjacent at 100, intent-adjacent at 0 → aggregate ≤ 40
  describe('Given code-adjacent dimensions at 100 and intent-adjacent at 0', () => {
    it('then it returns ≤ 40 (code-adjacent contributes at most 40%)', () => {
      const dims = [
        ...INTENT_ADJACENT_KEYS.map(k => dim(k, 0)),
        ...CODE_ADJACENT_KEYS.map(k => dim(k, 100)),
      ];
      const result = aggregateDimensions(dims);
      expect(result).toBeLessThanOrEqual(40);
    });
  });

  // Property 17 — result is always an integer
  describe('Given weights that produce a non-integer raw weighted sum', () => {
    it('then it returns an integer (no fractional aggregate)', () => {
      // sub_scores of 33 across all dimensions with non-round weights will produce a float
      // before rounding; verify the output is an integer
      const dims = allDimsAtScore(33);
      const result = aggregateDimensions(dims);
      expect(Number.isInteger(result)).toBe(true);
    });
  });

  // Property 18 — result is in range 0..100
  describe('Given any valid dimension input', () => {
    it('then it always returns a value in the range 0–100', () => {
      const cases = [
        allDimsAtScore(0),
        allDimsAtScore(50),
        allDimsAtScore(100),
        allDimsAtScore(1),
        allDimsAtScore(99),
      ];
      for (const dims of cases) {
        const result = aggregateDimensions(dims);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }
    });
  });

  // Property 19 — pure function: identical input twice → identical output
  describe('Given identical inputs called twice', () => {
    it('then it returns the same aggregate both times (pure function)', () => {
      const dims = allDimsAtScore(75);
      expect(aggregateDimensions(dims)).toBe(aggregateDimensions(dims));
    });
  });

  // Property 20 — missing dimension contributes 0
  describe('Given a dimensions array missing one key', () => {
    it('then the missing dimension contributes 0 to the aggregate', () => {
      // Five dimensions, all at 100, missing 'adr_references' (weight 0.20)
      const allKeys = Object.keys(DIMENSION_WEIGHTS) as ArtefactQualityDimension['key'][];
      const fiveDims = allKeys
        .filter(k => k !== 'adr_references')
        .map(k => dim(k, 100));

      const result = aggregateDimensions(fiveDims);
      // With adr_references missing (treated as 0) and all others at 100:
      // aggregate = (0.20 * 0) + (0.20 * 100) + (0.15 * 100) + (0.10 * 100) + (0.20 * 100) + (0.15 * 100)
      //           = 0 + 20 + 15 + 10 + 20 + 15 = 80
      expect(result).toBe(80);
    });
  });

  // Property 21 — weights resolve by key, not array position
  describe('Given the same dimensions in different array order', () => {
    it('then it returns the same aggregate regardless of order', () => {
      const ordered = [
        dim('pr_description',   50),
        dim('linked_issues',    70),
        dim('design_documents', 80),
        dim('commit_messages',  40),
        dim('test_coverage',    60),
        dim('adr_references',   90),
      ];
      const reversed = [...ordered].reverse();

      expect(aggregateDimensions(ordered)).toBe(aggregateDimensions(reversed));
    });
  });

  // Property 22 — DIMENSION_WEIGHTS constant: intent-adjacent keys ≥ 60% of total weight
  // LLD §Invariant 3 acceptance check: "intentTotal / overallTotal ≥ 0.60 for any non-trivial input"
  // expressed as a direct assertion on the weight constants, not just through function behaviour.
  describe('Given the DIMENSION_WEIGHTS constant', () => {
    it('then intent-adjacent keys contribute ≥ 60% of the total weight sum', () => {
      const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      const intentAdjacentWeight = INTENT_ADJACENT_KEYS.reduce(
        (acc, key) => acc + DIMENSION_WEIGHTS[key],
        0,
      );
      expect(intentAdjacentWeight / totalWeight).toBeGreaterThanOrEqual(0.60);
    });

    it('then all six dimension keys are covered and weights sum to exactly 1.0', () => {
      const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(6);
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });

});
