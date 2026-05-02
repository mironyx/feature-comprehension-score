// Authenticated layout — wraps all authenticated pages with navigation bar.
// Redirects unauthenticated users and those without an org selected.
// Design reference: docs/design/frontend-system.md § Layout Shell
// Issue: #62, #165

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { getOrgRole } from '@/lib/supabase/membership';
import { NavBar } from '@/components/nav-bar';
import { BreadcrumbsBar } from '@/components/breadcrumbs-bar';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface AuthenticatedLayoutProps {
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches the current org and the list of orgs the user is a member of, in parallel.
 * Membership is read here only to power the org switcher; role derivation goes through
 * `getOrgRole` (membership kernel) so Repo Admins are recognised.
 */
async function fetchOrgContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  orgId: string,
): Promise<{ currentOrg: OrgRow | null; allOrgs: OrgRow[] }> {
  const [{ data: currentOrgData }, { data: memberships }] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('user_organisations').select('org_id').eq('user_id', userId),
  ]);

  const otherOrgIds = (memberships ?? [])
    .filter((m) => m.org_id !== orgId)
    .map((m) => m.org_id);

  const { data: otherOrgs } = otherOrgIds.length > 0
    ? await supabase.from('organisations').select('*').in('id', otherOrgIds)
    : { data: [] as OrgRow[] };

  const allOrgs = [
    ...(currentOrgData ? [currentOrgData as OrgRow] : []),
    ...(otherOrgs ?? []),
  ];

  return { currentOrg: currentOrgData, allOrgs };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default async function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);

  if (!orgId) {
    redirect('/org-select');
  }

  const username = String(user.user_metadata['user_name'] ?? user.email ?? '');
  const [{ currentOrg, allOrgs }, role] = await Promise.all([
    fetchOrgContext(supabase, user.id, orgId),
    getOrgRole(supabase, user.id, orgId),
  ]);

  if (!currentOrg) {
    redirect('/org-select');
  }

  const isAdminOrRepoAdmin = role !== null;

  return (
    <div>
      <NavBar
        username={username}
        isAdminOrRepoAdmin={isAdminOrRepoAdmin}
        currentOrg={currentOrg}
        allOrgs={allOrgs}
      />
      <BreadcrumbsBar />
      <main className="mx-auto w-full max-w-page px-content-pad-sm md:px-content-pad py-section-gap">{children}</main>
    </div>
  );
}
