// Organisation settings page — admin-only.
// Non-admins see a 403 Forbidden response inline.
// Auth and orgId are enforced by the (authenticated) layout before this page renders.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62, #158

import { redirect, forbidden } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { loadOrgPromptContext } from '@/lib/supabase/org-prompt-context';
import { loadOrgThresholds } from '@/lib/supabase/org-thresholds';
import { PageHeader } from '@/components/ui/page-header';
import OrgContextForm from './org-context-form';
import OrgThresholdsForm from './org-thresholds-form';
import type { Database } from '@/lib/supabase/types';

type MembershipRow = Pick<Database['public']['Tables']['user_organisations']['Row'], 'org_id' | 'github_role'>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OrganisationPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const { data } = await supabase
    .from('user_organisations')
    .select('org_id, github_role')
    .eq('user_id', user.id)
    .eq('org_id', orgId);

  const membership = (data ?? []) as MembershipRow[];
  const isAdmin = membership.length > 0 && membership[0]?.github_role === 'admin';

  if (!isAdmin) forbidden();

  const context = await loadOrgPromptContext(supabase, orgId);
  const thresholds = await loadOrgThresholds(supabase, orgId);

  return (
    <div className="space-y-section-gap">
      <PageHeader
        title="Organisation"
        subtitle="Manage assessment context settings"
      />
      <OrgContextForm orgId={orgId} initial={context ?? {}} />
      <OrgThresholdsForm orgId={orgId} initial={thresholds} />
    </div>
  );
}
