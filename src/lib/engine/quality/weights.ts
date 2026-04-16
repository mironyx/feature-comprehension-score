import type { ArtefactQualityDimensionKey } from '@/lib/engine/llm/schemas';

/**
 * Per-dimension weights applied by `aggregateDimensions`.
 *
 * Intent-adjacent dimensions (adr_references, linked_issues, design_documents,
 * pr_description) sum to 0.65; code-adjacent dimensions (test_coverage,
 * commit_messages) sum to 0.35 — satisfying the ≥ 60% intent-adjacent
 * invariant from LLD §11.1a.
 *
 * Weights must sum to exactly 1.0.
 */
export const DIMENSION_WEIGHTS: Record<ArtefactQualityDimensionKey, number> = {
  adr_references: 0.20,
  linked_issues: 0.20,
  design_documents: 0.15,
  pr_description: 0.10,
  test_coverage: 0.20,
  commit_messages: 0.15,
};

/** Keys whose combined weight must be ≥ 0.60 per the intent-adjacent invariant. */
export const INTENT_ADJACENT_KEYS: readonly ArtefactQualityDimensionKey[] = [
  'adr_references',
  'linked_issues',
  'design_documents',
  'pr_description',
] as const;
