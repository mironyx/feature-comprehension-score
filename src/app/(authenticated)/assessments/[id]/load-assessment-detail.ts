// Server-side loader for /assessments/[id] — replaces the broken relative-URL self-fetch.
// Delegates all query logic to assessment-detail-queries to avoid duplication with the API route.
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #376

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { ApiError } from '@/lib/api/errors';
import {
  resolveAssessment,
  fetchParallelData,
  buildResponse,
} from '@/app/api/assessments/[id]/assessment-detail-queries';
import type { AssessmentDetailResponse } from '@/app/api/assessments/[id]/assessment-detail-queries';

/**
 * Load full assessment detail for the given user, querying Supabase directly.
 * Returns null if the assessment does not exist or is not accessible via RLS.
 */
export async function loadAssessmentDetail(
  supabase: SupabaseClient<Database>,
  adminSupabase: SupabaseClient<Database>,
  userId: string,
  assessmentId: string,
): Promise<AssessmentDetailResponse | null> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
    .eq('id', assessmentId)
    .single();
  try {
    const assessment = resolveAssessment(data, error);
    const parallelData = await fetchParallelData({ supabase, adminSupabase, assessmentId, userId, orgId: assessment.org_id, assessmentType: assessment.type });
    return buildResponse(assessment, parallelData);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) return null;
    throw err;
  }
}
