import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * Truncates all public tables by deleting from root tables.
 * ON DELETE CASCADE handles all child rows automatically.
 *
 * Use in beforeEach for integration test suites that need a clean slate.
 * Note: does not clear auth.users — use createTestUser / deleteTestUser for that.
 */
export async function resetDatabase(client: SupabaseClient<Database>): Promise<void> {
  // Deleting all organisations cascades to:
  // org_config, repositories → repository_config, user_organisations,
  // assessments → assessment_questions, assessment_participants → participant_answers,
  // fcs_merged_prs, sync_debounce
  const { error: orgError } = await client
    .from('organisations')
    .delete()
    .not('id', 'is', null);
  if (orgError) throw new Error(`resetDatabase: organisations: ${orgError.message}`);
}
