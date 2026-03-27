// Pure engine logic for FCS results presentation.
// Issue: #109

export interface RevealGateInput {
  participantCompleted: number;
  participantTotal: number;
  aggregateScore: number | null;
  scoringIncomplete: boolean;
}

/**
 * Returns true only when reference answers may be revealed to the viewer.
 * Conditions: all participants have submitted, scoring is complete, and at
 * least one participant exists. Org Admins follow the same rule — no bypass.
 */
export function shouldRevealReferenceAnswers(input: RevealGateInput): boolean {
  const { participantCompleted, participantTotal, aggregateScore, scoringIncomplete } = input;
  return (
    participantTotal > 0 &&
    participantCompleted >= participantTotal &&
    aggregateScore !== null &&
    !scoringIncomplete
  );
}
