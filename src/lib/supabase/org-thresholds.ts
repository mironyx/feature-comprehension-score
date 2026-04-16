import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  ARTEFACT_QUALITY_THRESHOLD_DEFAULT,
  FCS_LOW_THRESHOLD_DEFAULT,
  type OrgThresholds,
} from '@/lib/engine/org-thresholds';

export const DEFAULT_ORG_THRESHOLDS: OrgThresholds = {
  artefact_quality_threshold: ARTEFACT_QUALITY_THRESHOLD_DEFAULT,
  fcs_low_threshold: FCS_LOW_THRESHOLD_DEFAULT,
};

export async function loadOrgThresholds(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<OrgThresholds> {
  const { data, error } = await supabase
    .from('org_config')
    .select('artefact_quality_threshold, fcs_low_threshold')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error('loadOrgThresholds: DB query failed:', error.message);
    return DEFAULT_ORG_THRESHOLDS;
  }

  if (!data) return DEFAULT_ORG_THRESHOLDS;

  return {
    artefact_quality_threshold: Number(data.artefact_quality_threshold),
    fcs_low_threshold: data.fcs_low_threshold,
  };
}
