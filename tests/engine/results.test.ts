// Tests for shouldRevealReferenceAnswers engine function.
// Issue: #109

import { describe, it, expect } from 'vitest';
import { shouldRevealReferenceAnswers } from '@/lib/engine/results';

describe('shouldRevealReferenceAnswers', () => {
  describe('Given all participants have submitted and scoring is complete', () => {
    it('then it returns true', () => {
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 3,
          participantTotal: 3,
          aggregateScore: 0.72,
          scoringIncomplete: false,
        }),
      ).toBe(true);
    });
  });

  describe('Given not all participants have submitted', () => {
    it('then it returns false', () => {
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 2,
          participantTotal: 3,
          aggregateScore: 0.72,
          scoringIncomplete: false,
        }),
      ).toBe(false);
    });
  });

  describe('Given aggregate_score is null', () => {
    it('then it returns false', () => {
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 3,
          participantTotal: 3,
          aggregateScore: null,
          scoringIncomplete: false,
        }),
      ).toBe(false);
    });
  });

  describe('Given scoring_incomplete is true', () => {
    it('then it returns false', () => {
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 3,
          participantTotal: 3,
          aggregateScore: 0.72,
          scoringIncomplete: true,
        }),
      ).toBe(false);
    });
  });

  describe('Given there are no participants', () => {
    it('then it returns false', () => {
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 0,
          participantTotal: 0,
          aggregateScore: 0.72,
          scoringIncomplete: false,
        }),
      ).toBe(false);
    });
  });

  describe('Given org admin (same rules — no bypass)', () => {
    it('returns false when not all have submitted even for admin scenario', () => {
      // Admins follow the same gate; no special bypass
      expect(
        shouldRevealReferenceAnswers({
          participantCompleted: 1,
          participantTotal: 2,
          aggregateScore: 0.72,
          scoringIncomplete: false,
        }),
      ).toBe(false);
    });
  });
});
