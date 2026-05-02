// Root redirect — role-aware and last-visited-project-aware.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.3
// Requirements reference: docs/requirements/v11-requirements.md § Story 4.4, 4.6
// Issue: #434

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { AdminRootRedirect } from './admin-root-redirect';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const role = await getOrgRole(supabase, user.id, orgId);
  if (!role) redirect('/assessments');

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', orgId);

  return <AdminRootRedirect projectIds={(projects ?? []).map((p) => p.id)} />;
}
