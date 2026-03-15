export interface ScoreEntry {
  score: number;
  weight: number;
}

/**
 * Calculates the weighted aggregate score across all entries.
 * Formula: sum(score × weight) / sum(max_score × weight)
 * where max_score is always 1.0.
 */
export function calculateAggregate(entries: ScoreEntry[]): number {
  if (entries.length === 0) return 0;

  const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0);
  const maxWeightedSum = entries.reduce((sum, e) => sum + e.weight, 0);

  return weightedSum / maxWeightedSum;
}

/**
 * Calculates the mean score for a single question across all participants.
 */
export function calculateQuestionAggregate(scores: number[]): number {
  if (scores.length === 0) return 0;

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
