// Org-level threshold config for the artefact-quality + FCS flag matrix.
// Values are authoritative on the DB side via column CHECKs; this Zod schema
// mirrors those constraints for the API boundary.
// Issue: #237 (§11.2a Threshold config)

import { z } from 'zod';

export const ARTEFACT_QUALITY_THRESHOLD_DEFAULT = 0.60;
export const FCS_LOW_THRESHOLD_DEFAULT = 60;

export const OrgThresholdsSchema = z.object({
  /** Artefact quality low threshold, 0.0–1.0. UI renders as percent. */
  artefact_quality_threshold: z.number().min(0).max(1),
  /** FCS low threshold, 0–100 integer. */
  fcs_low_threshold: z.number().int().min(0).max(100),
});
export type OrgThresholds = z.infer<typeof OrgThresholdsSchema>;
