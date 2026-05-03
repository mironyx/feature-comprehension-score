// Project dashboard page — server component.
// Fetches project and membership, applies role-based access guards.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Issue: #399, #413, #414, #441

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { fetchParticipantCounts, toListItem } from '@/app/api/assessments/helpers';
import { PageHeader } from '@/components/ui/page-header';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { AssessmentOverviewTable } from '@/app/(authenticated)/organisation/assessment-overview-table';
import { InlineEditHeader } from './inline-edit-header';
import { DeleteButton } from './delete-button';
import { TrackLastVisitedProject } from './track-last-visited';

interface ProjectDashboardPageProps {
  readonly params: Promise<{ id: string }>;
}

const ASSESSMENT_SELECT =
  'id, type, status, pr_number, feature_name, aggregate_score, conclusion, config_comprehension_depth, created_at, rubric_error_code, rubric_retry_count, rubric_error_retryable, project_id, repositories!inner(github_repo_name), projects(name)';

async function loadProjectAssessments(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, projectId: string) {
  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_SELECT)
    .eq('project_id', projectId)
    .eq('type', 'fcs')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`loadProjectAssessments: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const counts = await fetchParticipantCounts(rows.map((r) => r.id));
  return rows.map((row) => toListItem(row, counts));
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
  const assessments = await loadProjectAssessments(supabase, id);

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
      {/* Visible to admin and repo_admin only — Org Members redirect at line 54 */}
      <Link
        href={`/projects/${id}/settings`}
        className="inline-flex items-center text-label font-medium text-text-secondary hover:text-text-primary"
      >
        Settings
      </Link>
      <InlineEditHeader
        projectId={id}
        initialName={project.name}
        initialDescription={project.description}
      />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-heading text-text-primary">Assessments</h2>
          <Link
            href={`/projects/${id}/assessments/new`}
            className="inline-flex items-center rounded-sm text-label font-medium bg-accent text-background h-9 px-3.5"
          >
            New Assessment
          </Link>
        </div>
        {assessments.length === 0 ? (
          <div className="space-y-3">
            <p className="text-body text-text-secondary">No assessments yet.</p>
            <Link
              href={`/projects/${id}/assessments/new`}
              className="inline-flex items-center rounded-sm text-label font-medium bg-accent text-background h-9 px-3.5"
            >
              Create the first assessment
            </Link>
          </div>
        ) : (
          <AssessmentOverviewTable assessments={assessments} />
        )}
      </section>
    </div>
  );
}
