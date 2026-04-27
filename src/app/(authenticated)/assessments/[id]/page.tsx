// Assessment detail page — branches on caller_role from the API response.
// Admins see AssessmentAdminView; participants see the answering form.
// Design reference: docs/design/lld-v8-assessment-detail.md §T2
// Issue: #364

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { AssessmentDetailResponse } from '@/app/api/assessments/[id]/route';
import AnsweringForm from './answering-form';
import { AssessmentAdminView } from './assessment-admin-view';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface AssessmentPageProps {
  readonly params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function AccessDeniedPage() {
  return (
    <div className="space-y-section-gap text-center">
      <h1 className="text-heading-xl font-display">Access Denied</h1>
      <p className="text-body text-text-secondary">You are not a participant on this assessment.</p>
      <Link href="/assessments" className="text-body text-accent hover:text-accent-hover">Back to assessments</Link>
    </div>
  );
}

function AlreadySubmittedPage({ assessmentId }: { readonly assessmentId: string }) {
  return (
    <div className="space-y-section-gap text-center">
      <h1 className="text-heading-xl font-display">Already Submitted</h1>
      <p className="text-body text-text-secondary">You have already submitted your answers for this assessment.</p>
      <Link href={`/assessments/${assessmentId}/submitted`} className="text-body text-accent hover:text-accent-hover">View confirmation</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAssessmentDetail(
  assessmentId: string,
): Promise<AssessmentDetailResponse | null> {
  const res = await fetch(`/api/assessments/${assessmentId}`, { cache: 'no-store' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) return null;
  return res.json() as Promise<AssessmentDetailResponse>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function answering(d: AssessmentDetailResponse) {
  return (
    <AnsweringForm
      assessment={d}
      questions={d.questions}
      sourcePrs={d.fcs_prs}
      sourceIssues={d.fcs_issues}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const { id: assessmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const detail = await fetchAssessmentDetail(assessmentId);
  if (!detail) notFound();

  if (detail.caller_role === 'admin') {
    return <AssessmentAdminView assessment={detail} />;
  }

  // Participant path — link if not yet linked
  if (!detail.my_participation) {
    const githubUserIdRaw = user.user_metadata?.['provider_id'];
    const githubUserId = typeof githubUserIdRaw === 'string' ? parseInt(githubUserIdRaw, 10) : undefined;

    if (!githubUserId) return <AccessDeniedPage />;

    // Uses the user's client (not adminSupabase) so auth.uid() resolves inside the
    // SECURITY DEFINER function — see #133.
    await supabase
      .rpc('link_participant', { p_assessment_id: assessmentId, p_github_user_id: githubUserId })
      .then(({ error }) => {
        if (error) logger.error({ err: error }, 'link_participant failed — participant linking is best-effort');
      });

    const refreshed = await fetchAssessmentDetail(assessmentId);
    if (!refreshed?.my_participation) return <AccessDeniedPage />;
    if (refreshed.my_participation.status === 'submitted') return <AlreadySubmittedPage assessmentId={assessmentId} />;
    return answering(refreshed);
  }

  if (detail.my_participation.status === 'submitted') {
    return <AlreadySubmittedPage assessmentId={assessmentId} />;
  }

  return answering(detail);
}
