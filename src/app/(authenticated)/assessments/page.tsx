// My Assessments landing page — shows pending and completed assessments for the user.
// Auth is enforced by the (authenticated) layout; this page only needs orgId.
// Design reference: docs/design/lld-nav-results.md §1
// Issues: #62, #121, #295

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from './assessment-status';
import { PollingStatusBadge } from './polling-status-badge';
import { partitionAssessments, type AssessmentItem } from './partition';

function toPercent(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)}%`;
}

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

  const { data } = await supabase
    .from('assessments')
    .select('id, feature_name, feature_description, status, aggregate_score, created_at, rubric_error_code, rubric_retry_count, rubric_error_retryable, assessment_participants!inner(user_id)')
    .eq('org_id', orgId)
    .eq('assessment_participants.user_id', user.id)
    .order('created_at', { ascending: false });

  const all = (data ?? []) as AssessmentItem[];
  const { pending, completed } = partitionAssessments(all);

  return (
    <div className="space-y-section-gap">
      {created && (
        <p role="status" className="text-body text-accent">Assessment created successfully.</p>
      )}
      <PageHeader title="My Assessments" />

      <section className="space-y-3">
        <h2 className="text-heading text-text-primary">Pending</h2>
        {pending.length === 0 ? (
          <p className="text-body text-text-secondary">No pending assessments.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((a) => (
              <li key={a.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <Link href={`/assessments/${a.id}`} className="text-body text-text-primary hover:text-accent">
                      {a.feature_name ?? `Assessment ${a.id}`}
                    </Link>
                    {a.feature_description ? (
                      <p className="text-caption text-text-secondary mt-0.5">{a.feature_description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'rubric_generation'
                      ? <PollingStatusBadge
                          assessmentId={a.id}
                          initialStatus={a.status}
                        />
                      : <>
                          <StatusBadge status={a.status} />
                          {a.status === 'rubric_failed' && a.rubric_error_code && (
                            <span className="text-caption text-text-secondary">{a.rubric_error_code}</span>
                          )}
                        </>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-heading text-text-primary">Completed</h2>
        {completed.length === 0 ? (
          <p className="text-body text-text-secondary">No completed assessments.</p>
        ) : (
          <ul className="space-y-3">
            {completed.map((a) => (
              <li key={a.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/assessments/${a.id}/results`}
                      className="text-body text-text-primary hover:text-accent"
                    >
                      {a.feature_name ?? `Assessment ${a.id}`}
                    </Link>
                    {a.feature_description ? (
                      <p className="text-caption text-text-secondary mt-0.5">{a.feature_description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-body text-text-primary" aria-label="Aggregate score">
                      {toPercent(a.aggregate_score)}
                    </span>
                    <StatusBadge status={a.status} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
