// MobileNavMenu — hamburger menu for mobile viewports (< 768px).
// Design reference: docs/design/lld-v7-frontend-ux.md § T7
// Issue: #346

'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { OrgSwitcher } from './org-switcher';
import { SignOutButton } from './sign-out-button';
import { useDismissEffect } from '@/hooks/use-dismiss-effect';
import type { NavLink } from './nav-links';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface MobileNavMenuProps {
  readonly links: readonly NavLink[];
  readonly username: string;
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
}

interface PanelProps {
  readonly links: readonly NavLink[];
  readonly username: string;
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
  readonly onClose: () => void;
}

function MobilePanel({ links, username, currentOrg, allOrgs, onClose }: PanelProps) {
  return (
    <div className="absolute left-0 right-0 top-[52px] flex flex-col gap-4 border-b border-border bg-background px-content-pad-sm py-4">
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onClose}
              className="text-label text-text-secondary hover:text-text-primary"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <OrgSwitcher currentOrg={currentOrg} allOrgs={allOrgs} />
      <span className="text-label text-text-secondary">{username}</span>
      <SignOutButton />
    </div>
  );
}

export function MobileNavMenu({ links, username, currentOrg, allOrgs }: MobileNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissEffect(menuRef, setIsOpen);
  const close = () => setIsOpen(false);
  return (
    <div ref={menuRef} className="md:hidden">
      <button
        type="button"
        aria-label="Toggle menu"
        onClick={() => setIsOpen((prev) => !prev)}
        className="text-text-secondary hover:text-text-primary"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>
      {isOpen && (
        <MobilePanel
          links={links}
          username={username}
          currentOrg={currentOrg}
          allOrgs={allOrgs}
          onClose={close}
        />
      )}
    </div>
  );
}
