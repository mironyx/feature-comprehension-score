// Pure partition helper for project-scoped FCS assessment lists.
// Originally extracted in #295 to keep Page modules to permitted exports.
// Still consumed by projects/[id]/assessment-list.tsx (#414/#425) after the
// /assessments page was rewritten in #415/#427.
// Design reference: docs/design/lld-nav-results.md §1
// Issue: #295

import type { Database } from '@/lib/supabase/types';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];

export interface AssessmentItem {
  id: string;
  feature_name: string | null;
  feature_description: string | null;
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
