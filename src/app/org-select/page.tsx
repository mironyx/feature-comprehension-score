// Org selection page — shown to multi-org users after sign-in.
// Single-org users are auto-redirected to /assessments.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface UserOrgWithOrg {
  org_id: string;
  github_role: string;
  organisations: OrgRow;
}

export default async function OrgSelectPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/sign-in');
  }

  const { data: userOrgs } = await supabase
    .from('user_organisations')
    .select('org_id, github_role, organisations(*)')
    .eq('user_id', user.id);

  const orgs = (userOrgs ?? []) as unknown as UserOrgWithOrg[];

  if (orgs.length === 1) {
    redirect('/assessments');
  }

  if (orgs.length === 0) {
    return (
      <main>
        <h1>Select Organisation</h1>
        <p>No organisations found. Ask your organisation admin to install the app.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Select Organisation</h1>
      <ul>
        {orgs.map(({ org_id, organisations: org }) => (
          <li key={org_id}>
            <span>{org.github_org_name}</span>
            <a href={`/api/org-select?orgId=${org_id}`}>Select</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
