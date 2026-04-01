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
import { StatusBadge } from './assessment-status';
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

  const [{ data }, { data: membership }] = await Promise.all([
    supabase
      .from('assessments')
      .select('id, feature_name, status, created_at')
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

  return (
    <main>
      {created && (
        <p role="status">Assessment created successfully.</p>
      )}
      <h1>My Assessments</h1>
      {admin && <Link href="/assessments/new">New Assessment</Link>}
      {assessments.length === 0 ? (
        <p>No pending assessments.</p>
      ) : (
        <ul>
          {assessments.map((a) => (
            <li key={a.id}>
              <Link href={`/assessments/${a.id}`}>
                {a.feature_name ?? `Assessment ${a.id}`}
              </Link>
              {' '}<StatusBadge status={a.status} />
              {admin && a.status === 'rubric_failed' && (
                <>{' '}<RetryButton assessmentId={a.id} /></>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
