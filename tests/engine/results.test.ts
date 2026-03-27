// Tests for shouldRevealReferenceAnswers engine function.
// Issue: #109

import { describe, it, expect } from 'vitest';
import { shouldRevealReferenceAnswers } from '@/lib/engine/results';
import type { RevealGateInput } from '@/lib/engine/results';

type GateCase = [label: string, input: RevealGateInput, expected: boolean];

describe('shouldRevealReferenceAnswers', () => {
  const COMPLETE: RevealGateInput = {
    participantCompleted: 3,
    participantTotal: 3,
    aggregateScore: 0.72,
    scoringIncomplete: false,
  };

  it.each<GateCase>([
    ['all submitted and scoring complete → true',
      COMPLETE, true],
    ['not all participants submitted → false',
      { ...COMPLETE, participantCompleted: 2 }, false],
    ['aggregate_score is null → false',
      { ...COMPLETE, aggregateScore: null }, false],
    ['scoring_incomplete is true → false',
      { ...COMPLETE, scoringIncomplete: true }, false],
    ['no participants → false',
      { ...COMPLETE, participantCompleted: 0, participantTotal: 0 }, false],
    ['admin — not all submitted (no bypass) → false',
      { ...COMPLETE, participantCompleted: 1, participantTotal: 2 }, false],
  ])('Given %s', (_label, input, expected) => {
    expect(shouldRevealReferenceAnswers(input)).toBe(expected);
  });
});
