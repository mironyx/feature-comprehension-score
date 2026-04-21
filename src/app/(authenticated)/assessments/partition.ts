// Pure partition helper for the My Assessments page.
// Extracted from page.tsx because Next.js App Router restricts Page files to
// a narrow set of permitted exports (default, metadata, generateMetadata, etc.).
// Design reference: docs/design/lld-nav-results.md §1
// Issue: #295

import type { Database } from '@/lib/supabase/types';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];

export interface AssessmentItem {
  id: string;
  feature_name: string | null;
  status: AssessmentRow['status'];
  aggregate_score: number | null;
  created_at: string;
  rubric_error_code: string | null;
  rubric_retry_count: number;
  rubric_error_retryable: boolean | null;
}

const PENDING_STATUSES: AssessmentRow['status'][] = [
  'rubric_generation',
  'rubric_failed',
  'awaiting_responses',
];

const COMPLETED_STATUSES: AssessmentRow['status'][] = ['scoring', 'completed'];

export function partitionAssessments(
  assessments: AssessmentItem[],
): { pending: AssessmentItem[]; completed: AssessmentItem[] } {
  const pending: AssessmentItem[] = [];
  const completed: AssessmentItem[] = [];
  for (const a of assessments) {
    if (PENDING_STATUSES.includes(a.status)) pending.push(a);
    else if (COMPLETED_STATUSES.includes(a.status)) completed.push(a);
  }
  return { pending, completed };
}
