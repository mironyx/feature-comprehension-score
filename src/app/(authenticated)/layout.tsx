// Authenticated layout — wraps all authenticated pages with navigation bar.
// Redirects unauthenticated users and those without an org selected.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { NavBar } from '@/components/nav-bar';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];
type MembershipRow = Pick<Database['public']['Tables']['user_organisations']['Row'], 'org_id' | 'github_role'>;

interface AuthenticatedLayoutProps {
  readonly children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches the current org and all user memberships in parallel.
 * Uses two independent queries so neither blocks the other.
 */
async function fetchOrgContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  orgId: string,
): Promise<{ currentOrg: OrgRow | null; memberships: MembershipRow[]; allOrgs: OrgRow[] }> {
  const [{ data: currentOrgData }, { data: memberships }] = await Promise.all([
    supabase.from('organisations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('user_organisations').select('org_id, github_role').eq('user_id', userId),
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

  return { currentOrg: currentOrgData, memberships: memberships ?? [], allOrgs };
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
  const { currentOrg, memberships, allOrgs } = await fetchOrgContext(supabase, user.id, orgId);

  if (!currentOrg) {
    redirect('/org-select');
  }

  const membership = memberships.find((m) => m.org_id === orgId);
  const isAdmin = membership?.github_role === 'admin';

  return (
    <div>
      <NavBar
        username={username}
        isAdmin={isAdmin}
        currentOrg={currentOrg}
        allOrgs={allOrgs}
      />
      <main>{children}</main>
    </div>
  );
}
