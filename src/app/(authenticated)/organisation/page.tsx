// Organisation admin dashboard — assessment overview + settings.
// Non-admins see a 403 Forbidden response inline.
// Auth and orgId are enforced by the (authenticated) layout before this page renders.
// Design reference: docs/design/lld-nav-results.md §2, docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62, #158, #296

import { redirect, forbidden } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { loadOrgRetrievalSettings } from '@/lib/supabase/org-retrieval-settings';
import { isOrgAdmin, type MembershipRow } from '@/lib/supabase/membership';
import { PageHeader } from '@/components/ui/page-header';
import OrgContextForm from './org-context-form';
import RetrievalSettingsForm from './retrieval-settings-form';
import { AssessmentOverviewTable } from './assessment-overview-table';
import { loadOrgAssessmentsOverview } from './load-assessments';

const NEW_ASSESSMENT_CLASSES =
  'inline-flex items-center justify-center rounded-sm text-label font-medium transition-colors ' +
  'cursor-pointer bg-accent text-background hover:bg-accent-hover h-8 px-2.5';

const newAssessmentAction = (
  <Link href="/assessments/new" className={NEW_ASSESSMENT_CLASSES}>
    New Assessment
  </Link>
);

export default async function OrganisationPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const { data: membershipData } = await supabase
    .from('user_organisations')
    .select('org_id, github_role')
    .eq('user_id', user.id)
    .eq('org_id', orgId);

  if (!isOrgAdmin((membershipData ?? []) as MembershipRow[])) forbidden();

  const [context, retrievalSettings, assessments] = await Promise.all([
    loadOrgPromptContext(supabase, orgId),
    loadOrgRetrievalSettings(supabase, orgId),
    loadOrgAssessmentsOverview(supabase, orgId),
  ]);

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Organisation"
        subtitle="Manage assessments and context settings"
        action={newAssessmentAction}
      />
      {AssessmentOverviewTable({ assessments })}
      <OrgContextForm orgId={orgId} initial={context ?? {}} />
      <RetrievalSettingsForm orgId={orgId} initial={retrievalSettings} />
    </div>
  );
}
