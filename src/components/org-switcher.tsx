// Header org switcher — shows current org and links to /org-select.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface OrgSwitcherProps {
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
}

export function OrgSwitcher({ currentOrg, allOrgs }: OrgSwitcherProps) {
  if (allOrgs.length <= 1) {
    return <span>{currentOrg.github_org_name}</span>;
  }

  return (
    <div>
      <span>{currentOrg.github_org_name}</span>
      <ul>
        {allOrgs
          .filter((org) => org.id !== currentOrg.id)
          .map((org) => (
            <li key={org.id}>
              <a href={`/api/org-select?orgId=${org.id}`}>{org.github_org_name}</a>
            </li>
          ))}
        <li>
          <a href="/org-select">All organisations</a>
        </li>
      </ul>
    </div>
  );
}
