import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PollingStatusBadge } from '@/app/(authenticated)/assessments/polling-status-badge';
import type { Database } from '@/lib/supabase/types';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];

interface AssessmentItem {
  id: string;
  feature_name: string | null;
  feature_description: string | null;
  status: AssessmentRow['status'];
  aggregate_score: number | null;
  created_at: string;
  rubric_error_code: string | null;
  rubric_retry_count: number;
  rubric_error_retryable: boolean | null;
  project_id: string | null;
}

const PENDING_STATUSES: AssessmentRow['status'][] = ['rubric_generation', 'rubric_failed', 'awaiting_responses'];
const COMPLETED_STATUSES: AssessmentRow['status'][] = ['scoring', 'completed'];

function partitionAssessments(rows: AssessmentItem[]): { pending: AssessmentItem[]; completed: AssessmentItem[] } {
  const pending: AssessmentItem[] = [];
  const completed: AssessmentItem[] = [];
  for (const a of rows) {
    if (PENDING_STATUSES.includes(a.status)) pending.push(a);
    else if (COMPLETED_STATUSES.includes(a.status)) completed.push(a);
  }
  return { pending, completed };
}

interface AssessmentListProps {
  readonly projectId: string;
}

function AssessmentRow({ a, href }: { a: AssessmentItem; href: string }) {
  return (
    <li>
      <Card className="flex items-center justify-between">
        <div>
          <Link href={href} className="text-body text-text-primary hover:text-accent">
            {a.feature_name ?? `Assessment ${a.id}`}
          </Link>
          {a.feature_description && (
            <p className="text-caption text-text-secondary mt-0.5">{a.feature_description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {a.status === 'rubric_generation'
            ? <PollingStatusBadge assessmentId={a.id} initialStatus={a.status} />
            : <StatusBadge status={a.status} />}
        </div>
      </Card>
    </li>
  );
}

export async function AssessmentList({ projectId }: AssessmentListProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('assessments')
    .select('id, status, feature_name, feature_description, aggregate_score, created_at, rubric_error_code, rubric_retry_count, rubric_error_retryable, project_id')
    .eq('project_id', projectId)
    .eq('type', 'fcs')
    .order('created_at', { ascending: false });

  // error is not destructured; a DB failure renders as empty state — server logs carry the detail
  const rows = (data ?? []) as AssessmentItem[];
  const { pending, completed } = partitionAssessments(rows);

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-body text-text-secondary">No assessments yet.</p>
        <Link
          href={`/projects/${projectId}/assessments/new`}
          className="inline-flex items-center rounded-sm text-label font-medium bg-accent text-background h-9 px-3.5"
        >
          Create the first assessment
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {pending.map((a) => (
        <AssessmentRow key={a.id} a={a} href={`/projects/${projectId}/assessments/${a.id}`} />
      ))}
      {completed.map((a) => (
        <AssessmentRow key={a.id} a={a} href={`/projects/${projectId}/assessments/${a.id}/results`} />
      ))}
    </ul>
  );
}
