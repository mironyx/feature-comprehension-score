import type { ArtefactQuality } from '../llm/schemas';
import type { RawArtefactSet } from './artefact-types';

type QualityKey = `${boolean}-${boolean}-${boolean}`;

/** Key: hasTests-hasRequirements-hasDesignDocs */
const qualityMap: Record<QualityKey, ArtefactQuality> = {
  'true-true-true': 'code_requirements_and_design',
  'true-true-false': 'code_and_requirements',
  'true-false-true': 'code_and_design',
  'true-false-false': 'code_and_tests',
  'false-true-true': 'code_requirements_and_design',
  'false-true-false': 'code_and_requirements',
  'false-false-true': 'code_and_design',
  'false-false-false': 'code_only',
};

function hasContent(items: unknown[] | undefined): boolean {
  return (items?.length ?? 0) > 0;
}

export function classifyArtefactQuality(artefacts: RawArtefactSet): ArtefactQuality {
  const hasTests = hasContent(artefacts.test_files);
  const hasRequirements =
    (artefacts.pr_description?.length ?? 0) > 0 ||
    hasContent(artefacts.linked_issues);
  const hasDesignDocs = hasContent(artefacts.context_files);

  const key: QualityKey = `${hasTests}-${hasRequirements}-${hasDesignDocs}`;
  return qualityMap[key];
}
