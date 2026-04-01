// Top navigation bar — role-conditional links, org switcher, user menu.
// Design reference: docs/design/frontend-system.md § Layout Shell
// Issue: #62, #165

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
    <nav className="sticky top-0 z-50 flex h-[52px] items-center gap-6 border-b border-border bg-background px-content-pad-sm md:px-content-pad">
      <Link href="/assessments" className="font-display text-heading-md text-accent">
        FCS
      </Link>
      <ul className="flex items-center gap-4">
        <li>
          <Link href="/assessments" className="text-label text-text-secondary hover:text-accent">
            My Assessments
          </Link>
        </li>
        {isAdmin && (
          <li>
            <Link href="/organisation" className="text-label text-text-secondary hover:text-accent">
              Organisation
            </Link>
          </li>
        )}
      </ul>
      <div className="ml-auto flex items-center gap-4">
        <OrgSwitcher currentOrg={currentOrg} allOrgs={allOrgs} />
        <span className="text-label text-text-secondary">{username}</span>
        <form method="POST" action="/auth/sign-out">
          <button type="submit" className="text-label text-text-secondary hover:text-accent">
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
