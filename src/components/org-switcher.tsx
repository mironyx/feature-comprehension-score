'use client';

import { useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDismissEffect } from '@/hooks/use-dismiss-effect';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Row'];

interface OrgSwitcherProps {
  readonly currentOrg: OrgRow;
  readonly allOrgs: readonly OrgRow[];
}

interface OrgPickerDropdownProps {
  readonly allOrgs: readonly OrgRow[];
  readonly currentOrg: OrgRow;
  readonly onClose: () => void;
}

export function OrgPickerDropdown({ allOrgs, currentOrg, onClose }: OrgPickerDropdownProps) {
  return (
    <ul
      role="listbox"
      className="absolute right-0 top-full mt-1 min-w-[180px] rounded-md border border-border bg-surface-raised shadow-md z-50 py-1"
    >
      {allOrgs.map((org) => (
        <li key={org.id} role="option" aria-selected={org.id === currentOrg.id} aria-current={org.id === currentOrg.id ? 'true' : undefined}>
          {org.id === currentOrg.id ? (
            <button
              onClick={onClose}
              className="block w-full px-3 py-1.5 text-left text-label font-medium text-accent hover:bg-surface-hover"
            >
              {org.github_org_name}
            </button>
          ) : (
            <a
              href={`/api/org-select?orgId=${org.id}`}
              className="block px-3 py-1.5 text-label text-text-primary hover:bg-surface-hover"
            >
              {org.github_org_name}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function OrgSwitcher({ currentOrg, allOrgs }: OrgSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismissEffect(containerRef, setIsOpen);
  if (allOrgs.length <= 1) {
    return <span className="text-label text-text-secondary">{currentOrg.github_org_name}</span>;
  }
  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        triggerRef.current?.focus();
        setIsOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        aria-label="Switch organisation"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 text-label text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      >
        {currentOrg.github_org_name}
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <OrgPickerDropdown
          allOrgs={allOrgs}
          currentOrg={currentOrg}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
