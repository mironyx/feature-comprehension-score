// New assessment page — server component.
// Resolves project + membership server-side; filters repo list by admin-repo snapshot for Repo Admins.
// Issue: #413

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readMembershipSnapshot, snapshotToOrgRole } from '@/lib/supabase/membership';
import { PageHeader } from '@/components/ui/page-header';
import CreateAssessmentForm from './create-assessment-form';
import type { JSX } from 'react';

interface NewAssessmentPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function NewAssessmentPage({ params }: NewAssessmentPageProps): Promise<JSX.Element> {
  const { id: projectId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project } = await supabase
    .from('projects').select('id, org_id, name').eq('id', projectId).maybeSingle();
  if (!project) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const snapshot = await readMembershipSnapshot(supabase, user.id, project.org_id);
  const role = snapshot ? snapshotToOrgRole(snapshot) : null;
  if (!role) redirect('/assessments');

  let q = supabase
    .from('repositories')
    .select('id, github_repo_name, github_repo_id')
    .eq('org_id', project.org_id)
    .order('github_repo_name');
  if (role === 'repo_admin') q = q.in('github_repo_id', snapshot!.adminRepoGithubIds);
  const { data: repos } = await q;

  return (
    <div className="space-y-section-gap">
      <PageHeader title="New Assessment" subtitle="Create an FCS assessment for your team" />
      <CreateAssessmentForm projectId={projectId} repositories={repos ?? []} />
    </div>
  );
}
