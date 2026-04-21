// Loader for the Organisation page assessment overview.
// Queries the org's assessments via the caller's supabase client, then enriches
// each with participant counts using the service client (RLS on
// assessment_participants hides peers from non-admins, so a non-admin read would
// always return a count of 1; admin pages need the service client for totals).
// Design reference: docs/design/lld-nav-results.md §2
// Issue: #296

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  fetchParticipantCounts,
  toListItem,
  type AssessmentListItem,
} from '@/app/api/assessments/helpers';

const ROW_LIMIT = 50;

export async function loadOrgAssessmentsOverview(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<AssessmentListItem[]> {
  const { data, error } = await supabase
    .from('assessments')
    .select(
      'id, type, status, pr_number, feature_name, aggregate_score, conclusion, config_comprehension_depth, created_at, repositories!inner(github_repo_name)',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) throw new Error(`loadOrgAssessmentsOverview: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const counts = await fetchParticipantCounts(rows.map((r) => r.id));
  return rows.map((row) => toListItem(row, counts));
}
