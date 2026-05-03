// My Pending Assessments — cross-project FCS queue with project filter.
// Auth is enforced by the (authenticated) layout; page also guards for missing orgId.
// Design reference: docs/design/lld-v11-e11-2-fcs-scoped-to-projects.md §B.6
// Issue: #415

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { PageHeader } from '@/components/ui/page-header';
import { ProjectFilter } from './project-filter';
import type { ProjectAssessmentItem } from './project-filter';

export default async function AssessmentsPage(
  _props: { searchParams: Promise<Record<string, string>> },
) {
  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  // error intentionally ignored — a transient DB failure shows the empty state, not an error page
  const { data } = await supabase
    .from('assessment_participants')
    .select(`
      assessments!inner(
        id, type, status, feature_name, feature_description, created_at,
        rubric_error_code, rubric_retry_count, rubric_error_retryable,
        project_id,
        projects!inner(id, name)
      )
    `)
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .eq('assessments.type', 'fcs')
    .order('created_at', { foreignTable: 'assessments', ascending: false });

  const rawItems = (data ?? []) as unknown as ProjectAssessmentItem[];

  const items = rawItems.map((r) => ({
    ...r,
    href: `/projects/${r.assessments.project_id}/assessments/${r.assessments.id}`,
  }));

  const distinctProjects = Array.from(
    new Map(items.map((r) => [r.assessments.project_id, r.assessments.projects.name])).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-section-gap">
      <PageHeader title="My Pending Assessments" />
      {items.length === 0
        ? <p className="text-body text-text-secondary">No pending assessments. You&apos;ll see assessments here when you&apos;ve been added to one as a participant.</p>
        : (
          <ProjectFilter
            items={items}
            projects={distinctProjects}
            projectFilterItems={items}
            projectFilterProjects={distinctProjects}
          />
        )
      }
    </div>
  );
}
