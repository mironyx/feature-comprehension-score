// Assessment detail page — project-scoped URL shape.
// Guard: returns 404 when assessment.project_id !== projectId (Invariant I4).
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.3
// Issues: #364, #412

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import type { AssessmentDetailResponse } from '@/app/api/assessments/[id]/route';
import { loadAssessmentDetail } from './load-assessment-detail';
import AnsweringForm from './answering-form';
import { AssessmentAdminView } from './assessment-admin-view';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { logger } from '@/lib/logger';

interface AssessmentPageProps {
  readonly params: Promise<{ id: string; aid: string }>;
}

function AccessDeniedPage() {
  return (
    <div className="space-y-section-gap text-center">
      <h1 className="text-heading-xl font-display">Access Denied</h1>
      <p className="text-body text-text-secondary">You are not a participant on this assessment.</p>
      <Link href="/assessments" className="text-body text-accent hover:text-accent-hover">Back to assessments</Link>
    </div>
  );
}

function AlreadySubmittedPage({ projectId, assessmentId }: { readonly projectId: string; readonly assessmentId: string }) {
  return (
    <div className="space-y-section-gap text-center">
      <h1 className="text-heading-xl font-display">Already Submitted</h1>
      <p className="text-body text-text-secondary">You have already submitted your answers for this assessment.</p>
      <Link href={`/projects/${projectId}/assessments/${assessmentId}/submitted`} className="text-body text-accent hover:text-accent-hover">View confirmation</Link>
    </div>
  );
}

function answering(projectId: string, d: AssessmentDetailResponse) {
  return (
    <AnsweringForm
      projectId={projectId}
      assessment={d}
      questions={d.questions}
      sourcePrs={d.fcs_prs}
      sourceIssues={d.fcs_issues}
    />
  );
}

async function renderAdminView(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string,
  detail: AssessmentDetailResponse,
) {
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .maybeSingle();
  return (
    <>
      <SetBreadcrumbs
        segments={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name ?? 'Project', href: `/projects/${projectId}` },
          { label: 'Assessment' },
        ]}
      />
      <AssessmentAdminView assessment={detail} />
    </>
  );
}

async function renderParticipantLinkAndContinue(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  adminSupabase: ReturnType<typeof createSecretSupabaseClient>,
  user: { id: string; user_metadata?: Record<string, unknown> | null },
  projectId: string,
  aid: string,
) {
  const githubUserIdRaw = user.user_metadata?.['provider_id'];
  const githubUserId = typeof githubUserIdRaw === 'string' ? parseInt(githubUserIdRaw, 10) : undefined;
  if (!githubUserId) return <AccessDeniedPage />;

  // Uses the user's client (not adminSupabase) so auth.uid() resolves inside the
  // SECURITY DEFINER function — see #133.
  await supabase
    .rpc('link_participant', { p_assessment_id: aid, p_github_user_id: githubUserId })
    .then(({ error }) => {
      if (error) logger.error({ err: error }, 'link_participant failed — participant linking is best-effort');
    });

  const refreshed = await loadAssessmentDetail(supabase, adminSupabase, user.id, aid);
  if (!refreshed?.my_participation) return <AccessDeniedPage />;
  if (refreshed.my_participation.status === 'submitted') return <AlreadySubmittedPage projectId={projectId} assessmentId={aid} />;
  return answering(projectId, refreshed);
}

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const { id: projectId, aid } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: row } = await supabase
    .from('assessments')
    .select('id, project_id')
    .eq('id', aid)
    .maybeSingle();
  if (!row || row.project_id !== projectId) notFound();

  const adminSupabase = createSecretSupabaseClient();
  const detail = await loadAssessmentDetail(supabase, adminSupabase, user.id, aid);
  if (!detail) notFound();

  if (detail.caller_role === 'admin') {
    return renderAdminView(supabase, projectId, detail);
  }

  if (!detail.my_participation) {
    return renderParticipantLinkAndContinue(supabase, adminSupabase, user, projectId, aid);
  }

  if (detail.my_participation.status === 'submitted') {
    return <AlreadySubmittedPage projectId={projectId} assessmentId={aid} />;
  }

  return answering(projectId, detail);
}
