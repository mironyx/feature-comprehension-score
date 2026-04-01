// PATCH /api/organisations/[id]/context — upsert service.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiContext } from '@/lib/api/context';
import type { OrganisationContext } from '@/lib/engine/prompts';
import { ApiError } from '@/lib/api/errors';
import type { OrgContextRow } from '@/lib/supabase/org-prompt-context';

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

export async function upsertContext(
  ctx: ApiContext,
  orgId: string,
  context: OrganisationContext,
): Promise<OrgContextRow> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const supabase: SupabaseClient = ctx.adminSupabase;
  const { data, error } = await supabase
    .from('organisation_contexts')
    .upsert(
      { org_id: orgId, project_id: null, context, updated_at: new Date().toISOString() },
      { onConflict: 'org_id,project_id' },
    )
    .select()
    .single();

  if (error) throw new ApiError(500, `upsertOrgContext: ${error.message}`);
  return data as OrgContextRow;
}
