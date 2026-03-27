// Top navigation bar — role-conditional links, org switcher, user menu.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.6
// Issue: #62

import Link from 'next/link';
import { OrgSwitcher } from './org-switcher';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface NavBarProps {
  readonly username: string;
  readonly isAdmin: boolean;
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
}

export function NavBar({ username, isAdmin, currentOrg, allOrgs }: NavBarProps) {
  return (
    <nav>
      <Link href="/assessments">FCS</Link>
      <OrgSwitcher currentOrg={currentOrg} allOrgs={allOrgs} />
      <ul>
        <li>
          <Link href="/assessments">My Assessments</Link>
        </li>
        {isAdmin && (
          <li>
            <Link href="/organisation">Organisation</Link>
          </li>
        )}
        {isAdmin && (
          <li>
            <Link href="/repos">Repositories</Link>
          </li>
        )}
      </ul>
      <span>{username}</span>
      <a href="/auth/sign-out">Sign out</a>
    </nav>
  );
}
