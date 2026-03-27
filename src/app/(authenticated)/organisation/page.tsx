// Organisation overview page — admin-only.
// Non-admins see a 403 Forbidden response inline.
// Auth and orgId are enforced by the (authenticated) layout before this page renders.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import type { Database } from '@/lib/supabase/types';

type MembershipRow = Pick<Database['public']['Tables']['user_organisations']['Row'], 'org_id' | 'github_role'>;

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function ForbiddenPage() {
  return (
    <main>
      <h1>403 Forbidden</h1>
      <p>You do not have permission to view this page.</p>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OrganisationPage() {
  const supabase = await createServerSupabaseClient();
  // getUser() needed for user.id in the admin check query.
  // Auth redirect is already handled by the (authenticated) layout;
  // the guard below is a defensive fallback only.
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

  if (!isAdmin) {
    return ForbiddenPage();
  }

  return (
    <main>
      <h1>Organisation</h1>
    </main>
  );
}
