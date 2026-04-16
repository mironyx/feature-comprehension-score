import type { ArtefactQualityDimension } from '@/lib/engine/llm/schemas';
import { DIMENSION_WEIGHTS } from './weights';

/**
 * Compute the weighted aggregate (0–100 integer) from the per-dimension
 * sub-scores using `DIMENSION_WEIGHTS`. Missing dimensions contribute 0.
 *
 * Invariant: with intent-adjacent dimensions at 100 and code-adjacent at 0,
 * the aggregate is ≥ 60 (enforced by the weight constants).
 */
export function aggregateDimensions(dimensions: ArtefactQualityDimension[]): number {
  const total = dimensions.reduce(
    (acc, dim) => acc + dim.sub_score * DIMENSION_WEIGHTS[dim.key],
    0,
  );
  const rounded = Math.round(total);
  return Math.max(0, Math.min(100, rounded));
}
