// My Assessments landing page — shows pending assessments for the current user.
// Auth is enforced by the (authenticated) layout; this page only needs orgId.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issues: #62, #121

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import type { MembershipRow } from '@/lib/supabase/membership';
import type { Database } from '@/lib/supabase/types';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './assessment-status';
import { PollingStatusBadge } from './polling-status-badge';
import { RetryButton } from './retry-button';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface PendingAssessment {
  id: string;
  feature_name: string | null;
  status: AssessmentRow['status'];
  created_at: string;
  rubric_error_code: string | null;
  rubric_retry_count: number;
  rubric_error_retryable: boolean | null;
}

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AssessmentsPage(
  props: { searchParams: Promise<{ created?: string }> },
) {
  const { searchParams } = props;
  const resolvedParams = await searchParams;
  const created = resolvedParams.created;

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const [{ data }, { data: membership }] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, feature_name, status, created_at, rubric_error_code, rubric_retry_count, rubric_error_retryable')
      .eq('org_id', orgId)
      .in('status', ['rubric_generation', 'rubric_failed', 'awaiting_responses'])
      .order('created_at', { ascending: false }),
    supabase
      .from('user_organisations')
      .select('github_role')
      .eq('user_id', user.id)
      .eq('org_id', orgId),
  ]);

  const assessments = (data ?? []) as PendingAssessment[];
  const admin = isOrgAdmin((membership ?? []) as MembershipRow[]);

  const newAssessmentAction = admin ? (
    <Link
      href="/assessments/new"
      className="inline-flex items-center justify-center rounded-sm text-label font-medium transition-colors cursor-pointer bg-accent text-background hover:bg-accent-hover h-8 px-2.5"
    >
      New Assessment
    </Link>
  ) : undefined;

  return (
    <div className="space-y-section-gap">
      {created && (
        <p role="status" className="text-body text-accent">Assessment created successfully.</p>
      )}
      <PageHeader title="My Assessments" action={newAssessmentAction} />
      {assessments.length === 0 ? (
        <p className="text-body text-text-secondary">No pending assessments.</p>
      ) : (
        <ul className="space-y-3">
          {assessments.map((a) => (
            <li key={a.id}>
              <Card className="flex items-center justify-between">
                <Link href={`/assessments/${a.id}`} className="text-body text-text-primary hover:text-accent">
                  {a.feature_name ?? `Assessment ${a.id}`}
                </Link>
                <div className="flex items-center gap-2">
                  {a.status === 'rubric_generation'
                    ? <PollingStatusBadge assessmentId={a.id} initialStatus={a.status} />
                    : <StatusBadge status={a.status} />}
                  {a.status === 'rubric_failed' && a.rubric_error_code && (
                    <span className="text-caption text-text-secondary">{a.rubric_error_code}</span>
                  )}
                  {admin && a.status === 'rubric_failed' && (
                    <RetryButton
                      assessmentId={a.id}
                      retryCount={a.rubric_retry_count}
                      maxRetries={MAX_RETRIES}
                      errorRetryable={a.rubric_error_retryable}
                    />
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
