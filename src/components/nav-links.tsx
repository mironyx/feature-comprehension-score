// NavLinks — client component rendering nav links with active-route highlighting.
// Design reference: docs/design/lld-v7-frontend-ux.md § T2
// Issue: #341

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  readonly href: string;
  readonly label: string;
  readonly matchPrefix: string;
}

interface NavLinksProps {
  readonly links: readonly NavLink[];
}

const ACTIVE_CLASS = 'text-label text-accent border-b-2 border-accent';
const INACTIVE_CLASS = 'text-label text-text-secondary hover:text-text-primary';

function isActive(pathname: string, matchPrefix: string): boolean {
  return pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`);
}

export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-4">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className={isActive(pathname, link.matchPrefix) ? ACTIVE_CLASS : INACTIVE_CLASS}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
