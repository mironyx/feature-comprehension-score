// Assessment submitted confirmation page — project-scoped URL shape.
// Guard: returns 404 when assessment.project_id !== projectId (Invariant I4).
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.3
// Issues: #61, #412

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';

interface SubmittedPageProps {
  readonly params: Promise<{ id: string; aid: string }>;
}

export default async function SubmittedPage({ params }: SubmittedPageProps) {
  const { id: projectId, aid } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from('assessments')
    .select('id, project_id')
    .eq('id', aid)
    .maybeSingle();
  if (!row || row.project_id !== projectId) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const adminSupabase = createSecretSupabaseClient();

  const [assessmentResult, participantsResult] = await Promise.all([
    adminSupabase
      .from('assessments')
      .select('feature_name, org_id')
      .eq('id', aid)
      .single(),
    adminSupabase
      .from('assessment_participants')
      .select('id, status, user_id')
      .eq('assessment_id', aid),
  ]);

  if (assessmentResult.error || !assessmentResult.data) notFound();

  const assessment = assessmentResult.data as { feature_name: string | null; org_id: string };
  const participants = (participantsResult.data ?? []) as { id: string; status: string; user_id: string }[];
  if (!participants.some(p => p.user_id === user.id)) notFound();
  const total = participants.length;
  const completed = participants.filter(p => p.status === 'submitted').length;

  const { data: orgMembership } = await adminSupabase
    .from('user_organisations')
    .select('github_role')
    .eq('user_id', user.id)
    .eq('org_id', assessment.org_id)
    .maybeSingle();
  const isAdmin = orgMembership?.github_role === 'admin';
  const projectName = isAdmin
    ? (await supabase.from('projects').select('name').eq('id', projectId).maybeSingle()).data?.name
    : undefined;

  return (
    <div className="space-y-section-gap text-center">
      {isAdmin && (
        <SetBreadcrumbs
          segments={[
            { label: 'Projects', href: '/projects' },
            { label: projectName ?? 'Project', href: `/projects/${projectId}` },
            { label: `Assessment #${aid}`, href: `/projects/${projectId}/assessments/${aid}` },
            { label: 'Submitted' },
          ]}
        />
      )}
      <h1 className="text-heading-xl font-display text-success">Answers Submitted</h1>
      <p className="text-body text-text-primary">Thank you. Your answers have been recorded.</p>
      {assessment.feature_name && <p className="text-body text-text-secondary">Feature: {assessment.feature_name}</p>}
      <p className="text-body text-text-secondary">
        Participation: {completed} of {total} complete
      </p>
      <Link href="/assessments" className="text-body text-accent hover:text-accent-hover">Back to my assessments</Link>
    </div>
  );
}
