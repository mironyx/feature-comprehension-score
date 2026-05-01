// Project dashboard page — server component.
// Fetches project and membership, applies role-based access guards.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Issue: #399

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { PageHeader } from '@/components/ui/page-header';
import { InlineEditHeader } from './inline-edit-header';
import { DeleteButton } from './delete-button';

interface ProjectDashboardPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ProjectDashboardPage({ params }: ProjectDashboardPageProps) {
  const { id } = await params;

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: membership } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!membership) notFound();

  const isAdmin = membership.github_role === 'admin';
  const isRepoAdmin = ((membership.admin_repo_github_ids ?? []) as number[]).length > 0;

  if (!isAdmin && !isRepoAdmin) redirect('/assessments');

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, description, created_at, updated_at')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!project) notFound();

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title={project.name}
        action={isAdmin ? <DeleteButton projectId={id} /> : null}
      />
      <InlineEditHeader
        projectId={id}
        initialName={project.name}
        initialDescription={project.description}
      />
      <section className="space-y-3">
        <h2 className="text-heading text-text-primary">Assessments</h2>
        {/* TODO E11.2: render assessment list filtered by project_id */}
        <p className="text-body text-text-secondary">No assessments yet.</p>
        {/* CTA disabled until E11.2 lands — /projects/[id]/assessments/new does not yet exist */}
        <button
          disabled
          className="inline-flex items-center rounded-sm text-label font-medium bg-accent text-background opacity-50 pointer-events-none h-9 px-3.5"
        >
          New assessment
        </button>
      </section>
    </div>
  );
}
