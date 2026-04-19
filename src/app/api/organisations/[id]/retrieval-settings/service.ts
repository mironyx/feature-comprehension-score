// GET/PATCH /api/organisations/[id]/retrieval-settings — org_config retrieval fields.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import type { ApiContext } from '@/lib/api/context';

// ---------------------------------------------------------------------------
// Contract types — ADR-0014
// ---------------------------------------------------------------------------

export const RetrievalSettingsSchema = z.object({
  tool_use_enabled: z.boolean(),
  rubric_cost_cap_cents: z.number().int().min(0).max(500),
  retrieval_timeout_seconds: z.number().int().min(10).max(600),
});

export type RetrievalSettings = z.infer<typeof RetrievalSettingsSchema>;

export const DEFAULT_RETRIEVAL_SETTINGS: RetrievalSettings = {
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
};

type UserClient = ApiContext['supabase'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertOrgAdmin(
  supabase: UserClient,
  userId: string,
  orgId: string,
): Promise<void> {
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

// ---------------------------------------------------------------------------
// Public surface — implementations follow in Step 4c
// ---------------------------------------------------------------------------

const FIELDS = 'tool_use_enabled, rubric_cost_cap_cents, retrieval_timeout_seconds';

export async function loadRetrievalSettings(
  ctx: ApiContext,
  orgId: string,
): Promise<RetrievalSettings> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const { data, error } = await ctx.supabase
    .from('org_config')
    .select(FIELDS)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw new ApiError(500, `loadRetrievalSettings: ${error.message}`);
  if (!data) return DEFAULT_RETRIEVAL_SETTINGS;

  return {
    tool_use_enabled: data.tool_use_enabled,
    rubric_cost_cap_cents: data.rubric_cost_cap_cents,
    retrieval_timeout_seconds: data.retrieval_timeout_seconds,
  };
}

export async function updateRetrievalSettings(
  ctx: ApiContext,
  orgId: string,
  settings: RetrievalSettings,
): Promise<RetrievalSettings> {
  await assertOrgAdmin(ctx.supabase, ctx.user.id, orgId);

  const { data, error } = await ctx.adminSupabase
    .from('org_config')
    .upsert(
      { org_id: orgId, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' },
    )
    .select(FIELDS)
    .single();

  if (error) throw new ApiError(500, `updateRetrievalSettings: ${error.message}`);

  return {
    tool_use_enabled: data.tool_use_enabled,
    rubric_cost_cap_cents: data.rubric_cost_cap_cents,
    retrieval_timeout_seconds: data.retrieval_timeout_seconds,
  };
}
