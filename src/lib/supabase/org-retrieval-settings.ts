// Loader + schema for org_config retrieval-loop settings.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

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

/**
 * Loads retrieval-loop settings (tool_use_enabled, rubric_cost_cap_cents,
 * retrieval_timeout_seconds) for an organisation. Returns defaults when no
 * org_config row exists yet.
 */
export async function loadOrgRetrievalSettings(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<RetrievalSettings> {
  const { data, error } = await supabase
    .from('org_config')
    .select('tool_use_enabled, rubric_cost_cap_cents, retrieval_timeout_seconds')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) throw new Error(`loadOrgRetrievalSettings: ${error.message}`);
  if (!data) return DEFAULT_RETRIEVAL_SETTINGS;

  return {
    tool_use_enabled: data.tool_use_enabled,
    rubric_cost_cap_cents: data.rubric_cost_cap_cents,
    retrieval_timeout_seconds: data.retrieval_timeout_seconds,
  };
}
