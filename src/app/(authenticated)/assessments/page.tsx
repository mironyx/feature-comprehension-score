// My Assessments landing page — shows pending assessments for the current user.
// Auth is enforced by the (authenticated) layout; this page only needs orgId.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import type { Database } from '@/lib/supabase/types';

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

export default async function AssessmentsPage() {
  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('assessments')
    .select('id, feature_name, status, created_at')
    .eq('org_id', orgId)
    .eq('status', 'awaiting_responses')
    .order('created_at', { ascending: false });

  const assessments = (data ?? []) as PendingAssessment[];

  return (
    <main>
      <h1>My Assessments</h1>
      {assessments.length === 0 ? (
        <p>No pending assessments.</p>
      ) : (
        <ul>
          {assessments.map((a) => (
            <li key={a.id}>
              <Link href={`/assessments/${a.id}`}>
                {a.feature_name ?? `Assessment ${a.id}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
