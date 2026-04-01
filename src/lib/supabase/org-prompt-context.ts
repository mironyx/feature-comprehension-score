import type { SupabaseClient } from '@supabase/supabase-js';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import type { OrganisationContext } from '@/lib/engine/prompts';

/**
 * Loads the org-level prompt context for rubric generation.
 * Returns undefined if no context row exists (empty context = no prompt section).
 */
export async function loadOrgPromptContext(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrganisationContext | undefined> {
  const { data, error } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('org_id', orgId)
    .is('project_id', null)
    .maybeSingle();

  if (error) throw new Error(`loadOrgPromptContext: ${error.message}`);
  if (!data) return undefined;

  const parsed = OrganisationContextSchema.safeParse(data.context);
  if (!parsed.success) return undefined;

  return parsed.data;
}
