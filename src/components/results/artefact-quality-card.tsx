// Artefact quality score card for the FCS results page.
// Shows overall score, per-dimension breakdown (collapsed), and flag copy.
// Issue: #238 (§11.2b)

import type { ArtefactQualityDimension } from '@/lib/engine/llm/schemas';
import type { FlagResult } from '@/lib/engine/quality/compute-flag';

export interface ArtefactQualityCardProps {
  readonly score: number | null;
  readonly status: 'success' | 'unavailable' | 'pending';
  readonly dimensions: ArtefactQualityDimension[] | null;
  readonly flag: FlagResult;
}

const DIMENSION_ORDER: ArtefactQualityDimension['key'][] = [
  'adr_references',
  'linked_issues',
  'design_documents',
  'pr_description',
  'test_coverage',
  'commit_messages',
];

function sortedDimensions(dims: ArtefactQualityDimension[]): ArtefactQualityDimension[] {
  return DIMENSION_ORDER.map(k => dims.find(d => d.key === k)!).filter(Boolean);
}

export function ArtefactQualityCard(props: ArtefactQualityCardProps): React.ReactElement | null {
  if (props.status === 'pending') return null;

  if (props.status === 'unavailable') {
    return (
      <section aria-label="Artefact quality">
        <h3>Artefact Quality</h3>
        <p>Unavailable</p>
      </section>
    );
  }

  const sorted = props.dimensions ? sortedDimensions(props.dimensions) : null;

  return (
    <section aria-label="Artefact quality">
      <h3>Artefact Quality</h3>
      <p aria-label="Artefact quality score">{props.score}</p>
      {props.flag.key && (
        <div role="alert">
          <p data-flag-key={props.flag.key}>{props.flag.key}</p>
          <p>{props.flag.copy}</p>
        </div>
      )}
      {sorted && (
        <details>
          <summary>Dimension breakdown</summary>
          <ul>
            {sorted.map(d => (
              <li key={d.key}>
                {d.key}: {d.sub_score}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
