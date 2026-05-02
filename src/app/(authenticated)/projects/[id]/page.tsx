// Project dashboard page — server component.
// Fetches project and membership, applies role-based access guards.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Issue: #399, #413, #414

import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { PageHeader } from '@/components/ui/page-header';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { InlineEditHeader } from './inline-edit-header';
import { DeleteButton } from './delete-button';
import { AssessmentList } from './assessment-list';
import { TrackLastVisitedProject } from './track-last-visited';

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

  const role = await getOrgRole(supabase, user.id, orgId);
  if (!role) redirect('/assessments');

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, description, created_at, updated_at')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!project) notFound();

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-section-gap">
      <TrackLastVisitedProject projectId={id} />
      <SetBreadcrumbs
        segments={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
      />
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
        <AssessmentList projectId={id} />
      </section>
    </div>
  );
}
