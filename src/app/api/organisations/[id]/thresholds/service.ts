import type { ApiContext } from '@/lib/api/context';
import { ApiError } from '@/lib/api/errors';
import {
  ARTEFACT_QUALITY_THRESHOLD_DEFAULT,
  FCS_LOW_THRESHOLD_DEFAULT,
  type OrgThresholds,
} from '@/lib/engine/org-thresholds';

type UserClient = ApiContext['supabase'];

async function assertOrgAdmin(supabase: UserClient, userId: string, orgId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', userId)
    .eq('org_id', orgId);

  if (error) throw new ApiError(500, 'Internal server error');
  if (!data?.length || data[0]?.github_role !== 'admin') {
    throw new ApiError(403, 'Forbidden');
  }
}

export async function loadThresholds(
  ctx: ApiContext,
  orgId: string,
): Promise<OrgThresholds> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const { data, error } = await ctx.supabase
    .from('org_config')
    .select('artefact_quality_threshold, fcs_low_threshold')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw new ApiError(500, `loadThresholds: ${error.message}`);

  return {
    artefact_quality_threshold: Number(data?.artefact_quality_threshold ?? ARTEFACT_QUALITY_THRESHOLD_DEFAULT),
    fcs_low_threshold: data?.fcs_low_threshold ?? FCS_LOW_THRESHOLD_DEFAULT,
  };
}

export async function updateThresholds(
  ctx: ApiContext,
  orgId: string,
  thresholds: OrgThresholds,
): Promise<OrgThresholds> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const { data, error } = await ctx.adminSupabase
    .from('org_config')
    .update({
      artefact_quality_threshold: thresholds.artefact_quality_threshold,
      fcs_low_threshold: thresholds.fcs_low_threshold,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId)
    .select('artefact_quality_threshold, fcs_low_threshold, org_id')
    .single();

  if (error) throw new ApiError(500, `updateThresholds: ${error.message}`);

  return {
    artefact_quality_threshold: Number(data.artefact_quality_threshold),
    fcs_low_threshold: data.fcs_low_threshold,
  };
}
