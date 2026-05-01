import type { SupabaseClient } from '@supabase/supabase-js';
import { OrganisationContextSchema } from '@/lib/engine/prompts';
import type { OrganisationContext } from '@/lib/engine/prompts';
import type { Database } from '@/lib/supabase/types';
import { logger } from '@/lib/logger';

/**
 * Loads the per-project prompt context for FCS rubric generation.
 *
 * Returns undefined when no project-scoped row exists OR the stored context
 * fails schema parse (logged at warn — never throws, so rubric generation is
 * preserved). V11 ADR-0028: rows are keyed by (org_id, project_id). Org-level
 * rows (project_id IS NULL) are NOT consulted for FCS — see HLD §C4.
 */
export async function loadProjectPromptContext(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<OrganisationContext | undefined> {
  const { data, error } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) throw new Error(`loadProjectPromptContext: ${error.message}`);
  if (!data) return undefined;

  const parsed = OrganisationContextSchema.safeParse(data.context);
  if (!parsed.success) {
    logger.warn({ projectId, issues: parsed.error.issues }, 'loadProjectPromptContext: invalid context shape, skipping');
    return undefined;
  }
  return parsed.data;
}
