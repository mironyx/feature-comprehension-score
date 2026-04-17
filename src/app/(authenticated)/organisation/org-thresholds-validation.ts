import type { OrgThresholds } from '@/lib/engine/org-thresholds';

export function validateOrgThresholds(t: OrgThresholds): string[] {
  const errors: string[] = [];

  if (t.artefact_quality_threshold < 0 || t.artefact_quality_threshold > 1) {
    errors.push('Artefact quality threshold must be between 0 and 1.');
  }
  if (t.fcs_low_threshold < 0 || t.fcs_low_threshold > 100) {
    errors.push('FCS low threshold must be between 0 and 100.');
  }

  return errors;
}
