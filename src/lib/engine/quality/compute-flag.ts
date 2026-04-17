// Pure function: four-quadrant flag matrix for artefact quality × FCS scores.
// Issue: #238 (§11.2b Results page artefact quality display + flag matrix)

export type ArtefactQualityFlagKey =
  | 'comprehension_and_documentation_risk'
  | 'comprehension_gap'
  | 'tacit_knowledge_concentration'
  | null;

export interface FlagInput {
  /** FCS aggregate score, 0..1 scale (existing convention). */
  fcs_score: number | null;
  /** Artefact quality score, 0..100 integer. */
  artefact_quality_score: number | null;
  artefact_quality_status: 'success' | 'unavailable' | 'pending';
  /** Artefact quality low threshold, 0..1 scale (DB convention). */
  artefact_quality_low_threshold: number;
  /** FCS low threshold, 0..100 integer. */
  fcs_low_threshold: number;
}

export interface FlagResult {
  key: ArtefactQualityFlagKey;
  copy: string | null;
}

const FLAG_COPY: Record<string, string> = {
  comprehension_and_documentation_risk:
    'Both the comprehension score and artefact quality are below threshold. The team may lack understanding and the documentation does not compensate.',
  comprehension_gap:
    'Artefact quality is adequate but the comprehension score is low. The team may not fully understand what was built despite reasonable documentation.',
  tacit_knowledge_concentration:
    'The comprehension score is healthy but artefact quality is low. Knowledge is concentrated in team members rather than captured in artefacts.',
};

const NO_FLAG: FlagResult = { key: null, copy: null };

export function computeArtefactQualityFlag(input: FlagInput): FlagResult {
  if (input.artefact_quality_status !== 'success') return NO_FLAG;
  if (input.fcs_score === null || input.artefact_quality_score === null) return NO_FLAG;

  const qualityLow = input.artefact_quality_score < input.artefact_quality_low_threshold * 100;
  const fcsLow = input.fcs_score * 100 < input.fcs_low_threshold;

  const key: ArtefactQualityFlagKey = qualityLow && fcsLow
    ? 'comprehension_and_documentation_risk'
    : !qualityLow && fcsLow
      ? 'comprehension_gap'
      : qualityLow && !fcsLow
        ? 'tacit_knowledge_concentration'
        : null;

  if (key === null) return NO_FLAG;
  return { key, copy: FLAG_COPY[key] ?? null };
}
