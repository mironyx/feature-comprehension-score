import type { ArtefactQuality } from '../llm/schemas';
import type { RawArtefactSet } from './artefact-types';

export function classifyArtefactQuality(artefacts: RawArtefactSet): ArtefactQuality {
  const hasTests = (artefacts.test_files?.length ?? 0) > 0;
  const hasRequirements =
    (artefacts.pr_description?.length ?? 0) > 0 ||
    (artefacts.linked_issues?.length ?? 0) > 0;
  const hasDesignDocs = (artefacts.context_files?.length ?? 0) > 0;

  if (hasRequirements && hasDesignDocs) return 'code_requirements_and_design';
  if (hasRequirements) return 'code_and_requirements';
  if (hasDesignDocs) return 'code_and_design';
  if (hasTests) return 'code_and_tests';
  return 'code_only';
}
