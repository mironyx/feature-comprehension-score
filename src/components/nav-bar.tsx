// Top navigation bar — role-conditional links, org switcher, user menu.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1
// Issue: #62, #165, #341, #346, #432

import Link from 'next/link';
import { OrgSwitcher } from './org-switcher';
import { NavLinks, type NavLink } from './nav-links';
import { ThemeToggle } from './theme-toggle';
import { MobileNavMenu } from './mobile-nav-menu';
import { SignOutButton } from './sign-out-button';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface NavBarProps {
  readonly username: string;
  readonly isAdminOrRepoAdmin: boolean;
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
}

const PROJECTS_LINK: NavLink = {
  href: '/projects',
  label: 'Projects',
  matchPrefix: '/projects',
};

const MEMBER_ASSESSMENTS_LINK: NavLink = {
  href: '/assessments',
  label: 'My Assessments',
  matchPrefix: '/assessments',
};

const ORGANISATION_LINK: NavLink = {
  href: '/organisation',
  label: 'Organisation',
  matchPrefix: '/organisation',
};

export function NavBar({ username, isAdminOrRepoAdmin, currentOrg, allOrgs }: NavBarProps) {
  // #438: admins are also assessment participants — they need My Assessments between Projects and Organisation
  const links: NavLink[] = isAdminOrRepoAdmin
    ? [PROJECTS_LINK, MEMBER_ASSESSMENTS_LINK, ORGANISATION_LINK]
    : [MEMBER_ASSESSMENTS_LINK];
  const logoHref = isAdminOrRepoAdmin ? '/projects' : '/assessments';
  return (
    <nav className="sticky top-0 z-50 flex h-[52px] items-center gap-6 border-b border-border bg-background px-content-pad-sm md:px-content-pad">
      <Link href={logoHref} className="font-display text-heading-md text-accent">
        FCS
      </Link>
      <div className="hidden md:contents">
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-4">
          <OrgSwitcher currentOrg={currentOrg} allOrgs={allOrgs} />
          <ThemeToggle />
          <span className="text-label text-text-secondary">{username}</span>
          <SignOutButton />
        </div>
      </div>
      <div className="ml-auto md:hidden">
        <MobileNavMenu links={links} username={username} currentOrg={currentOrg} allOrgs={allOrgs} />
      </div>
    </nav>
  );
}
