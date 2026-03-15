import { describe, it, expect } from 'vitest';
import {
  calculateAggregate,
  calculateQuestionAggregate,
  type ScoreEntry,
} from '@/lib/engine/aggregate/calculate-aggregate';

describe('calculateAggregate', () => {
  describe('Given 2 participants, 3 questions, all scored', () => {
    it('then it returns the correct weighted aggregate percentage', () => {
      const entries: ScoreEntry[] = [
        // Participant 1
        { score: 0.8, weight: 1 },
        { score: 0.6, weight: 2 },
        { score: 0.9, weight: 3 },
        // Participant 2
        { score: 0.7, weight: 1 },
        { score: 0.5, weight: 2 },
        { score: 1.0, weight: 3 },
      ];

      const result = calculateAggregate(entries);

      // sum(score * weight) = 0.8*1 + 0.6*2 + 0.9*3 + 0.7*1 + 0.5*2 + 1.0*3
      //                     = 0.8 + 1.2 + 2.7 + 0.7 + 1.0 + 3.0 = 9.4
      // sum(max_score * weight) = (1+2+3) * 2 = 12
      // aggregate = 9.4 / 12 ≈ 0.7833
      expect(result).toBeCloseTo(9.4 / 12, 4);
    });
  });

  describe('Given all perfect scores', () => {
    it('then it returns 1.0', () => {
      const entries: ScoreEntry[] = [
        { score: 1.0, weight: 1 },
        { score: 1.0, weight: 2 },
        { score: 1.0, weight: 3 },
      ];

      expect(calculateAggregate(entries)).toBe(1.0);
    });
  });

  describe('Given all zero scores', () => {
    it('then it returns 0.0', () => {
      const entries: ScoreEntry[] = [
        { score: 0, weight: 1 },
        { score: 0, weight: 2 },
        { score: 0, weight: 3 },
      ];

      expect(calculateAggregate(entries)).toBe(0);
    });
  });

  describe('Given mixed weights (1, 2, 3)', () => {
    it('then higher-weighted questions have proportionally more impact', () => {
      // All weight-3 questions score 1.0, all weight-1 questions score 0.0
      const highWeightHigh: ScoreEntry[] = [
        { score: 0, weight: 1 },
        { score: 0, weight: 2 },
        { score: 1.0, weight: 3 },
      ];
      // All weight-1 questions score 1.0, all weight-3 questions score 0.0
      const lowWeightHigh: ScoreEntry[] = [
        { score: 1.0, weight: 1 },
        { score: 0, weight: 2 },
        { score: 0, weight: 3 },
      ];

      const resultHigh = calculateAggregate(highWeightHigh);
      const resultLow = calculateAggregate(lowWeightHigh);

      // Weight-3 perfect = 3/6 = 0.5; Weight-1 perfect = 1/6 ≈ 0.167
      expect(resultHigh).toBeGreaterThan(resultLow);
      expect(resultHigh).toBeCloseTo(0.5, 4);
      expect(resultLow).toBeCloseTo(1 / 6, 4);
    });
  });

  describe('Given some answers with scoring_failed (excluded)', () => {
    it('then it calculates aggregate from available scores only', () => {
      // Only 2 of 3 entries provided — the failed one is simply omitted
      const entries: ScoreEntry[] = [
        { score: 0.8, weight: 1 },
        { score: 0.6, weight: 2 },
        // weight-3 question omitted (scoring_failed)
      ];

      const result = calculateAggregate(entries);

      // sum(score * weight) = 0.8*1 + 0.6*2 = 0.8 + 1.2 = 2.0
      // sum(max_score * weight) = 1 + 2 = 3
      // aggregate = 2.0 / 3 ≈ 0.667
      expect(result).toBeCloseTo(2.0 / 3, 4);
    });
  });

  describe('Given a single participant', () => {
    it('then it returns that participant\'s weighted score', () => {
      const entries: ScoreEntry[] = [
        { score: 0.75, weight: 2 },
        { score: 0.5, weight: 1 },
      ];

      const result = calculateAggregate(entries);

      // sum(score * weight) = 0.75*2 + 0.5*1 = 2.0
      // sum(max_score * weight) = 2 + 1 = 3
      expect(result).toBeCloseTo(2.0 / 3, 4);
    });
  });

  describe('Given an empty array', () => {
    it('then it returns 0 without division-by-zero', () => {
      expect(calculateAggregate([])).toBe(0);
    });
  });
});

describe('calculateQuestionAggregate', () => {
  describe('Given 3 participants scored on question 1', () => {
    it('then it returns the mean score for that question', () => {
      const scores = [0.8, 0.6, 0.7];

      const result = calculateQuestionAggregate(scores);

      expect(result).toBeCloseTo((0.8 + 0.6 + 0.7) / 3, 4);
    });
  });

  describe('Given an empty scores array', () => {
    it('then it returns 0 without division-by-zero', () => {
      expect(calculateQuestionAggregate([])).toBe(0);
    });
  });
});
