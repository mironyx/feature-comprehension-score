// Org selection page — shown to multi-org users after sign-in.
// Single-org users are auto-redirected (cookie set via /api/org-select).
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';
import { NonMemberEmptyState } from './NonMemberEmptyState';

type OrgRow = Database['public']['Tables']['organisations']['Row'];
type UserOrgRow = Database['public']['Tables']['user_organisations']['Row'];

interface UserOrgWithOrg {
  membership: UserOrgRow;
  org: OrgRow;
}

export default async function OrgSelectPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  // Two separate queries to avoid untyped nested-select casts.
  const { data: memberships } = await supabase
    .from('user_organisations')
    .select('*')
    .eq('user_id', user.id);

  const orgIds = (memberships ?? []).map((m) => m.org_id);

  const { data: orgsData } = orgIds.length > 0
    ? await supabase.from('organisations').select('*').in('id', orgIds)
    : { data: [] as OrgRow[] };

  const userOrgs: UserOrgWithOrg[] = (memberships ?? []).flatMap((membership) => {
    const org = (orgsData ?? []).find((o) => o.id === membership.org_id);
    return org ? [{ membership, org }] : [];
  });

  if (userOrgs.length === 1 && userOrgs[0]) {
    // Route through the API so the fcs-org-id cookie is set before landing on assessments.
    redirect(`/api/org-select?orgId=${userOrgs[0].org.id}`);
  }

  if (userOrgs.length === 0) {
    return <NonMemberEmptyState />;
  }

  return (
    <main>
      <h1>Select Organisation</h1>
      <ul>
        {userOrgs.map(({ membership, org }) => (
          <li key={membership.org_id}>
            <span>{org.github_org_name}</span>
            <a href={`/api/org-select?orgId=${membership.org_id}`}>Select</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
