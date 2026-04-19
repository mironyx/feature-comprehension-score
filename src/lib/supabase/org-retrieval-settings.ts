import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  DEFAULT_RETRIEVAL_SETTINGS,
  type RetrievalSettings,
} from '@/app/api/organisations/[id]/retrieval-settings/service';

/**
 * Loads retrieval-loop settings (tool_use_enabled, rubric_cost_cap_cents,
 * retrieval_timeout_seconds) for an organisation. Returns defaults when no
 * org_config row exists yet. See docs/design/lld-v2-e17-agentic-retrieval.md §17.2a.
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
