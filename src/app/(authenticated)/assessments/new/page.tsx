// New assessment page — admin-only form to create an FCS assessment.
// Issue: #121

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isOrgAdmin } from '@/lib/supabase/membership';
import type { MembershipRow } from '@/lib/supabase/membership';
import { PageHeader } from '@/components/ui/page-header';
import CreateAssessmentForm from './create-assessment-form';
import type { Database } from '@/lib/supabase/types';

type RepoRow = Pick<Database['public']['Tables']['repositories']['Row'], 'id' | 'github_repo_name'>;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAdminRepos(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  orgId: string,
): Promise<{ isAdmin: boolean; repos: RepoRow[] }> {
  const [{ data: membership }, { data: repos }] = await Promise.all([
    supabase
      .from('user_organisations')
      .select('github_role')
      .eq('user_id', userId)
      .eq('org_id', orgId),
    supabase
      .from('repositories')
      .select('id, github_repo_name')
      .eq('org_id', orgId)
      .order('github_repo_name'),
  ]);

  return { isAdmin: isOrgAdmin((membership ?? []) as MembershipRow[]), repos: (repos ?? []) as RepoRow[] };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewAssessmentPage() {
  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { isAdmin, repos } = await fetchAdminRepos(supabase, user.id, orgId);
  if (!isAdmin) redirect('/assessments');

  return (
    <div className="space-y-section-gap">
      <PageHeader title="New Assessment" subtitle="Create an FCS assessment for your team" />
      <CreateAssessmentForm orgId={orgId} repositories={repos} />
    </div>
  );
}
